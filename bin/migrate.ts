/**
 * Migrate a database to the current schema. Runs under Node's native type
 * stripping — `node bin/migrate.ts`, no build step.
 */

import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import { createDatabaseRuntime } from '../src/lib/db/runtime.ts';
import { resolveDatabaseUrl } from '../src/lib/db/url.ts';
import { loadEnvLocal } from './env.ts';

loadEnvLocal();

const url = resolveDatabaseUrl();
const runtime = createDatabaseRuntime(url);

try {
  if (runtime.kind === 'postgres') {
    await migratePostgres(runtime.db, { migrationsFolder: './src/lib/db/migrations' });
  } else {
    await migratePglite(runtime.db, { migrationsFolder: './src/lib/db/migrations' });
  }
  console.log('migrated database');
} finally {
  await runtime.close();
}
