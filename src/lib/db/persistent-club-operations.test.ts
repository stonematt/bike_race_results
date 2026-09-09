import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import * as schema from './schema.ts';
import { migrationsFolder } from './testing.ts';

/** A temporary migration folder ending before the D3 persistence migration. */
function migrationsThrough(indexExclusive: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'persistent-club-operations-'));
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const entries = journal.entries.filter((entry) => entry.idx < indexExclusive);

  fs.mkdirSync(path.join(dir, 'meta'));
  fs.writeFileSync(
    path.join(dir, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries) {
    fs.copyFileSync(
      path.join(migrationsFolder, `${entry.tag}.sql`),
      path.join(dir, `${entry.tag}.sql`),
    );
  }
  return dir;
}

it('backfills a legacy coach with an adapter user as a coach membership only', async () => {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: migrationsThrough(7) });

  const [club] = await db.insert(schema.club).values({ name: 'Pine Club' }).returning();
  const [user] = await db.insert(schema.users).values({ email: 'coach@example.org' }).returning();
  await db.insert(schema.coach).values({
    userId: user!.id,
    clubId: club!.id,
    displayName: 'Coach',
  });
  // `coach` predates an adapter-user foreign key. Upgrade must not invent one.
  await db.insert(schema.coach).values({
    userId: 'orphaned-legacy-user',
    clubId: club!.id,
    displayName: 'Orphaned',
  });

  await migrate(db, { migrationsFolder });

  expect(await db.select().from(schema.clubMembership)).toEqual([
    expect.objectContaining({ clubId: club!.id, userId: user!.id, role: 'coach', revokedAt: null }),
  ]);
});

it('lets an explicit bootstrap appoint a backfilled coach when the upgraded club has no admin', async () => {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: migrationsThrough(7) });

  const [club] = await db.insert(schema.club).values({ name: 'Pine Club' }).returning();
  const [user] = await db.insert(schema.users).values({ email: 'coach@example.org' }).returning();
  await db.insert(schema.coach).values({
    userId: user!.id,
    clubId: club!.id,
    displayName: 'Coach',
  });

  await migrate(db, { migrationsFolder });
  const { seedAdmin } = await import('../seed.ts');
  await seedAdmin(db, {
    email: 'coach@example.org',
    clubName: club!.name,
    env: { AUTH_ALLOWED_EMAILS: 'coach@example.org' },
  });

  expect(await db.select().from(schema.clubMembership)).toEqual([
    expect.objectContaining({ clubId: club!.id, userId: user!.id, role: 'admin', revokedAt: null }),
  ]);
});
