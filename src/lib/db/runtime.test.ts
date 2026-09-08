import { describe, expect, it, vi } from 'vitest';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readActiveMemberships } from '../authz/access.ts';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq, sql } from 'drizzle-orm';
import { migrationsFolder } from './testing.ts';
import * as schema from './schema.ts';
import {
  createDatabaseRuntime,
  type DatabaseRuntime,
  type RuntimeDatabase,
  type RuntimeTransaction,
} from './runtime.ts';

it('opens a migrated in-memory PGlite runtime with native typed builders', async () => {
  const runtime = createDatabaseRuntime('memory://');
  try {
    expect(runtime.kind).toBe('pglite');
    if (runtime.kind !== 'pglite') throw new Error('Expected the local runtime');
    await migrate(runtime.db, { migrationsFolder });
    const [club] = await runtime.db
      .insert(schema.club)
      .values({ name: 'Synthetic Runtime Club' })
      .returning({ id: schema.club.id });
    if (!club) throw new Error('Synthetic club absent');
    expect(
      await runtime.db
        .select({ name: schema.club.name })
        .from(schema.club)
        .where(eq(schema.club.id, club.id)),
    ).toEqual([{ name: 'Synthetic Runtime Club' }]);
  } finally {
    await runtime.close();
  }
});

it('constructs and closes a lazy PostgreSQL runtime without opening a connection', async () => {
  const runtime = createDatabaseRuntime('postgresql://127.0.0.1:1/d5_runtime_unreachable');
  try {
    expect(runtime.kind).toBe('postgres');
  } finally {
    await runtime.close();
  }
});

it.each([
  '',
  'https://example.invalid/database',
  'postgresql://',
  'postgresql://localhost/',
  'postgresql://localhost/db#fragment',
  'postgresql://user:bad%escape@localhost/db',
])('rejects an invalid location without disclosing it (case %#)', async (location) => {
  let runtime: DatabaseRuntime | undefined;
  try {
    expect(() => {
      runtime = createDatabaseRuntime(location);
    }).toThrow('Database location is invalid.');
  } finally {
    await runtime?.close().catch(() => undefined);
  }
});

// Explicit opt-in uses only the disposable harness. Public CI needs no server.
const postgresLocation = process.env.D5_TEST_DATABASE_URL;
if (postgresLocation) {
  let allowed = false;
  try {
    const location = new URL(postgresLocation);
    allowed =
      location.hostname === '127.0.0.1' &&
      location.port === '55432' &&
      location.pathname === '/d5_runtime_tracer' &&
      location.username === 'd5_runtime';
  } catch {
    /* Reject without logging the submitted connection string. */
  }
  if (!allowed) throw new Error('D5 database must be the dedicated loopback tracer cluster.');
}

async function migrateRuntime(runtime: DatabaseRuntime) {
  if (runtime.kind === 'postgres') await migratePostgres(runtime.db, { migrationsFolder });
  else await migrate(runtime.db, { migrationsFolder });
}

// This helper deliberately accepts both native database and transaction types.
// A driver cast here would conceal the application integration seam being proved.
async function addSyntheticAccount(db: RuntimeDatabase | RuntimeTransaction, id: string) {
  await db.insert(schema.users).values({ id, email: id + '@example.invalid' });
  return db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, id));
}

/**
 * The runtime discriminant is the composition boundary for native typed
 * builders: a union transaction callback would otherwise lose projected
 * `returning` overloads. No driver is cast to the other here.
 */
async function addSyntheticMembership(
  runtime: DatabaseRuntime,
  actorId: string,
  role: 'coach' | 'admin',
  clubName = 'Persistent Synthetic Club',
): Promise<number> {
  if (runtime.kind === 'pglite') {
    return runtime.db.transaction(async (tx) => {
      await addSyntheticAccount(tx, actorId);
      const [club] = await tx
        .insert(schema.club)
        .values({ name: clubName })
        .returning({ id: schema.club.id });
      if (!club) throw new Error('Synthetic club absent');
      await tx.insert(schema.clubMembership).values({ userId: actorId, clubId: club.id, role });
      return club.id;
    });
  }
  return runtime.db.transaction(async (tx) => {
    await addSyntheticAccount(tx, actorId);
    const [club] = await tx
      .insert(schema.club)
      .values({ name: clubName })
      .returning({ id: schema.club.id });
    if (!club) throw new Error('Synthetic club absent');
    await tx.insert(schema.clubMembership).values({ userId: actorId, clubId: club.id, role });
    return club.id;
  });
}

for (const [kind, location] of [
  ['pglite', 'memory://'],
  ['postgres', postgresLocation],
] as const) {
  describe(kind, () => {
    it.skipIf(location === undefined)(
      'rolls back rejected typed work and releases connections for later commands',
      async () => {
        const runtime = createDatabaseRuntime(location);
        try {
          await migrateRuntime(runtime);
          for (let attempt = 0; attempt < 6; attempt++) {
            const actorId = randomUUID();
            await expect(
              runtime.db.transaction(async (tx) => {
                await addSyntheticAccount(tx, actorId);
                throw new Error('Synthetic command rejected');
              }),
            ).rejects.toThrow('Synthetic command rejected');
            expect(
              await runtime.db
                .select({ id: schema.users.id })
                .from(schema.users)
                .where(eq(schema.users.id, actorId)),
            ).toEqual([]);
          }
          const committedId = randomUUID();
          expect(await addSyntheticAccount(runtime.db, committedId)).toEqual([{ id: committedId }]);
        } finally {
          await runtime.close();
        }
      },
    );

    it.skipIf(location === undefined)(
      'closes and reopens saved synthetic membership without reseeding',
      async () => {
        const directory =
          kind === 'pglite' ? await mkdtemp(join(tmpdir(), 'descenders-runtime-')) : null;
        const databaseLocation = directory ?? location;
        const actorId = randomUUID();
        let clubId = 0;
        try {
          const first = createDatabaseRuntime(databaseLocation);
          try {
            await migrateRuntime(first);
            clubId = await addSyntheticMembership(first, actorId, 'coach');
          } finally {
            await first.close();
          }
          const reopened = createDatabaseRuntime(databaseLocation);
          try {
            expect(await readActiveMemberships(reopened.db, actorId)).toEqual([
              { userId: actorId, clubId, clubName: 'Persistent Synthetic Club', role: 'coach' },
            ]);
          } finally {
            await reopened.close();
          }
        } finally {
          if (directory) await rm(directory, { recursive: true, force: true });
        }
      },
    );

    it.skipIf(location === undefined)(
      'migrates twice, commits typed account/membership builders and reads active authority',
      async () => {
        const runtime = createDatabaseRuntime(location);
        try {
          expect(runtime.kind).toBe(kind);
          await migrateRuntime(runtime);
          const actorId = randomUUID();
          const clubId = await addSyntheticMembership(
            runtime,
            actorId,
            'admin',
            'Synthetic Transport Club',
          );
          await migrateRuntime(runtime);
          expect(await readActiveMemberships(runtime.db, actorId)).toEqual([
            { userId: actorId, clubId, clubName: 'Synthetic Transport Club', role: 'admin' },
          ]);
        } finally {
          await runtime.close();
        }
      },
    );
  });
}

it.skipIf(!postgresLocation)(
  'handles an idle backend loss with a sanitized error and recovers on the next query',
  async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runtime = createDatabaseRuntime(postgresLocation);
    const control = createDatabaseRuntime(postgresLocation);
    try {
      const before = await runtime.db.execute(sql`select pg_backend_pid() as pid`);
      const pid = Number(before.rows[0]?.pid);
      expect(Number.isInteger(pid)).toBe(true);
      await control.db.execute(sql`select pg_terminate_backend(${pid})`);
      await vi.waitFor(
        () =>
          expect(reported).toHaveBeenCalledExactlyOnceWith(
            'Database background connection failed.',
          ),
        { timeout: 2000, interval: 20 },
      );
      expect((await runtime.db.execute(sql`select 7 as value`)).rows).toEqual([{ value: 7 }]);
    } finally {
      await runtime.close();
      await control.close();
      reported.mockRestore();
    }
  },
);
