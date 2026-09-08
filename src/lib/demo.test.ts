import { loadSquadNavigation } from './db/editorial-query.ts';
import { loadStoryCandidate } from './editorial-evidence.ts';
/**
 * The public D1 bootstrap seam: a persistent PGlite demo is only useful if
 * its own reporting reads continue to work after the process restarts.
 */

import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveCurrentSeason } from '../app/[season]/query.ts';
import { listRaces, loadRaceDetail } from '../app/races/[eventId]/query.ts';
import { bootstrapSafeDemo, DEMO_COACH_EMAIL, UnsafeDemoDatabaseError } from './demo.ts';
import { createSquad } from './club-operations.ts';
import { migrationsFolder } from './db/testing.ts';
import * as schema from './db/schema.ts';

const directories: string[] = [];
const run = promisify(execFile);

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true })),
  );
});

async function openDemoDatabase(directory: string) {
  const client = new PGlite(directory);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { client, db };
}

async function migrationsThrough0004(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-migrations-'));
  directories.push(directory);
  await fs.cp(migrationsFolder, directory, { recursive: true });
  await fs.rm(path.join(directory, '0005_conference_scoped_race_result.sql'));
  await fs.rm(path.join(directory, '0006_high_wiccan.sql'));
  const journalPath = path.join(directory, 'meta', '_journal.json');
  const journal = JSON.parse(await fs.readFile(journalPath, 'utf8')) as {
    entries: Array<{ idx: number }>;
  };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 4);
  await fs.writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  return directory;
}

async function migrationsThrough0006(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-migrations-'));
  directories.push(directory);
  await fs.cp(migrationsFolder, directory, { recursive: true });
  await fs.rm(path.join(directory, '0007_persistent_club_operations.sql'));
  const journalPath = path.join(directory, 'meta', '_journal.json');
  const journal = JSON.parse(await fs.readFile(journalPath, 'utf8')) as {
    entries: Array<{ idx: number }>;
  };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 6);
  await fs.writeFile(
    journalPath,
    `${JSON.stringify(journal, null, 2)}
`,
  );
  return directory;
}

function commandFailureText(error: unknown): string {
  const failure = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
  return [failure.stdout, failure.stderr, failure.message]
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
}

describe('bootstrapSafeDemo', () => {
  it('refuses an unknown populated table before the demo command migrates it', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-legacy-'));
    directories.push(directory);
    const existing = new PGlite(directory);
    await existing.exec(`
      create table legacy_rider (id integer primary key, label text not null);
      insert into legacy_rider (id, label) values (1, 'existing rider');
    `);
    await existing.close();

    const failure = await run(process.execPath, ['bin/demo.ts'], {
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: { ...process.env, DATABASE_URL: directory },
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).not.toBeNull();
    expect(commandFailureText(failure)).toContain('Refusing to seed a populated database');

    const reopened = new PGlite(directory);
    expect(
      await reopened.query<{ label: string }>('select label from legacy_rider order by id'),
    ).toEqual({ rows: [{ label: 'existing rider' }], fields: expect.any(Array), affectedRows: 0 });
    expect(
      await reopened.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'public' order by tablename",
      ),
    ).toMatchObject({ rows: [{ tablename: 'legacy_rider' }] });
    expect(
      await reopened.query<{ migration_table: string | null }>(
        "select to_regclass('public.__drizzle_migrations') as migration_table",
      ),
    ).toMatchObject({ rows: [{ migration_table: null }] });
    await reopened.close();
  }, 60_000);

  it.each([
    ['existing_app', 'a populated non-public schema'],
    ['drizzle', 'a drizzle table other than its migration journal'],
  ])(
    'refuses data in %s before migration (%s)',
    async (schemaName) => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-schema-'));
      directories.push(directory);
      const existing = new PGlite(directory);
      await existing.exec(`
      create schema ${schemaName};
      create table ${schemaName}.records (id integer primary key, label text not null);
      insert into ${schemaName}.records (id, label) values (1, 'existing record');
    `);
      const beforeTables = await existing.query<{ schemaname: string; tablename: string }>(
        "select schemaname, tablename from pg_tables where schemaname in ('public', $1) order by schemaname, tablename",
        [schemaName],
      );
      await existing.close();

      const failure = await run(process.execPath, ['bin/demo.ts'], {
        cwd: path.resolve(import.meta.dirname, '../..'),
        env: { ...process.env, DATABASE_URL: directory },
      }).then(
        () => null,
        (error: unknown) => error,
      );

      expect(failure).not.toBeNull();
      expect(commandFailureText(failure)).toContain('Refusing to seed a populated database');

      const reopened = new PGlite(directory);
      expect(
        await reopened.query<{ schemaname: string; tablename: string }>(
          "select schemaname, tablename from pg_tables where schemaname in ('public', $1) order by schemaname, tablename",
          [schemaName],
        ),
      ).toEqual(beforeTables);
      expect(
        await reopened.query<{ label: string }>(
          `select label from ${schemaName}.records order by id`,
        ),
      ).toMatchObject({ rows: [{ label: 'existing record' }] });
      expect(
        await reopened.query<{ migration_table: string | null }>(
          "select to_regclass('drizzle.__drizzle_migrations') as migration_table",
        ),
      ).toMatchObject({ rows: [{ migration_table: null }] });
      await reopened.close();
    },
    60_000,
  );

  it('preserves a populated 0004 application database and its migration history', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-app-legacy-'));
    directories.push(directory);
    const legacyMigrations = await migrationsThrough0004();

    const existing = new PGlite(directory);
    const legacyDb = drizzle(existing, { schema });
    await migrate(legacyDb, { migrationsFolder: legacyMigrations });
    await legacyDb.insert(schema.season).values({ year: 2030 });
    const beforeTables = await existing.query<{ schemaname: string; tablename: string }>(
      "select schemaname, tablename from pg_tables where schemaname in ('drizzle', 'public') order by schemaname, tablename",
    );
    const beforeJournal = await existing.query<{ hash: string; created_at: string }>(
      'select hash, created_at from drizzle.__drizzle_migrations order by created_at',
    );
    const beforeSeasons = await existing.query<{ year: number }>(
      'select year from season order by year',
    );
    await existing.close();

    const failure = await run(process.execPath, ['bin/demo.ts'], {
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: { ...process.env, DATABASE_URL: directory },
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).not.toBeNull();
    expect(commandFailureText(failure)).toContain('Refusing to seed a populated database');

    const reopened = new PGlite(directory);
    expect(
      await reopened.query<{ schemaname: string; tablename: string }>(
        "select schemaname, tablename from pg_tables where schemaname in ('drizzle', 'public') order by schemaname, tablename",
      ),
    ).toEqual(beforeTables);
    expect(
      await reopened.query<{ hash: string; created_at: string }>(
        'select hash, created_at from drizzle.__drizzle_migrations order by created_at',
      ),
    ).toEqual(beforeJournal);
    expect(await reopened.query<{ year: number }>('select year from season order by year')).toEqual(
      beforeSeasons,
    );
    await reopened.close();
  }, 60_000);

  it('migrates and reruns a recognized demo created at 0004', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-known-legacy-'));
    directories.push(directory);
    const legacy = new PGlite(directory);
    const legacyDb = drizzle(legacy, { schema });
    await migrate(legacyDb, { migrationsFolder: await migrationsThrough0004() });
    await bootstrapSafeDemo(legacyDb);
    await legacy.close();

    const result = await run(process.execPath, ['bin/demo.ts'], {
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: { ...process.env, DATABASE_URL: directory },
    });

    expect(result.stdout).toContain(
      'Synthetic demo database is ready; existing configuration preserved.',
    );
    const reopened = new PGlite(directory);
    expect(
      await reopened.query<{ event_result_source: string | null }>(
        "select to_regclass('public.event_result_source') as event_result_source",
      ),
    ).toMatchObject({ rows: [{ event_result_source: 'event_result_source' }] });
    await reopened.close();
  }, 60_000);

  it('appoints the demo coach after a recognized 0006 upgrade', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-known-0006-'));
    directories.push(directory);
    const legacy = new PGlite(directory);
    const legacyDb = drizzle(legacy, { schema });
    await migrate(legacyDb, { migrationsFolder: await migrationsThrough0006() });
    await bootstrapSafeDemo(legacyDb);
    await legacy.close();

    await run(process.execPath, ['bin/demo.ts'], {
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: { ...process.env, DATABASE_URL: directory },
    });

    const reopened = new PGlite(directory);
    expect(
      await reopened.query<{ user_id: string; role: string; revoked_at: Date | null }>(
        'select user_id, role, revoked_at from club_membership order by user_id',
      ),
    ).toMatchObject({ rows: [{ user_id: expect.any(String), role: 'admin', revoked_at: null }] });
    await reopened.close();
  }, 60_000);

  it('advances explicit fixture sequences after a recognized 0006 upgrade', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-sequences-0006-'));
    directories.push(directory);
    const legacy = new PGlite(directory);
    const legacyDb = drizzle(legacy, { schema });
    await migrate(legacyDb, { migrationsFolder: await migrationsThrough0006() });
    const seeded = await bootstrapSafeDemo(legacyDb);
    // Existing 0006 demos were seeded before the sequence repair. Model the
    // persisted initial sequence value while preserving their exact row data.
    await legacyDb.execute(sql`select setval(pg_get_serial_sequence('squad', 'id'), 1, false)`);
    await legacy.close();

    await run(process.execPath, ['bin/demo.ts'], {
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: { ...process.env, DATABASE_URL: directory },
    });

    const upgraded = await openDemoDatabase(directory);
    await expect(
      createSquad(upgraded.db, {
        actorId: seeded.userId,
        clubId: 1,
        seasonId: 2,
        name: 'Maple',
      }),
    ).resolves.toEqual({ id: 4, slug: 'maple' });
    await upgraded.client.close();
  }, 60_000);

  it('creates and reruns the synthetic demo command on its own database', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-command-'));
    directories.push(directory);
    const options = {
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: { ...process.env, DATABASE_URL: directory },
    };

    expect((await run(process.execPath, ['bin/demo.ts'], options)).stdout).toContain(
      'Created the synthetic demo database.',
    );
    expect((await run(process.execPath, ['bin/demo.ts'], options)).stdout).toContain(
      'Synthetic demo database is ready; existing configuration preserved.',
    );
  }, 60_000);

  it('provides a source-bound five-rider story candidate for the 2026 demo event', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-story-candidate-'));
    directories.push(directory);
    const demo = await openDemoDatabase(directory);
    const seeded = await bootstrapSafeDemo(demo.db);

    await expect(
      loadStoryCandidate(demo.db, {
        actorId: seeded.userId,
        clubId: 1,
        seasonId: 2,
        checkpointOrdinal: 1,
        eventId: 2,
      }),
    ).resolves.toMatchObject({
      kind: 'available',
      candidate: {
        count: 5,
        event: { sourceEventId: 'demo-2026-round-1' },
        source: {
          listId: 'demo-2026-individual-results',
          hidden: false,
          contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      },
    });
    await demo.client.close();
  });

  it('creates the demo coach as the active club admin', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-admin-'));
    directories.push(directory);
    const demo = await openDemoDatabase(directory);

    const created = await bootstrapSafeDemo(demo.db);

    expect(await demo.db.select().from(schema.clubMembership)).toEqual([
      expect.objectContaining({
        clubId: 1,
        userId: created.userId,
        role: 'admin',
        revokedAt: null,
      }),
    ]);
    expect(await bootstrapSafeDemo(demo.db)).toEqual({
      status: 'already-seeded',
      coachEmail: DEMO_COACH_EMAIL,
      userId: created.userId,
    });
    expect(await demo.db.select().from(schema.clubMembership)).toEqual([
      expect.objectContaining({
        clubId: 1,
        userId: created.userId,
        role: 'admin',
        revokedAt: null,
      }),
    ]);
    await demo.client.close();
  }, 60_000);

  it('advances explicit fixture sequences after an unchanged current-demo rerun', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'descenders-demo-sequences-current-'),
    );
    directories.push(directory);
    const current = await openDemoDatabase(directory);
    const seeded = await bootstrapSafeDemo(current.db);
    // Model a pre-fix current demo whose exact row signature is unchanged.
    await current.db.execute(sql`select setval(pg_get_serial_sequence('squad', 'id'), 1, false)`);
    await current.client.close();

    await run(process.execPath, ['bin/demo.ts'], {
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: { ...process.env, DATABASE_URL: directory },
    });

    const rerun = await openDemoDatabase(directory);
    await expect(
      createSquad(rerun.db, {
        actorId: seeded.userId,
        clubId: 1,
        seasonId: 2,
        name: 'Maple',
      }),
    ).resolves.toEqual({ id: 4, slug: 'maple' });
    await rerun.client.close();
  }, 60_000);

  it('creates a new squad after the demo’s explicit fixture IDs', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-new-squad-'));
    directories.push(directory);
    const demo = await openDemoDatabase(directory);
    const created = await bootstrapSafeDemo(demo.db);

    await expect(
      createSquad(demo.db, {
        actorId: created.userId,
        clubId: 1,
        seasonId: 2,
        name: 'Maple',
      }),
    ).resolves.toEqual({ id: 4, slug: 'maple' });
    await demo.client.close();
  }, 60_000);

  it('refuses a demo whose managed membership changed before migration', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'descenders-demo-managed-membership-'),
    );
    directories.push(directory);
    const demo = await openDemoDatabase(directory);
    const created = await bootstrapSafeDemo(demo.db);
    await demo.db
      .update(schema.clubMembership)
      .set({ role: 'coach' })
      .where(sql`club_id = 1 and user_id = ${created.userId}`);
    await demo.client.close();

    const failure = await run(process.execPath, ['bin/demo.ts'], {
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: { ...process.env, DATABASE_URL: directory },
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).not.toBeNull();
    expect(commandFailureText(failure)).toContain('Refusing to seed a populated database');

    const reopened = new PGlite(directory);
    expect(
      await reopened.query<{ role: string; revoked_at: Date | null }>(
        'select role, revoked_at from club_membership where club_id = 1 and user_id = $1',
        [created.userId],
      ),
    ).toMatchObject({ rows: [{ role: 'coach', revoked_at: null }] });
    await reopened.close();
  }, 60_000);

  it('keeps a synthetic current season and reporting reads intact across reopen and rerun', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-'));
    directories.push(directory);

    const first = await openDemoDatabase(directory);
    const created = await bootstrapSafeDemo(first.db);
    expect(created).toEqual({
      status: 'created',
      coachEmail: DEMO_COACH_EMAIL,
      userId: expect.any(String),
    });
    await first.client.close();

    const reopened = await openDemoDatabase(directory);
    const again = await bootstrapSafeDemo(reopened.db);
    expect(again).toEqual({
      status: 'already-seeded',
      coachEmail: DEMO_COACH_EMAIL,
      userId: created.userId,
    });

    const current = await resolveCurrentSeason(reopened.db);
    expect(current).toEqual({ id: expect.any(Number), year: 2026 });
    expect(await loadSquadNavigation(reopened.db, 1, current!.id, created.userId)).toMatchObject({
      personalSquad: null,
      squadSelection: 'choice-required',
      availableSquads: [{ name: 'Cedar' }, { name: 'Summit' }],
    });
    expect(await listRaces(reopened.db)).toEqual([
      {
        eventId: expect.any(Number),
        sourceEventId: 'demo-2026-round-1',
        name: 'Demo Race 1 — Old Oak',
        seasonYear: 2026,
        roundOrdinal: 1,
      },
      {
        eventId: expect.any(Number),
        sourceEventId: 'demo-2025-checkpoint',
        name: 'Demo Checkpoint — Race 2',
        seasonYear: 2025,
        roundOrdinal: 2,
      },
    ]);

    const report = await loadRaceDetail(reopened.db, 'demo-2026-round-1', 1, created.userId);
    expect(report?.squads.map((squad) => squad.name)).toEqual(['Cedar', 'Summit']);
    expect(report?.starters).toBe(5);
    await reopened.client.close();
  }, 60_000);

  it('refuses a populated database whose data is not this synthetic demo', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-existing-'));
    directories.push(directory);
    const existing = await openDemoDatabase(directory);
    await existing.db.insert(schema.season).values({ year: 2030 });

    await expect(bootstrapSafeDemo(existing.db)).rejects.toThrow(UnsafeDemoDatabaseError);
    expect(await resolveCurrentSeason(existing.db)).toEqual({ id: expect.any(Number), year: 2030 });
    await existing.client.close();
  }, 60_000);
});
