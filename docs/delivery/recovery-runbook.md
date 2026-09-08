# D5 runtime and recovery runbook

This runbook covers the local, synthetic-verified deployment boundary. It is
not authorization to deploy, buy a service, send real mail, accept invitations,
or transfer athlete data. Hosted provider credentials, TLS settings, backup
retention and restore permissions remain provider/operator decisions.

## Runtime modes

`DATABASE_URL` selects the database transport:

- An unset value or a filesystem directory uses persistent PGlite. Its default
  is `./.pglite`; treat it as a directory and never open one directory from two
  app processes at once.
- A `postgres://` or `postgresql://` URL uses the bounded node-postgres pool.
  The app singleton owns one lazy runtime per process. It has a five-connection
  limit, finite connection/idle timeouts, and sanitised background-error logs.

Set `AUTH_URL`, `AUTH_SECRET`, `CURRENT_SEASON`, and, when email sign-in is
enabled, `AUTH_EMAIL_SERVER` and `AUTH_EMAIL_FROM`. Record variable names and
origins only; never put values, tokens, cookies or connection strings in a
ticket, log, screenshot or this repository. Production must not enable the
development provider: `AUTH_DEV_LOGIN` is intentionally absent there.

## Fresh local synthetic walkthrough

Use a new empty PGlite directory. The following creates only the committed
pseudonymous demo and never reads club config, rider names or `fixtures/`:

```sh
DATABASE_URL=/private/tmp/descenders-demo pnpm demo
DATABASE_URL=/private/tmp/descenders-demo AUTH_URL=http://localhost:3000 AUTH_DEV_LOGIN=1 pnpm dev
```

The demo refuses a populated non-demo database before writing. Re-running it
recognises the exact synthetic database. Stop the app before running migrations
or opening the same directory with another process. Remove only a verified
temporary demo directory when finished.

## Migration order

1. Back up the existing database before a schema change. For PGlite, stop the
   app and take a filesystem-level copy of the entire database directory. For
   PostgreSQL, use the provider-approved logical backup procedure (typically
   `pg_dump`) and validate that it can be restored into an isolated database.
2. Build and verify the candidate application before changing the database:
   `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and
   `pnpm build`. The checked-in `pnpm test:e2e` uses only a disposable synthetic
   PGlite demo.
3. Stop or drain application writers. Run `pnpm db:migrate` once with the
   intended `DATABASE_URL`; never migrate per request.
4. For PostgreSQL, the command holds a session advisory lock across the Drizzle
   migrator. Do not run a second migration command while the first is active.
5. Start one application process, then verify anonymous denial, provider
   configuration, active-member access and a safe synthetic request. Do not
   use a real invitation or athlete record as a smoke test.

The migrations are forward-only. Do not edit landed migration files or attempt
to roll a schema backward in place.

## Recovery and rollback

If migration or startup fails, keep the failed database for diagnosis and stop
writers. Restore the verified pre-migration backup into a separate recovery
location first. Validate its migration journal, synthetic/public health checks
and the selected application revision before changing any primary database.

Rollback means returning application traffic to the last compatible application
revision **only when its schema compatibility has been verified**. Otherwise,
restore the database backup and that matching application revision together.
Do not use `git reset`, delete migration journal rows, or manually change the
Drizzle journal to manufacture compatibility.

For a PostgreSQL connection/pool incident, remove the failed app process from
service and start one replacement after confirming the database endpoint is
healthy. The runtime’s pool closes on process exit; do not reuse a process with
borrowed or failed connections. For PGlite corruption or an interrupted local
write, stop every process using the directory, preserve a copy for diagnosis,
then restore the directory-level backup.

## Data correction and intake

`pnpm fetch` contacts the timing vendor and is hand-run only under separate
authorization. It is never scheduled. `pnpm normalize` and `pnpm seed` remain
PGlite-only helpers; they intentionally refuse PostgreSQL rather than silently
discarding a pool. A hosted ingestion/correction procedure therefore remains
an explicit pre-deployment requirement.

Before correcting normalized results, back up the database and preserve the
raw source binding. ADR-0006 requires legacy rows without provenance to fail
closed until a permitted re-normalization establishes it. Verify that a
correction invalidates stale editorial evidence before republishing. Never
copy `mockups/`, `fixtures/`, private name maps, tokens or mail bodies into a
public runner or support artifact.

## Verified scope and outstanding operator work

Verified locally with synthetic data: persistent PGlite reopen, native
PostgreSQL migrations and upgrades, transaction rollback, pool recovery,
last-admin concurrency locking, production-mode Auth.js/browser smoke, and the
privacy-first PGlite browser CI gate. The deployment candidate has **not** been
hosted or released.

Before authorization to deploy, an operator must select and verify a provider,
TLS/direct-vs-pooled connection URL, secrets delivery, backup retention and
restore drill, hosted mail behavior, Postgres ingestion/correction workflow,
monitoring/alerts, and the remaining full PGlite/PostgreSQL domain-parity set.
