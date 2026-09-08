import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { and, eq, isNull } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createDatabaseRuntime } from './db/runtime.ts';
import * as schema from './db/schema.ts';
import { changeClubMembershipRole, revokeClubMembership } from './club-membership-operations.ts';

function safeTestUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'postgresql:' &&
      url.hostname === '127.0.0.1' &&
      url.port === '55432' &&
      url.username === 'd5_runtime' &&
      url.pathname === '/d5_runtime_tracer'
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

const postgresUrl = safeTestUrl(process.env.D5_TEST_DATABASE_URL);

async function waitForBlockedCommands(
  client: PoolClient,
  expectedCount: number,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // pg_stat_activity snapshots are stable within the control transaction;
    // refresh it so this is a real bounded lock observation, not a stale read.
    await client.query('select pg_stat_clear_snapshot()');
    const result = await client.query(
      "select count(*)::int as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
    );
    if (result.rows[0]?.count >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for both last-admin commands to block on the club row.');
}

it.skipIf(!postgresUrl)(
  'serializes mixed self-demotion and self-revocation so one active admin remains',
  async () => {
    const control = new Pool({ connectionString: postgresUrl, max: 1 });
    const first = createDatabaseRuntime(postgresUrl!);
    const second = createDatabaseRuntime(postgresUrl!);
    if (first.kind !== 'postgres' || second.kind !== 'postgres') {
      throw new Error('expected native PostgreSQL command runtimes');
    }
    const suffix = randomUUID();
    try {
      await migrate(first.db, { migrationsFolder: 'src/lib/db/migrations' });
      const [club] = await first.db
        .insert(schema.club)
        .values({ name: `Concurrent Club ${suffix}` })
        .returning();
      if (!club) throw new Error('synthetic club was not created');
      const firstAdmin = `first-${suffix}`;
      const secondAdmin = `second-${suffix}`;
      await first.db.insert(schema.users).values([
        { id: firstAdmin, email: `${firstAdmin}@example.test` },
        { id: secondAdmin, email: `${secondAdmin}@example.test` },
      ]);
      await first.db.insert(schema.clubMembership).values([
        { clubId: club.id, userId: firstAdmin, role: 'admin' },
        { clubId: club.id, userId: secondAdmin, role: 'admin' },
      ]);

      const client = await control.connect();
      try {
        await client.query('begin');
        await client.query('select id from club where id = $1 for update', [club.id]);
        const demotion = changeClubMembershipRole(first.db, {
          actorId: firstAdmin,
          clubId: club.id,
          userId: firstAdmin,
          role: 'coach',
        });
        await waitForBlockedCommands(client, 1);
        const revocation = revokeClubMembership(second.db, {
          actorId: secondAdmin,
          clubId: club.id,
          userId: secondAdmin,
        });
        await waitForBlockedCommands(client, 2);
        await client.query('commit');
        const outcomes = await Promise.allSettled([demotion, revocation]);
        expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
        expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      } finally {
        await client.query('rollback').catch(() => undefined);
        client.release();
      }

      const activeAdmins = await first.db
        .select({ userId: schema.clubMembership.userId })
        .from(schema.clubMembership)
        .where(
          and(
            eq(schema.clubMembership.clubId, club.id),
            eq(schema.clubMembership.role, 'admin'),
            isNull(schema.clubMembership.revokedAt),
          ),
        );
      expect(activeAdmins).toHaveLength(1);
      const audit = await first.db
        .select({ action: schema.clubAuditEvent.action })
        .from(schema.clubAuditEvent)
        .where(eq(schema.clubAuditEvent.clubId, club.id));
      expect(audit).toHaveLength(1);
    } finally {
      await Promise.all([first.close(), second.close(), control.end()]);
    }
  },
  20000,
);
