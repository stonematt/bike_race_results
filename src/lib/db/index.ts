/**
 * The database types every consumer shares, and the one helper that still
 * refuses a hosted database.
 *
 * `Database` is the union of the two native driver handles. Everything that
 * takes a database takes it — seeding, decoding, reporting and the app alike —
 * so nothing has to know which driver it was handed, and nothing may cast one
 * driver to the other. `runtime.ts` owns their distinct resource lifecycles.
 *
 * `createDb` is what remains of the PGlite-only era, and `bin/fetch.ts` is its
 * last caller. Fetching is a laptop activity by design (docs/fixtures.md): it
 * talks to a volunteer-run timing vendor and appends to the local archive, and
 * a hosted database has no part in it. Refusing here keeps that deliberate,
 * rather than leaving it to whoever next sets `DATABASE_URL` in a shell.
 */

import * as schema from './schema.ts';
import { createDatabaseRuntime, type RuntimeDatabase } from './runtime.ts';
import { isHostedUrl, resolveDatabaseUrl } from './url.ts';

/**
 * The two native schema-typed driver handles. Resource ownership stays in
 * `DatabaseRuntime`; callers that need driver-specific builders must narrow at
 * a runtime composition boundary rather than casting one driver to the other.
 */
export type Database = RuntimeDatabase;

export { isHostedUrl };

export function createDb(url = resolveDatabaseUrl()) {
  if (isHostedUrl(url)) {
    throw new Error(
      'This command supports only a local PGlite directory. Fetching fills the local archive; run db:migrate and normalize to carry it to a PostgreSQL database.',
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
