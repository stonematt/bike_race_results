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

| Question | Answer | Recorded |
| --- | --- | --- |
| Host | _pending_ | |
| Database provider | _pending_ | |
| Hostname | _pending_ | |
| Mail sender | _pending_ | |
| Owning account identity | _pending_ | |

## Phases

Owner column: **operator** is the human with provider and registrar access;
**agent** is repository work.

| # | Phase | Owner | State |
| --- | --- | --- | --- |
| 0 | Decisions above | operator | not started |
| 1 | Provider accounts, database created | operator | not started |
| 2 | Hosted-capable seed and normalize | agent | not started |
| 3 | Schema migration against the hosted database | operator + agent | not started |
| 4 | Club config, first admin, corpus load | operator + agent | not started |
| 5 | Mail sender and its DNS records | operator | not started |
| 6 | Host project, environment variables, build settings | operator | not started |
| 7 | Domain and TLS | operator | not started |
| 8 | Verification pass | agent | not started |
| 9 | Ledger entry and issue close-out | agent | not started |

## Phase 2 — hosted-capable seed and normalize (blocking)

`bin/seed.ts` and `bin/normalize.ts` both call `createDb()`
(`src/lib/db/index.ts`), which throws on a `postgres://` URL. Only
`bin/migrate.ts` and the application runtime take a hosted database today. Until
this is fixed there is no way to put a club, an admin, or a single result into a
hosted database.

The shape already exists: `bin/demo.ts` and `bin/migrate.ts` use
`createDatabaseRuntime()` and close the runtime explicitly. Both CLIs write in
transactions, so the pooled-client behaviour is the part that needs proof, not
the wiring.

`bin/fetch.ts` stays PGlite-only on purpose: fetching is a laptop activity that
fills the local archive, and nothing about hosting changes that.

## Environment variables

Names and origins only.

| Name | Value shape | Where it is set |
| --- | --- | --- |
| `DATABASE_URL` | pooled hosted URL for the app; direct URL for migrations | host env, and the operator's shell for CLI runs |
| `AUTH_SECRET` | `npx auth secret` | host env |
| `AUTH_URL` | the canonical `https://` origin | host env |
| `AUTH_EMAIL_SERVER` | SMTP URL for the sender | host env |
| `AUTH_EMAIL_FROM` | the sending address | host env |
| `AUTH_ALLOWED_EMAILS` | bootstrap admin address | operator's shell at seed time only |
| `CURRENT_SEASON` | four-digit year, optional | host env |
| `AUTH_DEV_LOGIN` | absent | nowhere |

Runtime authorization is the active `club_membership` row read on each protected
request. `AUTH_ALLOWED_EMAILS` bootstraps the first admin and nothing else; it
is not an invitation list and cannot restore a revoked membership.

## Log

Append one line per completed step: date, what was done, and the evidence.

- 2026-09-09. Runbook opened on `feat/hosted-publish`. No provider account,
  paid resource, deployment, real invitation, or data transfer has occurred.
