/**
 * The one database module. All three entry points import this — bin/fetch.ts,
 * legacy PGlite-only command helpers. The Next app owns its runtime through
 * `src/app/db.ts`, so it does not lose a native node-postgres pool behind this
 * compatibility helper.
 *
 * PGlite locally and node-postgres for a PostgreSQL URL. Both are Postgres, so
 * the schema file, SQL and migrations are shared; `runtime.ts` owns their
 * distinct resource lifecycles.
 */

import * as schema from './schema.ts';
import { createDatabaseRuntime, type RuntimeDatabase } from './runtime.ts';
import { resolveDatabaseUrl } from './url.ts';

/**
 * The two native schema-typed driver handles. Resource ownership stays in
 * `DatabaseRuntime`; callers that need driver-specific builders must narrow at
 * a runtime composition boundary rather than casting one driver to the other.
 */
export type Database = RuntimeDatabase;

/** A `postgres://` URL means hosted; anything else is a local PGlite directory. */
export function isHostedUrl(url: string): boolean {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

export function createDb(url = resolveDatabaseUrl()) {
  if (isHostedUrl(url)) {
    throw new Error(
      'This command currently supports only a local PGlite directory. Use the application runtime or db:migrate for PostgreSQL.',
    );
  }
  const runtime = createDatabaseRuntime(url);
  if (runtime.kind !== 'pglite') {
    void runtime.close();
    throw new Error('This command currently supports only a local PGlite directory.');
  }
  return runtime.db;
}

export { schema };
