import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it, vi } from 'vitest';
import { findOrCreateUser } from './lib/db/users.ts';

const postgresUrl = process.env.D5_TEST_DATABASE_URL;

it.skipIf(!postgresUrl)(
  'uses one native Postgres runtime for Auth.js and reporting identity reads',
  async () => {
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', postgresUrl!);
    vi.stubEnv('AUTH_SECRET', 'synthetic-test-secret-at-least-thirty-two-characters');
    const { appDb, appRuntime } = await import('./app/db.ts');
    const runtime = appRuntime();
    try {
      expect(runtime.kind).toBe('postgres');
      if (runtime.kind !== 'postgres') throw new Error('expected native PostgreSQL test runtime');
      await migrate(runtime.db, { migrationsFolder: 'src/lib/db/migrations' });

      const { authOptions } = await import('./auth.ts');
      const adapter = authOptions().adapter;
      if (!adapter.createUser) throw new Error('authentication must support persisted users');
      const user = await adapter.createUser({
        id: crypto.randomUUID(),
        email: `${crypto.randomUUID()}@example.test`,
        emailVerified: null,
        name: 'Synthetic Postgres coach',
      });
      expect(await findOrCreateUser(appDb(), user.email!)).toBe(user.id);
    } finally {
      await runtime.close();
      vi.unstubAllEnvs();
    }
  },
  20000,
);
