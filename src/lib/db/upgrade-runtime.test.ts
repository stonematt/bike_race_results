import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { expect, it } from 'vitest';
import { resolveSelectedClub } from '../authz/access.ts';
import { resolveSquadBySlug } from '../../app/[season]/query.ts';
import { createDatabaseRuntime, type DatabaseRuntime } from './runtime.ts';

const migrationsFolder = join(import.meta.dirname, 'migrations');
const postgresUrl = process.env.D5_TEST_DATABASE_URL;

async function migrate(runtime: DatabaseRuntime, folder: string): Promise<void> {
  if (runtime.kind === 'postgres') return migratePostgres(runtime.db, { migrationsFolder: folder });
  return migratePglite(runtime.db, { migrationsFolder: folder });
}

async function baselineMigrations(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'descenders-upgrade-migrations-'));
  await cp(migrationsFolder, folder, { recursive: true });
  await rm(join(folder, '0008_reviewed_editorial_stories.sql'));
  const path = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(path, 'utf8')) as { entries: { idx: number }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 7);
  await writeFile(path, JSON.stringify(journal));
  return folder;
}

for (const [kind, location] of [
  ['pglite', undefined],
  ['postgres', postgresUrl],
] as const) {
  it.skipIf(kind === 'postgres' && !location)(
    `upgrades ${kind} from 0007 while preserving synthetic identity and managed state`,
    async () => {
      const folder = await baselineMigrations();
      const directory =
        kind === 'pglite' ? await mkdtemp(join(tmpdir(), 'descenders-upgrade-db-')) : null;
      const databaseLocation = location ?? directory!;
      const suffix = randomUUID();
      const userId = `upgrade-${suffix}`;
      const clubName = `Upgrade Club ${suffix}`;
      const squadSlug = `retained-${suffix}`;
      const year = 2200 + Math.floor(Math.random() * 700);
      let runtime = createDatabaseRuntime(databaseLocation);
      try {
        await migrate(runtime, folder);
        const club = await runtime.db.execute(
          sql`insert into club (name, slug) values (${clubName}, ${squadSlug}) returning id`,
        );
        const clubId = Number(club.rows[0]?.id);
        const season = await runtime.db.execute(
          sql`insert into season (year) values (${year}) returning id`,
        );
        const seasonId = Number(season.rows[0]?.id);
        const squad = await runtime.db.execute(
          sql`insert into squad (club_id, season_id, name, slug) values (${clubId}, ${seasonId}, 'Retained', ${squadSlug}) returning id`,
        );
        const squadId = Number(squad.rows[0]?.id);
        await runtime.db.execute(
          sql`insert into "user" (id, email) values (${userId}, ${userId + '@example.test'})`,
        );
        await runtime.db.execute(
          sql`update squad set created_by_user_id = ${userId} where id = ${squadId}`,
        );
        await runtime.db.execute(
          sql`insert into club_membership (club_id, user_id, role) values (${clubId}, ${userId}, 'admin')`,
        );
        await runtime.db.execute(
          sql`insert into user_club_preference (user_id, club_id) values (${userId}, ${clubId})`,
        );
        await runtime.db.execute(
          sql`insert into user_squad_preference (user_id, club_id, season_id, squad_id) values (${userId}, ${clubId}, ${seasonId}, ${squadId})`,
        );
        await runtime.db.execute(
          sql`update squad set archived_at = '2040-01-01T00:00:00Z', archived_by_user_id = ${userId} where id = ${squadId}`,
        );
        await runtime.close();
        runtime = createDatabaseRuntime(databaseLocation);
        await migrate(runtime, migrationsFolder);
        expect(await resolveSelectedClub(runtime.db, userId)).toMatchObject({
          kind: 'selected',
          membership: { clubId, role: 'admin' },
        });
        expect(await resolveSquadBySlug(runtime.db, seasonId, squadSlug, clubId)).toMatchObject({
          id: squadId,
          name: 'Retained',
        });
      } finally {
        await runtime.close();
        await rm(folder, { recursive: true, force: true });
        if (directory) await rm(directory, { recursive: true, force: true });
      }
    },
    20000,
  );
}
