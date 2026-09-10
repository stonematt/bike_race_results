/**
 * Prepare a repeatable, synthetic local demo. This is intentionally separate
 * from `seed`: it never reads club config, the coach email map, or the private corpus.
 *
 *   pnpm demo
 *   DATABASE_URL=/private/tmp/descenders-d1-demo pnpm demo
 */

import { migrate } from 'drizzle-orm/pglite/migrator';
import {
  assertSafeDemoMigrationPreflight,
  bootstrapSafeDemo,
  finalizeKnownDemoMigration,
  resolveDemoDatabaseUrl,
} from '../src/lib/demo.ts';
import { createDatabaseRuntime } from '../src/lib/db/runtime.ts';
import { loadEnvLocal } from './env.ts';

// Capture only the invocation's DATABASE_URL before `.env.local` is loaded.
// A normal app setup commonly points that file at its ordinary local database; letting it
// redirect this command would make the safety promise depend on an invisible
// local file rather than the explicit demo invocation.
const explicitDatabaseUrl = process.env.DATABASE_URL;
loadEnvLocal();

const databaseUrl = resolveDemoDatabaseUrl({ DATABASE_URL: explicitDatabaseUrl });
const runtime = createDatabaseRuntime(databaseUrl);
if (runtime.kind !== 'pglite') {
  await runtime.close();
  throw new Error('pnpm demo only supports a local PGlite directory.');
}
const db = runtime.db;

try {
  await assertSafeDemoMigrationPreflight(db);
  await migrate(db, { migrationsFolder: './src/lib/db/migrations' });
  await finalizeKnownDemoMigration(db);
  const result = await bootstrapSafeDemo(db);

  console.log(
    result.status === 'created'
      ? 'Created the synthetic demo database.'
      : 'Synthetic demo database is ready; existing configuration preserved.',
  );
  console.log(
    `For local development login, run DATABASE_URL=${shellQuote(databaseUrl)} AUTH_URL=http://localhost:3000 AUTH_DEV_LOGIN=1 pnpm dev, open http://localhost:3000, and use ${result.coachEmail}.`,
  );
} finally {
  await runtime.close();
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
