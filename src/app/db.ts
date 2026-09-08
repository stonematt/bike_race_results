/**
 * The app's database handle.
 *
 * A database runtime owns a real resource — PGlite locally or a bounded
 * node-postgres pool — so one per request would be both slow and contended.
 * Next keeps module state for the lifetime of the server process, so the
 * runtime is created lazily and reused by both auth and reporting.
 *
 * Lazily rather than at import: a module-level `createDb()` runs during page
 * data collection at build time, when `DATABASE_URL` may not be set and there
 * is nothing to query.
 */

import type { Database } from '../lib/db/index.ts';
import { createDatabaseRuntime, type DatabaseRuntime } from '../lib/db/runtime.ts';

let runtime: DatabaseRuntime | undefined;

export function appDb(): Database {
  return appRuntime().db;
}

/** The app-level resource owner. Callers should query through `appDb()`. */
export function appRuntime(): DatabaseRuntime {
  runtime ??= createDatabaseRuntime();
  return runtime;
}
