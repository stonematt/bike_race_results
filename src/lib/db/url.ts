/**
 * Where the database lives — the one place the default is spelled.
 *
 * PGlite writes `./.pglite` as a directory, and that default is what lets a
 * fresh clone migrate and seed with no configuration at all, so it is the one
 * variable whose absence is never a failure. It follows that the default is
 * load-bearing: three call sites that each spell it themselves are three
 * chances for a fresh clone to end up with two databases, and `bin/normalize.ts`
 * writing rows that `pnpm dev` cannot see is a bug nobody would think to look
 * for. There is one owner, and `url.test.ts` holds the line.
 *
 * **Why a leaf module rather than `db/index.ts`.** Every consumer of the
 * default already imports the db module, so that would have been the natural
 * home — except `src/lib/ingest/fetch.ts` is one of them, and it takes only a
 * *type* from `drizzle-orm/pglite` today. Importing `db/index.ts` there would
 * pull the PGlite WASM runtime into the fast test lane to read one string. This
 * file imports nothing, so anything can have the default without taking on a
 * driver.
 *
 * It also takes the environment rather than reaching for `process.env`, which
 * is what lets `readFetchConfig` stay a pure function of the env it was handed.
 */

/** The database `bin/` and the app share when `DATABASE_URL` says nothing. */
const DEFAULT_DATABASE_URL = './.pglite';

/**
 * `DATABASE_URL`, or the local PGlite directory when it is unset.
 *
 * Call it *after* `loadEnvLocal()` in a `bin/` entry point — a read that
 * resolves before `.env.local` is loaded is issue #41's bug.
 */
export function resolveDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  return env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

/**
 * A `postgres://` URL means a hosted PostgreSQL server; anything else is a
 * local PGlite directory.
 *
 * The same leaf-module argument as the default applies: `runtime.ts` dispatches
 * on this, `index.ts` refuses on it, and the description below reads it, so one
 * spelling keeps them from drifting apart.
 */
export function isHostedUrl(url: string): boolean {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

/**
 * Where a command wrote, in a form that is safe to print.
 *
 * A local directory is its own description — a path is not a secret, and naming
 * it is how an operator notices they seeded the wrong one. A hosted URL is not:
 * it carries the password, so the description keeps the database and host, which
 * is what tells the operator whether they hit production, and drops the rest.
 * When it cannot be parsed, it says nothing about it at all rather than falling
 * back to the raw string.
 */
export function describeDatabaseLocation(url: string): string {
  if (!isHostedUrl(url)) return url;
  try {
    const parsed = new URL(url);
    const database = decodeURIComponent(parsed.pathname).replace(/^\//u, '');
    if (!parsed.hostname || database === '') throw new Error();
    return `the PostgreSQL database ${database} on ${parsed.hostname}`;
  } catch {
    return 'a PostgreSQL database';
  }
}
