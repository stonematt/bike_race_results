# bike_race_results

Current product direction: [PRODUCT.md](PRODUCT.md). Start with the [design record](docs/design/README.md) and [delivery status](docs/delivery/status.md); earlier exploration notes may describe superseded product boundaries.

An analytics environment for interscholastic mountain bike race results, built for the **Salem Composite Descenders** in the Oregon Interscholastic Cycling League (NICA).

It ingests what the league published, normalizes it across races and seasons, and lets a coach drill in two directions the official results pages don't support: **who** — conference, scoring team, club, squad, rider — and **when** — one round, a season, a career.

The done-condition: _a race posts on a Sunday night and a coach opens the app to see how their riders did._

**Product boundary.** League results remain source-authoritative. The accepted delivery includes persistent club memberships, squad administration, invitations and reviewed editorial stories; the delivery ledger records which are implemented. Messaging, calendars, practice plans and volunteer coordination remain outside this application.

## The shape of the domain

The domain looks like one hierarchy and is not. There are **two trees, joined at scoring team**:

```
League tree (theirs, read-only)      Club tree (ours, editable)
  league                               club
    conference                           squad
      scoring team  <--- joined --->  scoring team
        rider                              rider
```

A club spans several scoring teams, and which ones changes each season — so club cannot sit inside the league's tree without becoming season-scoped and breaking every cross-season view. Two words that look interchangeable are not: **conference** is the league's geographic split (North/South), while **division** is NICA's team-scoring bracket, an attribute of a team's result rather than a level of anything.

Crossed with time, every view in the app is a cell in one grid:

|            | one round       | season to date  | across seasons |
| ---------- | --------------- | --------------- | -------------- |
| conference | field context   | standings       | —              |
| club       | the club's day  | the club's arc  | —              |
| squad      | the squad's day | the squad's arc | —              |
| rider      | the ride        | progression     | career         |

Season is the **frame**, not a filter — club membership is season-keyed, so "all seasons at once" is not a well-defined club. The unit on the time axis is the **round**, not the event: one round can be two events when the conferences race separately.

## Ground rules

**NICA is the scoring authority, and the line is description versus adjudication.** We derive what is recomputable from the published rows and carries no consequence — percent back, lap deficit, field size, start count, percentile. We never produce what the league decides and acts on — points, place, category, State Champs eligibility. So the app will tell you a rider started three of four rounds, and will never tell you whether that makes them eligible. Where the published numbers look wrong, the app shows the published numbers.

**Two orientations, both first-class.** Some riders measure a season in places and podiums; others measure it in starts and finishes. Both are well represented, and the split does not follow middle school versus high school — there are high schoolers whose season is finishing a lap. So it can never be a filter or a segment: a view that renders only place serves half the roster. This is why a result has three states rather than two — positioned (the league published a place, whether or not a percent back is comparable), started without a comparable position (a DNF), and no result recorded. An absent row does not establish DNS; unpublished, incomplete and excluded results need their own states.

**There is no public half.** The app is for club coaches, so every route sits behind auth, and `next.config.ts` sends `noindex, nofollow, noarchive`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store` on every path.

## Status

Local application delivery is active through [epic #121](https://github.com/stonematt/bike_race_results/issues/121). The [delivery ledger](docs/delivery/status.md) records reviewed commits, merge status and verification limits.

- Persistent PGlite, migrations and a repeatable synthetic demo share authentication and reporting identity.
- Normalized reporting binds exact source revisions and keeps conference fields, lap comparability and published scoring separate.
- The season dispatch and club/squad rosters retain an explicit race checkpoint. Named rider and race-review routes provide deeper evidence.
- Persistent club operations, reviewed stories and the hosted-Postgres readiness path are subsequent delivery increments; production has not been released.

The append-only raw layer archives and normalizes local fixtures without refetching them. Public tests use synthetic data; checks against the real corpus stay local. See the ledger for current tests, visual/data reviews and production-mode smoke checks rather than treating a local build as hosted-provider verification.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Drizzle ORM · PGlite (WASM Postgres) · NextAuth v5 · Tailwind v4 · Vitest

Node >= 24 and pnpm 10. The `bin/` scripts run as `.ts` directly under Node's native type stripping — there is no build step for them.

## Getting started

```bash
nvm use                 # Node 24
pnpm install
cp .env.example .env.local
```

Fill in `.env.local`. At minimum you need three things:

| Variable              | What to put there                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`         | Generate one: `npx auth secret`                                                                      |
| `AUTH_ALLOWED_EMAILS` | Your first-admin bootstrap address. Comma-separated; it authorizes `seedAdmin`, not runtime sign-in. |
| `AUTH_DEV_LOGIN`      | `1`, to sign in locally without a mail server. Development only — see Auth.                          |

Then bring up the database, seed the club and yourself, and load the archived race payloads:

```bash
pnpm db:migrate
node bin/seed.ts --club-config --email you@example.org
node bin/normalize.ts --load-fixtures   # archive the corpus into raw_fetch
node bin/normalize.ts                   # decode it into the result tables
pnpm dev
```

`--club-config` is what fills the club, its scoring teams, the roster, the plate mappings and the squads from `config/club-seed.json`; without it you get a coach on a club with nobody in it. The club's **name** comes from that file too, so there is nothing to type and nothing to keep in step — one invocation puts the coach and the roster on the same club row.

The two `normalize` runs are two different jobs and both are needed. `--load-fixtures` archives payloads into `raw_fetch` and decodes nothing; the bare run decodes that archive into the result tables. The first prints a cheerful "archived 60 payloads" whether or not you run the second, so it is easy to stop early and find every result table empty. On a checkout with no `fixtures/` corpus, skip both — see [`docs/fixtures.md`](docs/fixtures.md).

The `bin/` scripts read `.env.local` themselves, whether you run them as `pnpm seed` or as `node bin/seed.ts` — the file is resolved from the repo root, not from the directory you happen to be in. A variable already set in your shell beats the file, so `DATABASE_URL=... pnpm db:migrate` still points somewhere else for one run. Having no `.env.local` at all is fine: `DATABASE_URL` falls back to `./.pglite`, and nothing else is needed to migrate.

`seed.ts` is idempotent and refuses a first-admin bootstrap address outside
`AUTH_ALLOWED_EMAILS`. It appoints an active admin only when the club has none;
later runs preserve managed roles and leave revoked memberships revoked.

## Safe synthetic demo

For a repeatable local walkthrough without the private fixture corpus, use the synthetic demo. It migrates a dedicated PGlite database and creates only synthetic riders (`«RIDER-A»` through `«RIDER-E»`), a synthetic coach, a current 2026 race, and a small 2025 checkpoint. It never reads the names map, club config, or `fixtures/`.

```bash
DATABASE_URL=./.pglite-demo pnpm demo
DATABASE_URL=./.pglite-demo AUTH_URL=http://localhost:3000 AUTH_DEV_LOGIN=1 pnpm dev
```

Use the dependency installation and `AUTH_SECRET` setup above, then open `http://localhost:3000` and sign in through the local development form as `demo.coach@example.test`. The browser origin and `AUTH_URL` must match, including hostname and port; do not mix `localhost` and `127.0.0.1`, because cookies belong to one host. For a custom port, change both `AUTH_URL` and the `pnpm dev --port` argument. `AUTH_DEV_LOGIN=1` is development-only and the server remains bound to loopback. The demo's default is `./.pglite-demo`, deliberately separate from the ordinary `./.pglite` database. For safety, `pnpm demo` ignores a `DATABASE_URL` supplied only by `.env.local`; set it on the command when choosing a demo location, then use that same explicit path when starting the app.

Set `CURRENT_SEASON=2026` to select the intended current year explicitly. If that year is missing, the landing page stays empty and offers deliberate recorded-season links. With the setting omitted, the latest recorded year remains the default. Use `?through=2` on a season URL for a Race 2 checkpoint; later results and category changes remain excluded while moving between dispatch, roster, race and rider views.

To use another disposable location, set `DATABASE_URL` to an empty local PGlite directory for both commands. A rerun recognizes its exact synthetic database and makes no changes. Any other populated database is refused before writes, so the command cannot replace an existing local installation.

`pnpm dev` binds `127.0.0.1` rather than every interface, and that is load-bearing rather than tidy — see Auth. Don't drop the `--hostname` flag from the script.

## Local real-data UAT

`pnpm serverctl` prepares and runs the authenticated, loopback-only development
server against the locally archived 2025 and 2026 RaceResult corpus. It never
fetches, exports, or prints rider records. It creates an ignored
`.pglite-real-uat/` database and, when needed, an ignored local link to the
already-archived fixture corpus; neither can be committed.

```bash
pnpm serverctl up --email you@example.org
```

The address must already appear in `AUTH_ALLOWED_EMAILS` in `.env.local`; the
controller also requires `AUTH_SECRET` and the out-of-tree rider-name map. Open
the printed loopback URL and use the development sign-in form with that same
address. `pnpm serverctl status` and `pnpm serverctl down` inspect and stop only
the controller-owned server.

The controller archives and normalizes both locally held seasons (the complete
2025 season and the 2026 opener). The checked-in verified club roster is for
2025, so `/2025` is the named-athlete UAT surface. Do not infer a 2026 club
roster from published results: until a verified 2026 club configuration exists,
the `/2026` reporting surface correctly has no club content.

## Auth

`AUTH_ALLOWED_EMAILS` is a comma-separated, case-insensitive bootstrap
allowlist. `seedAdmin` refuses an address outside it, then appoints the first
active admin for a club only when that club has no active admin. It is not a
runtime permission list: re-seeding does not rewrite managed roles or restore a
revoked membership.

Two providers establish an authenticated identity. Nodemailer magic links load
only when `AUTH_EMAIL_SERVER` is set and are the only production provider. The
development credentials shim loads only when `NODE_ENV=development` **and**
`AUTH_DEV_LOGIN=1`; it can establish a local identity for any typed address,
with no mail server and nothing proving control of that address.

Neither provider grants club access. Protected Node pages and actions re-read
the user's active database membership on every request, so a revoked membership
is denied on the next protected request. An authenticated account without an
active membership cannot read club-private reporting or administration data.

Invitation acceptance is not implemented or released yet. A pending or live
invitation is not a documented route to club data, and this repository does not
offer an invitation-acceptance UI.

In development, the loopback bind remains load-bearing: `pnpm dev` binds
`127.0.0.1`, so the local shim is reachable only from the machine running it.
The shim is unavailable in production because `admits()` re-reads the provider
configuration rather than trusting a token claim. A retained development-provider session is rejected in production, even when
the same local `AUTH_SECRET` is used for that check.

The middleware must stay at `src/middleware.ts`. Move it to the repo root and Next silently stops loading it, which fails open.

## Database

PGlite locally — a WASM Postgres that writes to a `.pglite/` **directory**, not a file, and is gitignored. `DATABASE_URL` defaults to `./.pglite`. A `postgres://` URL opens a bounded node-postgres pool instead, and the app, `db:migrate`, `seed` and `normalize` all run against either. `fetch` stays local-only on purpose: it fills the archive on a laptop, and `normalize` is what carries the archive to a hosted database.

Schema lives in `src/lib/db/schema.ts`; migrations in `src/lib/db/migrations/`. The five domain views — `v_individual_result`, `v_race_result`, `v_rider_result`, `v_club_result`, and `v_unmapped_rider` — are hand-written SQL in `0001_domain_views.sql`. Drizzle generates the tables, but the views are maintained by hand, so edit that file directly rather than expecting `db:generate` to produce them.

## Scripts

| Command                             | What it does                                                       |
| ----------------------------------- | ------------------------------------------------------------------ |
| `pnpm dev`                          | Next dev server, bound to `127.0.0.1`                              |
| `pnpm build` / `pnpm start`         | Production build and serve                                         |
| `pnpm test`                         | Vitest, once                                                       |
| `pnpm test:local`                   | The local-only lane, which reads the corpus                        |
| `pnpm privacy:check`                | Fail if payload-shaped data is committed                           |
| `pnpm test:watch`                   | Vitest, watching                                                   |
| `pnpm typecheck`                    | `tsc --noEmit`                                                     |
| `pnpm lint`                         | ESLint                                                             |
| `pnpm format` / `pnpm format:check` | Prettier                                                           |
| `pnpm brand:check`                  | Diff the vendored brand tokens against source                      |
| `pnpm db:generate`                  | Generate a migration from the schema                               |
| `pnpm db:migrate`                   | Apply migrations                                                   |
| `pnpm demo`                         | Migrate and safely create the repeatable synthetic local demo      |
| `pnpm db:studio`                    | Drizzle Studio                                                     |
| `pnpm seed`                         | Seed the club config and the first admin                           |
| `pnpm fetch`                        | Pull from RaceResult — live network, read `docs/fixtures.md` first |
| `pnpm normalize --load-fixtures`    | Archive the local corpus into `raw_fetch`                          |
| `pnpm normalize`                    | Decode that archive into the result tables                         |

## Testing

Tests sit beside the source they cover, as `*.test.ts`. `src/lib/db/testing.ts` exports `createTestDb()`, which boots a fresh, fully-migrated in-memory PGlite per suite — real Postgres, no mocks, which is why the timeouts are 60s.

```bash
pnpm test
```

There are **two lanes, split by what a test reads.** `pnpm test` reads only code and
synthetic data, so it is safe to run anywhere. A test named `*.local.test.ts` reads the
real RaceResult fixture corpus — production data — and
runs only under `pnpm test:local`, never in CI. See
[`docs/fixtures.md`](docs/fixtures.md) for the corpus, and for the pre-commit hook that
`pnpm install` arms to stop those payloads ever being committed.

## CI

`.github/workflows/ci.yml` runs on every pull request into `dev` and `main`: the privacy
guard first, then `typecheck`, `lint`, `format:check` and `test`, then a migration-drift
check and a fresh-database migration. Node comes from `.nvmrc` — one line, deliberately
not a matrix, because this app runs on one runtime.

CI never runs `pnpm test:local`, `pnpm fetch`, `pnpm normalize` or `pnpm seed`, and
**scheduled ingest must never be added**: `bin/fetch.ts` pulls
production data from a live API. The workflow says so at the top of the file, and
`scripts/ci-workflow.test.ts` holds it.

## Contributing

Branching runs feature → `dev` → `main`. Feature branches (`feat/*`, `fix/*`) cut from `dev` and PR back into it; `dev` PRs into `main` for a release. Nothing lands on `main` directly.

Work is tracked as GitHub issues on `stonematt/bike_race_results`. The triage vocabulary and the agent conventions are documented in `docs/agents/`.

Before designing anything, read three files. [`CONTEXT.md`](CONTEXT.md) is the glossary and is authoritative on domain words — get `conference` and `division` wrong and the model goes with it. [`docs/adr/`](docs/adr/) holds the decisions that are expensive to reverse. [`docs/ux/moments.md`](docs/ux/moments.md) carries the who-by-when frame, the seven moments a coach moves through, and the job stories each view answers. The wayfinder map (`gh issue list --label "wayfinder:map"`) holds what is still foggy.

Read [`docs/brand.md`](docs/brand.md) before building any UI. It holds the rules that constrain code — ink on orange and never white, orange as a highlight rather than a field, navy ground for the banner — plus the fonts, the asset policy, and how to reskin the app for another club. The tokens themselves are vendored into the `@theme` block of `src/app/globals.css` and covered by unit tests, so everything you need is in this repo; `pnpm brand:check` diffs the copy against the upstream design system for whoever has it, and exits 0 for everyone who doesn't.

## License

MIT. See [LICENSE](LICENSE).
