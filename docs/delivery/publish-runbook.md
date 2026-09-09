# Publish runbook: hosted deployment of the reporting app

Working document for the first hosted deployment. It records what has actually
been done, by whom, and what remains. It carries **variable names and command
shapes only** — never a secret, connection string, token, or real address.

Related: [#129](https://github.com/stonematt/bike_race_results/issues/129)
(provider/hosted readiness), [recovery runbook](recovery-runbook.md) (runtime
modes, migration order, rollback), [status](status.md) (delivery ledger).

## Standing constraints

These are not negotiable by convenience during this work.

- The app renders minors' names. Every hosted surface must stay unindexed,
  unshared, and behind auth. `next.config.ts` already sends
  `noindex, nofollow, noarchive`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on `/:path*`.
- Preview/branch deployments must never hold a production database URL.
- `AUTH_DEV_LOGIN` must be absent in the hosted environment. Not empty — absent.
- Ingest is hand-run by a human, on a laptop. No cron, no scheduled workflow,
  while this repository is public.
- `fixtures/` and any identity file stay out of the repository and off the host.
  They travel from the laptop into the database, and nowhere else.
- Hosting real athlete data with a third party is a first: record the decision
  in [status](status.md) rather than letting it land as a side effect.

## Decisions

| Question                | Answer                                                                                             | Recorded   |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ---------- |
| Host                    | Vercel                                                                                             | 2026-09-09 |
| Database provider       | Neon                                                                                               | 2026-09-09 |
| Hostname                | `results.scdescenders.com`                                                                         | 2026-09-09 |
| Mail sender             | Resend                                                                                             | 2026-09-09 |
| Owning account identity | `admin@scdescenders.com`; the host account may use the owner's GitHub login for deploy integration | 2026-09-09 |

DNS for `scdescenders.com` is at Squarespace. The operator is a board member with
registrar access and expects to hand the accounts over later; prefer a club
address on every account that supports one, so the handover is a password reset
rather than a migration.

## Phases

Owner column: **operator** is the human with provider and registrar access;
**agent** is repository work.

| #   | Phase                                               | Owner            | State       |
| --- | --------------------------------------------------- | ---------------- | ----------- |
| 0   | Decisions above                                     | operator         | done        |
| 1   | Provider accounts, database created                 | operator         | done        |
| 2   | Hosted-capable seed and normalize                   | agent            | done        |
| 3   | Schema migration against the hosted database        | operator + agent | done        |
| 4   | Club config, first admin, corpus load               | operator + agent | done        |
| 5   | Mail sender and its DNS records                     | operator         | not started |
| 6   | Host project, environment variables, build settings | operator         | not started |
| 7   | Domain and TLS                                      | operator         | not started |
| 8   | Verification pass                                   | agent            | not started |
| 9   | Ledger entry and issue close-out                    | agent            | not started |

## Phase 2 — hosted-capable seed and normalize

`bin/seed.ts` and `bin/normalize.ts` called `createDb()`, which throws on a
`postgres://` URL, so there was no way to put a club, an admin, or a single
result into a hosted database. Both now open a `DatabaseRuntime` and close it,
and the modules beneath them take the driver-agnostic `Database` type rather
than a PGlite handle.

`bin/fetch.ts` stays PGlite-only on purpose: fetching is a laptop activity that
fills the local archive, and nothing about hosting changes that. `createDb` is
now its only caller, and its refusal is what keeps that deliberate.

Success lines print a described location — the database and host — rather than
the URL, which on a hosted database carries the password.

Order for a hosted database is recorded in the
[recovery runbook](recovery-runbook.md): migrate, seed, then normalize.

## Environment variables

Names and origins only.

| Name                  | Value shape                                              | Where it is set                                 |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `DATABASE_URL`        | pooled hosted URL for the app; direct URL for migrations | host env, and the operator's shell for CLI runs |
| `AUTH_SECRET`         | `npx auth secret`                                        | host env                                        |
| `AUTH_URL`            | the canonical `https://` origin                          | host env                                        |
| `AUTH_EMAIL_SERVER`   | SMTP URL for the sender                                  | host env                                        |
| `AUTH_EMAIL_FROM`     | the sending address                                      | host env                                        |
| `AUTH_ALLOWED_EMAILS` | bootstrap admin address                                  | operator's shell at seed time only              |
| `CURRENT_SEASON`      | four-digit year, optional                                | host env                                        |
| `AUTH_DEV_LOGIN`      | absent                                                   | nowhere                                         |

Runtime authorization is the active `club_membership` row read on each protected
request. `AUTH_ALLOWED_EMAILS` bootstraps the first admin and nothing else; it
is not an invitation list and cannot restore a revoked membership.

## Log

Append one line per completed step: date, what was done, and the evidence.

- 2026-09-09. Runbook opened on `feat/hosted-publish`. No provider account,
  paid resource, deployment, real invitation, or data transfer has occurred.
- 2026-09-09. Phase 0 decided: Vercel, Neon, `results.scdescenders.com`, Resend,
  `admin@scdescenders.com`. Nothing provisioned yet.
- 2026-09-09. Phase 2 delivered. `seed` and `normalize` open a `DatabaseRuntime`
  and close it; the modules beneath them take `Database`; success lines print a
  described location instead of the URL. New native parity suites cover seeding
  and decoding, and skip themselves without a tracer cluster. Verified on a
  disposable loopback PostgreSQL 17 cluster: migrate, `seed --club-config` (the
  committed pseudonymous config, 32 riders), a synthetic admin, `normalize` on an
  empty archive, and the allowlist refusal exiting 1 with the pool closed. No
  output carried a credential. Public suite with the required tracer: 1,160
  passed, 1 todo, and the known worktree-only git-hooks path failure. Typecheck,
  lint, formatting and the privacy guard pass. Still no provider account, paid
  resource, deployment, real invitation, or athlete-data transfer.
- 2026-09-09. Phase 1. Neon project created on the free plan, AWS `us-west-2`,
  branch `production`, database `neondb`, role `neondb_owner`. Owned by the club
  address. Neon's CLI onboarding (`neon skills`, `neon link`, `neon deploy`) was
  deliberately not run: deployment is Vercel's, and vendor agent files do not
  belong in a public repository. The connection strings live outside every
  checkout, in the operator's password manager and a `chmod 600` file symlinked
  in as `.env.local`.
- 2026-09-09. `sslmode` changed from `require` to `verify-full` on the direct
  URL. `pg` treats `require` as full verification today and warns that v9 will
  silently weaken it to libpq semantics — encrypted but unverified. The pooled
  URL needs the same change before it reaches the host.
- 2026-09-09. Phases 3 and 4. Schema migrated to the `production` branch: 31
  tables, 5 views, 9 journal rows, idempotent on re-run. **The owner explicitly
  authorized transferring real athlete data to Neon** and it was seeded with the
  real rider-name map: 3 scoring teams, 32 riders, 32 plate mappings, 1 squad.
  First admin `admin@scdescenders.com` bootstrapped. Corpus archived and decoded
  from the local `fixtures/` corpus — 60 payloads, 9 events, 37 of 51 lists
  decoded and 14 recognized and not written, giving 3,068 individual results and
  641 season standings. Verified after load: views resolve, one club membership,
  no unmapped riders. No deployment, real invitation, or public URL yet.
