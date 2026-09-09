import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { findOrCreateUser } from './lib/db/users.ts';

it('an authenticated user is the same persisted identity used by reporting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'descenders-auth-'));
  vi.stubEnv('DATABASE_URL', directory);
  vi.stubEnv('AUTH_SECRET', 'synthetic-test-secret-at-least-thirty-two-characters');
  const { appDb, appRuntime } = await import('./app/db.ts');
  const db = appDb();
  try {
    const runtime = appRuntime();
    expect(runtime.kind).toBe('pglite');
    if (runtime.kind !== 'pglite') throw new Error('expected local PGlite test runtime');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(runtime.db, { migrationsFolder: 'src/lib/db/migrations' });
    const { authOptions } = await import('./auth.ts');
    const adapter = authOptions().adapter;
    if (!adapter.createUser) throw new Error('authentication must support persisted users');
    const user = await adapter.createUser({
      id: 'synthetic-auth-identity',
      email: 'persistent.coach@example.test',
      emailVerified: null,
      name: 'Demo coach',
    });
    expect(await findOrCreateUser(db, 'persistent.coach@example.test')).toBe(user.id);
  } finally {
    await appRuntime().close();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
