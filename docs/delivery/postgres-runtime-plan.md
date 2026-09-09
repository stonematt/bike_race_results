# PostgreSQL runtime implementation plan

2026-09-08 UTC / 2026-09-08 local. Bounded D5 research, not implementation or deployment acceptance. Supplements the transport decision in [readiness notes](readiness-notes.md); the accepted contract and ADR-0007 remain authoritative. No packages changed, server started, data transferred or invitation created during this investigation.

## Verified compatibility and remaining seam

Local inspection confirmed the lockfile and installed Drizzle are 0.38.4. Its `node-postgres/driver.d.ts` accepts a Pool and returns `NodePgDatabase<typeof schema>`; the node-postgres migrator is present. The pinned 0.45.2 source retains Pool construction and the same public driver family. This supports the transport proposal at both versions, not blanket compatibility with every release above 0.45.2. Select an exact upgrade version during the security increment and rerun tests; avoid copying current release-candidate examples into this older application. [Drizzle 0.45.2 driver](https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/drizzle-orm/src/node-postgres/driver.ts).

The current `src/lib/db/index.ts` returns only a PGlite database and rejects PostgreSQL URLs. `Database`, reporting `Pick<Database, 'execute'>`, Auth.js construction, seed and normalize consequently inherit that driver. `bin/migrate.ts` imports only the PGlite migrator and ends with `process.exit(0)`. These are integration work, not merely a connection-string change.

Proposed public interface, to prove with a compile-and-runtime tracer before widening callers:

```ts
interface SqlExecutor {
  execute(query: SQL): PromiseLike<{ rows: Record<string, unknown>[] }>;
}
interface CommandDatabase extends SqlExecutor {
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
type DatabaseRuntime =
  | { kind: 'pglite'; db: PgliteDatabase<typeof schema>; close(): Promise<void> }
  | { kind: 'postgres'; db: NodePgDatabase<typeof schema>; close(): Promise<void> };
```

Keep driver-specific resources behind the discriminant. Thin adapters expose `SqlExecutor` and `CommandDatabase` by awaiting native `execute` and returning its rows; transaction adapters invoke the supplied work on that transaction's executor. Do not assert that NodePg is PGlite, manufacture driver result metadata, or expose pool-level execution inside a transaction. Narrow existing SQL reporting/authz/operations signatures to these structural contracts. This proposal needs typechecking against the selected versions before adoption.

Seed/normalize and the Auth.js adapter also use typed query builders. Preserve native schema typing there: first prove generic `PgDatabase<Q, typeof schema>` helpers for the builder operations actually used, or narrow the runtime union at a small driver-specific composition boundary. Do not pretend the SQL-only interface covers these callers. Auth and reporting must share the same runtime resource rather than opening separate pools. Schema, normalized views, exact source bindings and migration history remain shared.

## Resource and migration lifecycle

Create one lazy, bounded Pool per application process; propose `max: 5`, a finite connection timeout and an idle timeout as initial local test settings, not hosted sizing. Register a sanitized background-error handler. Reuse the runtime through the application singleton and never close it at the end of an individual request. CLI/test ownership ends in `finally { await runtime.close(); }`; PostgreSQL closes via `pool.end()`, PGlite via `client.close()`. Let the CLI terminate naturally after cleanup and set a failing exit code on errors. Pool shutdown waits for borrowed clients, so cleanup tests must detect leaks. [Pool API](https://node-postgres.com/apis/pool), [PGlite close API](https://pglite.dev/docs/api#close).

Drizzle 0.45.2 transactions acquire a pool client and use it for begin/work/commit or rollback, then release it in `finally` after entering that block. Keep transaction statements on `tx`; do not substitute `pool.query`. Exercise rollback and pool reuse after command failures. [Pinned transaction implementation](https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/drizzle-orm/src/node-postgres/session.ts#L236-L255), [node-postgres transactions](https://node-postgres.com/features/transactions).

Dispatch migrations using the native runtime branch and corresponding Drizzle migrator. Pin the migrations directory independently of the launch directory. Run migration as a dedicated, serialized command, never per request. The 0.45.2 dialect creates/reads its journal before beginning the transaction containing pending SQL and journal inserts; it supplies no migration-runner lock. Thus transactional migration is not proof against simultaneous runners. If automated overlap is possible, hold a session advisory lock on one dedicated direct connection across the entire migrator call, then unlock/close in `finally`; an autocommit transaction advisory lock would end too early. [Pinned migrator](https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/drizzle-orm/src/node-postgres/migrator.ts), [pinned migration dialect](https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/drizzle-orm/src/pg-core/dialect.ts#L70-L107), [PostgreSQL advisory locks](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS).

Declare Node runtime at database-using Next entry boundaries. Next 15 route segments default to Node, but that does not change middleware's separate runtime constraints. Keep PGlite/pg imports out of Edge middleware. Hosted pool attachment, TLS/provider credentials and direct-vs-pooled URLs require later provider-specific verification. [Next 15 runtime configuration](https://nextjs.org/docs/15/app/api-reference/file-conventions/route-segment-config#runtime).

## Disposable local PostgreSQL verification

Read-only checks found `postgres`, `initdb`, `pg_ctl` and `psql` under `/opt/homebrew/opt/postgresql@17/bin`; `postgres --version` and `pg_ctl --version` both reported PostgreSQL 17.11 (Homebrew). This confirms installed binaries, not an initialized/running task server. Do not touch Homebrew's default cluster or start a persistent service.

The future harness should create a unique owner-only directory under `/private/tmp`, with separate data, socket and log paths. Use explicit `initdb -D`, `--encoding=UTF8` and `--locale=C`. Prefer socket-only operation (`listen_addresses=''`) with a 0700 socket directory and socket permissions; if testing a PostgreSQL URL requires TCP, use an unused explicit port, `127.0.0.1` only, and a synthetic credential with SCRAM host authentication. Do not print credentials or connection URLs. [initdb](https://www.postgresql.org/docs/17/app-initdb.html), [connection settings](https://www.postgresql.org/docs/17/runtime-config-connection.html).

Use explicit task `-D`, task `-l`, `-w` and bounded startup timeout. On completion, close application pools, then `pg_ctl -D <task-data> -m fast -w stop`. Verify task-cluster status and its PID before deleting only task-owned paths. A timeout is not proof of shutdown; never manually remove socket/lock files or stop unrelated servers. [pg_ctl](https://www.postgresql.org/docs/17/app-pg-ctl.html).

## Proposed acceptance sequence

1. **Fresh transport tracer:** migrate two empty synthetic databases, one persistent PGlite and one native PostgreSQL; run one public scoped read and one committed/rolled-back command through the agreed interfaces. Verify second migration is inert and cleanup permits process exit.
2. **Upgrade:** create synthetic databases at the last landed migration baseline, populate Auth.js identities, source bindings and managed memberships/preferences, then migrate to the candidate head. Confirm retained public behavior and migration journal; do not edit landed migration bytes. Back up any actual local installation before a separate upgrade smoke.
3. **Parity:** run shared public scenarios against both engines: conference/null-conference denominators, source-bound lap provenance, DNF/deficit/null comparisons, checkpoints, preference/archive behavior, invitation rejection rollback and next-request revocation. Compare domain outputs, not driver metadata or generated IDs. Include timestamp/boolean/numeric conversions used by those outputs.
4. **Persistence:** close and reopen both runtimes; observe saved preference, archive and managed memberships through public reads. PGlite has a single exclusive connection, so its passing sequential tests cannot demonstrate competing PostgreSQL transactions. [PGlite connection model](https://pglite.dev/docs/).
5. **Concurrent last-admin guard:** use native PostgreSQL with at least two independent clients and two active admins. Hold the club-row lock with a separate control connection, start both public self-demotion/revocation commands, establish that both are waiting using bounded database-lock observation, then release the control lock. Exactly one may succeed; the other must reject after re-reading membership, leaving one active admin and no rejected-command audit writes. Repeat mixed demotion/revocation. Assert final state through protected public reads; use a real timeout rather than arbitrary sleeps. This follows the explicit ADR-0007 club-lock contract, not a generic claim that all races are solved.
6. **Runtime:** repeat production build/start, anonymous denial, revoked-account denial, development-provider refusal, no-store/no-referrer and synthetic auth-adapter round trips with the PostgreSQL transport. Later local-mailbox and hosted-provider verification remain separate D5 criteria.

None of these proposed acceptance steps ran in this research pass. Dependencies, interface compilation, migration parity, concurrent commands and hosted operation remain unverified until implementation.
