# Publish runbook: hosted deployment of the reporting app

Working document for the first hosted deployment. It records what has actually
been done, by whom, and what remains. It carries **variable names and command
shapes only** — never a secret, connection string, token, or real address.

Related: [#129](https://github.com/stonematt/bike_race_results/issues/129)
(provider/hosted readiness), [recovery runbook](recovery-runbook.md) (runtime
modes, migration order, rollback), [status](status.md) (delivery ledger).

## Standing constraints

These are not negotiable by convenience during this work.

- The app is members-only. Every hosted surface must stay unindexed,
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
| 5   | Mail sender and its DNS records                     | operator         | done        |
| 6   | Host project, environment variables, build settings | operator         | done        |
| 7   | Domain and TLS                                      | operator + agent | done        |
| 8   | Verification pass                                   | agent            | not started |
| 9   | Ledger entry and issue close-out                    | agent            | in progress |

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

| Name                  | Value shape                                                            | Where it is set                                 |
| --------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| `DATABASE_URL`        | pooled hosted URL for the app; direct URL for migrations               | host env, and the operator's shell for CLI runs |
| `AUTH_SECRET`         | `npx auth secret`                                                      | host env                                        |
| `AUTH_URL`            | the canonical `https://` origin                                        | host env                                        |
| `AUTH_EMAIL_SERVER`   | `smtps://<user>:<key>@<host>:465` — the scheme, not the port, sets TLS | host env                                        |
| `AUTH_EMAIL_FROM`     | the sending address                                                    | host env                                        |
| `AUTH_ALLOWED_EMAILS` | bootstrap admin address                                                | operator's shell at seed time only              |
| `CURRENT_SEASON`      | four-digit year, optional                                              | host env                                        |
| `AUTH_DEV_LOGIN`      | absent                                                                 | nowhere                                         |

Runtime authorization is the active `club_membership` row read on each protected
request. `AUTH_ALLOWED_EMAILS` bootstraps the first admin and nothing else; it
is not an invitation list and cannot restore a revoked membership.

## Release prep: preview branch and migration rhythm

`bin/wizard-release-prep` walks the operator through every release, one gated
step at a time; run it rather than doing this by hand. See #179 and the
decision in #181.

- **Neon account.** The results database lives under the Neon account
  `admin@scdescenders.com`, not the operator's personal Neon account. It needs
  its own CLI profile, `scd` (`neon profile create scd --keyring` signs in
  through the browser; sign in as the club address — a private browser window
  avoids reusing the personal session). Every Neon call for this project
  passes `--profile scd`.
- **Previews use a dedicated `preview` Neon branch**, copy-on-write from
  `production`. It is reset from production every release
  (`neon branches reset preview --parent`), so it is always a fresh copy.
- **Vercel Preview scope** holds one set of variables, every one scoped to the
  git branch `dev` (`vercel env add NAME preview dev`), never to Preview as a
  whole:
  - `DATABASE_URL`: the `preview` branch's pooled URL, marked sensitive.
  - `AUTH_URL`: the `dev` preview's stable branch address, not Production's.
  - `AUTH_SECRET`: generated for Preview; never a copy of Production's.
  - `AUTH_EMAIL_SERVER`: Production's value, reused.
  - `AUTH_EMAIL_FROM` and `CURRENT_SEASON`.

  Only the `dev` preview can sign in. Other branches' previews and one-off
  deployment addresses get none of these. Development still holds none.

- **Why that is safe.** The `dev` preview sits behind Vercel Authentication and
  the membership check, and its database is a copy of production, reset every
  release. Preview never holds a production database URL. `AUTH_DEV_LOGIN`
  stays absent on every hosted scope.
- **The Resend key is shared** between Production and Preview, inside
  `AUTH_EMAIL_SERVER`. Rotating it means updating both scopes.
- **Per-release sequence.** The wizard's stages, in order:
  1. Neon profile.
  2. Reset `preview` from production, or create it if absent.
  3. Set the `dev`-scoped Preview variables, then remove any Preview-wide
     copy of them, asking before each removal.
  4. Migrate `preview`: `db:status` (once #173 lands), then `db:migrate`, on
     the direct URL. The wizard runs these itself, so the connection string
     never reaches the terminal.
  5. UAT on the `dev` preview, starting at `/signin` (#183). As admin: real
     Season data, and Club accounts visible. As the coach UAT user: the same
     data, stories open, and Club accounts, Approve and Publish absent. Until
     #182's [owner step](#owner-step-the-coach-uat-membership) grants the
     coach membership, the coach half is
     recorded as skipped. The wizard prints a UAT record; paste it, gaps
     included, into the release PR.
  6. Migrate production, then promote `dev` → `main`. Owner steps: the wizard
     prints the production commands, which read the direct URL from
     `~/.config/scdescenders/neon-direct.env`, and waits.
- `bin/preview-env-setup` and `bin/preview-env-reset` never landed. #175 task 3
  specified them before the `dev` scoping. As specified they would write
  Preview-wide variables, so the wizard doesn't use them.

## Hosted credentials: the `--env-file` rule

Production and preview connection strings never enter a checkout, and never
as `.env.local`. Every other `bin/` script loads `.env.local` (`bin/env.ts`),
so a production URL there would silently point `seed`, `db:migrate` and
`normalize` at production from then on. The direct URLs live in the operator's
password manager and a `chmod 600` file outside every checkout, such as
`~/.config/scdescenders/neon-direct.env`. A hosted run names that file
explicitly:

- `pnpm membership:grant --env-file <path> …` reads `DATABASE_URL` from the
  named file and nothing else. It never loads `.env.local`, the file's
  `DATABASE_URL` wins over the shell's, and without `--env-file` it refuses a
  hosted `DATABASE_URL` from the shell.
- Scripts that load `.env.local` take the file through a subshell, as the
  release-prep wizard prints them:
  `( set -a; . <path>; set +a; pnpm db:migrate )`. A variable already set in
  the shell wins over `.env.local`.

## Operator grant: a Club membership outside the app

`pnpm membership:grant` (`bin/grant-membership.ts`, #182) grants a `coach` or
`member` Club membership to an email address. It is the operator path outside
the app: a direct grant, not an invitation, and a script, not a migration.
`admin` is refused. Admin keeps its own bootstrap (`pnpm seed --email`) and
promotion in the app.

```bash
pnpm membership:grant --env-file <path> --email <address> --role coach
pnpm membership:grant --env-file <path> --email <address> --role coach --apply
```

- **A dry run by default.** It prints the database host and name, the Club,
  the email, the role, the current state (user row, membership, revoked or
  not) and the exact planned writes. It writes nothing.
- **`--apply`** refuses without an interactive terminal, and writes only after
  the database host is typed at the prompt. It runs one transaction: find or
  create the user, matching the email as the sign-in gate does (trimmed and
  lowercased); insert the membership; write a `club_audit_event` with action
  `membership.granted`, the user as subject and a null actor.
- **`--club <slug>`** may be left off when the database holds exactly one
  Club. The dry run names the Club it chose.
- **It writes nothing, and says so,** when the membership is already active in
  that role. It reports and leaves alone a revoked membership, an active
  membership in another role (role changes are made in the app), and an email
  that matches more than one user row.
- **Exit codes:** `0` for a dry run, a grant, or nothing to write; `1` for a
  refusal or a state it leaves alone; `2` for a usage error, including
  `--role admin`.

### Owner step: the coach UAT membership

Run this in the owner's own terminal, never in an agent session. The coach UAT
address stays off the tracker and out of the repository. The grant is made
once, in production, and every reset of `preview` carries it.

1. Dry run against production. Check that the host is production's, that the
   Club is the right one, and that the planned writes are the expected ones:
   `pnpm membership:grant --env-file ~/.config/scdescenders/neon-direct.env --email <coach UAT address> --role coach`
2. Run it again with `--apply`, and type the host when asked.
3. Confirm by running the dry run once more. It reports
   `membership: active coach` and nothing to write: one active membership.
4. The next release's reset of `preview` carries the membership, so the
   release-prep wizard runs the coach half of UAT instead of recording it as
   skipped.

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
  committed keyed config, 32 riders), a synthetic admin, `normalize` on an
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
  in as `.env.local`. _Amended by #182:_ that file is no longer symlinked in as
  `.env.local`. A hosted run names it explicitly; see
  [Hosted credentials](#hosted-credentials-the---env-file-rule).
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
- 2026-09-09. Phase 6 opened, then **paused mid-flight by the operator**. Vercel
  CLI authenticated against the personal Hobby account; project
  `bike-race-results` created in the personal scope. It is **not connected to
  the repository**, so nothing deploys and no public URL exists. The link used
  for CLI work lives in a session scratch directory rather than the worktree, so
  no `.vercel` directory entered the checkout — but `.gitignore` still needs a
  `.vercel` line before anyone runs `vercel` from the repository itself.
  `CURRENT_SEASON` was set in the Production scope. `DATABASE_URL`,
  `AUTH_SECRET` and `AUTH_URL` are **not yet set**; the pooled URL was derived
  from the direct one — the endpoint host with a `-pooler` suffix, `sslmode`
  already `verify-full` — and never printed.
- 2026-09-09. Open question closed: `admin@scdescenders.com` is a **real
  mailbox**, not a forwarding alias. It can receive magic-link mail, so the
  bootstrapped admin is sufficient for the phase 8 sign-in test and no second
  address needs seeding.
- 2026-09-09. **Blocker found: `main` is 228 commits behind `dev`**
  (`origin/main` at `7079fe4`, `origin/dev` at `b93f5c9`). The standing decision
  that the host's production branch is `main`, not the repository default `dev`,
  is what keeps unreviewed work off the production origin — so it
  stands. But `main` today would deploy a months-old application against a schema
  migrated from current code. The operator is landing a large merge into `dev`
  and will release it to `main`; the host wiring waits for that release.
  Sequence when it resumes, and the order matters: set the production branch and
  Deployment Protection **before** connecting the repository, because connecting
  triggers an immediate production deployment.
- 2026-09-09. Re-check before deploying: the pending merge may move the schema.
  If it does, migrate the Neon `production` branch again and re-verify the view
  and membership counts before the first deployment serves a request.
- 2026-09-09. Release landed. PR [#149](https://github.com/stonematt/bike_race_results/pull/149)
  promoted `dev` into `main` — 244 commits, 60 merged PRs — merging at
  `0ba39c64069f292906b974c1f5525bd936423101`. Both CI checks passed: the
  production browser gate and the typecheck/lint/format/test lane. The full-diff
  review gate was waived by the owner on the explicit ground that a 244-commit
  release PR is not a sensible review unit and each constituent PR was reviewed
  under `review: pocock` as it landed; the stored policy is unchanged and a
  separate multi-agent review of the stack is planned as follow-up. The schema
  re-check held: `src/lib/db/migrations/` was unchanged, so the hosted database
  needed no re-migration before the first deployment.
- 2026-09-09. Phase 6 completed. Deployment Protection was **already** enabled —
  Vercel Authentication, Standard Protection — so no change was needed. Standard
  covers every generated deployment URL including the production `.vercel.app`
  origin and exempts only custom production domains, which is the posture to
  keep: once `results.scdescenders.com` is attached the app's own login and
  season wall guard it, and "All Deployments" would put a Vercel account login in
  front of club members and break magic-link sign-in.
- 2026-09-09. **Correction to the recorded order.** The prior entry's sequence —
  set the production branch _before_ connecting the repository — is not
  achievable. The production-branch field does not exist until a repository is
  connected: Settings → Environments → Production shows Branch Tracking with no
  input, and Settings → Git has no Production Branch section. On connection
  Vercel set the production branch to `main` on its own rather than to the
  repository default `dev`, so the outcome was correct without intervention.
  The risk the ordering guarded against was in any case gone, `main` being the
  merge commit of `dev` and therefore content-identical.
- 2026-09-09. Vercel's GitHub App was installed with **Only select
  repositories** and this repository was not among them, so the repository did
  not appear in the connect picker. The operator granted access to
  `stonematt/bike_race_results` specifically and kept the select-repositories
  posture, so a future private repository cannot be reached by the host unless it is deliberately added.
- 2026-09-09. Environment variables set, **Production scope only**: `AUTH_URL`,
  `AUTH_SECRET` (both by CLI, values piped rather than typed so neither entered
  a shell history) and `DATABASE_URL`, the pooled endpoint, set in the dashboard.
  With `CURRENT_SEASON` that is four. Since #181, Preview is to hold the
  `dev`-scoped set described under Release prep, set by the release-prep
  wizard; Development still holds none. `AUTH_DEV_LOGIN` remains absent.
  `AUTH_EMAIL_SERVER` and `AUTH_EMAIL_FROM` wait on phase 5.
- 2026-09-09. TLS switches validated against the code that consumes them.
  `src/lib/db/runtime.ts` builds its pool with a connection string and **no**
  explicit `ssl` option, so the string is authoritative; the driver is `pg`
  8.23.0 with `pg-connection-string` 2.14.0. `sslmode=verify-full` parses to
  `rejectUnauthorized: true`, and because `pg` passes `servername` the hostname
  is checked against the certificate as well — chain and identity both. Neon's
  certificates chain to a public CA, so no CA file has to travel with the app.
  `channel_binding=require` is honoured by libpq clients and is most likely
  inert on the node-postgres path, which implements SCRAM-SHA-256 but not
  SCRAM-SHA-256-PLUS; it is harmless and worth keeping for CLI sessions, but
  `verify-full` is what protects the application connection.
- 2026-09-09. First production build **failed**:
  `Error: No Output Directory named "public" found after the Build completed`.
  The Next.js compile itself succeeded — every route built, only two `<img>` LCP
  warnings — and the failure came afterwards, at output packaging. Cause: the
  project was created CLI-first with no repository attached, so Vercel never ran
  framework detection and left the Framework Preset at `Other`, which looks for
  a static `public/` directory instead of Next.js output. There is no
  `vercel.json` in the repository and no override was set; the preset alone
  explains it. **A CLI-created Vercel project does not auto-detect its framework
  the way an imported repository does** — anyone recreating this project from
  scratch will hit the same failure. Preset changed to `Next.js` with no
  overrides.
- 2026-09-09. **First production deployment is live.** Redeploy of the same
  commit `0ba39c6` on `main` succeeded in one minute and is serving at the
  project's generated production origin behind Vercel Authentication. No custom
  domain is attached yet, so phase 7 is what remains before the canonical origin
  resolves. Sign-in is deliberately unavailable until phase 5: `src/auth.ts`
  registers providers conditionally, so with `AUTH_EMAIL_SERVER` unset no
  provider is offered and the sign-in page says so rather than failing.
- 2026-09-09. **Hazard, recorded because the project is now linked.** Never run
  `vercel deploy` from the publish worktree. It uploads the local working tree,
  and that tree carries `.env.local` and `fixtures/` as symlinks to real
  credentials and real athlete data. _Amended by #182:_ production credentials
  no longer enter a checkout as `.env.local` (see
  [Hosted credentials](#hosted-credentials-the---env-file-rule)), but the
  upload stays unsafe regardless. Every deployment must originate from git —
  a push to `main`, or a redeploy of a commit already there. `.gitignore` covers
  `.vercel/`; there is no `.vercelignore`, and adding one would not make a
  working-tree upload safe.
- 2026-09-09. **Phase 7 done. `results.scdescenders.com` is live over TLS.** The
  domain was added to the project by CLI, which reported _Invalid Configuration_
  and recommended an apex-shaped `A` record to `76.76.21.21`. A `CNAME` to
  `cname.vercel-dns.com` was published at Squarespace instead — the documented
  record for a subdomain, and it survives a renumbering of that address. Host
  entered as the bare prefix `results`, because Squarespace appends the zone.
  Vercel also offered to take over the nameservers for `scdescenders.com`; that
  was declined and must stay declined, since the zone carries the club's website
  and will carry the phase 5 mail records. `vercel domains inspect` still shows
  every nameserver as mismatched for exactly that reason — it is reporting on the
  zone, not on this record, and is not a fault to chase.
  Certificate issued roughly two minutes after the record resolved. Verified
  signed out: `/`, `/races`, `/clubs` and `/2026` all answer `307` to
  `/signin?callbackUrl=…`; `strict-transport-security` and
  `x-robots-tag: noindex, nofollow, noarchive` are present; `/robots.txt` is
  `Disallow: /`; `/api/auth/session` is `null`; and `/api/auth/providers` is
  `{}`, which is the conditional provider registration confirmed in production —
  no provider exists until `AUTH_EMAIL_SERVER` is set.
  This exercises the posture recorded under phase 6: Standard Protection exempts
  custom production domains, so on this origin the app's own session check is the
  only thing in front of the app's data. The probe above is the evidence that it
  holds. Re-run it after any change to middleware or to Deployment Protection.
- 2026-09-09. Adding the domain by CLI was refused by the agent's auto-mode
  classifier — an origin change, the same gate that refuses `vercel env add`.
  The operator ran it. Read-only verification (`dig`, `curl`, `vercel domains
inspect`) was not gated, so the whole confirmation pass stayed with the agent.
- 2026-09-09. Phase 5 mail sender, DNS half. Resend account created under
  `admin@scdescenders.com` (team `scdescenders`, free tier, no card), sending
  domain `send.scdescenders.com` in `us-east-1`. **Tracking subdomain left
  blank** and click/open tracking therefore off — fewer DNS records, and no
  rewriting of links in mail that carries sign-in tokens.
  Resend's current record set is **not** the `MX` + SPF `TXT` shape older notes
  predict. It issues three: `TXT resend._domainkey.send` (DKIM) and two
  `CNAME`s, `rsend.send` → `rsend.forge.rmta.net` and `send.send` →
  `send.forge.rmta.net`. All three entered at Squarespace as bare prefixes; all
  three resolved on `8.8.8.8` before Resend's own poll caught up.
  The Resend dashboard middle-truncates record values with `[…]`. It is a
  rendering artifact, not elision — the DKIM string reassembled from the two
  visible halves parses as a valid 1024-bit RSA public key (216 chars, correct
  SPKI header), and Resend later rendered all three values in full, matching
  what had been entered. Do not treat those values as unreadable.
  Squarespace's DNS Settings page warns _You're using custom nameservers …
  records below are inactive_. It is wrong here and should be ignored: the zone's
  delegation lists both `ns0*.squarespacedns.com` and `dns*.p07.nsone.net`
  (Squarespace's DNS runs on NS1), so its own UI reads the zone as third-party.
  The phase 7 `results` CNAME sits in that same Custom records list and resolves.
  Resend independently reports `PROVIDER: NS1`.
  DMARC deliberately **not** published. Resend offers it at a bare `_dmarc`,
  which at this zone means `_dmarc.scdescenders.com` — a policy over the whole
  club domain, including the Google Workspace mail on the apex `MX`. It is
  optional for sending. If it is ever wanted, it belongs at `_dmarc.send`.
  TLS set to **Enforced** on the sending domain (Configuration tab). Scoped to
  mail Resend sends from `send.scdescenders.com` — today only magic links — and
  it does not touch club mail, which is a different domain on Google's MTA.
  Opportunistic TLS delivers in cleartext when the receiving server will not
  negotiate, and is downgrade-attackable; a magic link is a bearer token, so an
  undelivered message that shows up in Resend's Logs beats a token in the clear.
  Resend SMTP, from its docs: host `smtp.resend.com`, username `resend`,
  password the API key, port `465` for implicit TLS. The scheme must be
  `smtps://` — see the correction dated below; `smtp://` on 465 does not work.
  Still open at the end of this entry: the API key, `AUTH_EMAIL_SERVER` and
  `AUTH_EMAIL_FROM` on Production scope only, and the redeploy.
- 2026-09-09. Phase 5 complete. A Resend API key scoped to **Sending access**
  and to `send.scdescenders.com` alone (not Full access, not All domains) is the
  password in `AUTH_EMAIL_SERVER` =
  `smtps://resend:<key>@smtp.resend.com:465`. `AUTH_EMAIL_FROM` is
  `Descenders Race Dashboard <results@send.scdescenders.com>`, matching the app
  title in `src/app/layout.tsx`. Both were set on **Production scope only**.
  Since #181, Preview is to carry its own `dev`-scoped copies, set by the
  release-prep wizard. What keeps production data safe there is that the `dev`
  preview sits behind Vercel Authentication and the membership check, and its
  database is a copy of production, reset every release.
  `AUTH_EMAIL_SERVER` is stored as a Vercel **Secret**, `AUTH_EMAIL_FROM` as
  **Config**, since only the first carries the key.
  Setting the variables does nothing on its own: `/api/auth/providers` still
  answered `{}` until the deployment was replaced. Redeployed the current
  production deployment (PR #149, `main`) from the dashboard — same source, new
  project settings — which was not refused by the classifier, unlike
  `vercel env add`. Ready in 1m17s.
  Verified after: `/api/auth/providers` returns the `nodemailer` provider, and
  its `callbackUrl` is on `results.scdescenders.com` rather than the `.vercel.app`
  name, so `AUTH_URL` governs the link a coach receives. The signed-out posture
  survived the redeploy — `/races` still `307`s to `/signin`, `/robots.txt` is
  still `Disallow: /`.
- 2026-09-09. **Hazard, cost one failed sign-in.** `AUTH_EMAIL_SERVER` was first
  set to `smtp://resend:<key>@smtp.resend.com:465` and the first hosted sign-in
  failed with `[auth][error] Error: Greeting never received` in the Vercel
  runtime log on `POST /signin`, surfacing to the browser as
  `/api/auth/error?error=Configuration`. Nodemailer takes TLS from the URL
  **scheme, not the port**: `smtp://` means `secure: false`, so it opened a
  plaintext socket to 465, which expects TLS immediately, and neither side ever
  spoke. The correct value is **`smtps://`** on 465 (or `smtp://` on 587 for
  STARTTLS; implicit TLS on 465 suits the Enforced posture better).
  Two diagnostics worth reusing. Resend's **Emails** and **Logs** were both
  empty, which localises the fault upstream of Resend rather than in the domain
  or the key. And `vercel logs https://results.scdescenders.com --json` is
  read-only, was not refused by the classifier, and carried the actual exception
  where the browser showed only `error=Configuration`.
  Local parity could not have caught this. `docs/delivery/dependency-readiness.md`
  records the Nodemailer path exercised only against a loopback capture, and
  `docs/delivery/status.md` gives that capture's address as `127.0.0.1:2525`;
  implicit TLS was never on that path, so `smtp://` was right locally and wrong
  hosted. This is the class of gap phase 8 exists for.
  Corrected to `smtps://` and redeployed. The first hosted magic link then sent:
  the browser reached `/api/auth/verify-request` with "Check your email", and
  Resend's Emails list shows one message to `admin@scdescenders.com`, subject
  "Sign in to results.scdescenders.com", status **Delivered**. That proves the
  hosted app reached Resend over implicit TLS and Resend's handoff was accepted
  by Google. It does not prove the message reached a mailbox, and it does not
  itself observe the receiving TLS hop — `Delivered` is Resend's report of
  acceptance. Where the message actually landed is the next entry.
- 2026-09-09. **The first magic link landed in spam**, and this is expected to
  repeat for every coach's first sign-in. Resend reported `Delivered`, so Google
  accepted the message; the filtering happened after acceptance. Authentication
  was not the problem — DKIM is published at `resend._domainkey.send`, and the
  bounce domain `send.send.scdescenders.com` resolves through
  `send.forge.rmta.net` to a valid `v=spf1 ... ~all`. What is missing is DMARC:
  there is no `_dmarc.send.scdescenders.com`, and no `_dmarc.scdescenders.com`
  for a receiver to fall back to at the organizational domain. A days-old
  sending domain with no published policy is a spam-folder call.
  Fix belongs at **`_dmarc.send`**, not the bare `_dmarc` Resend offers —
  subdomain-scoped, so the club's Google Workspace mail on the apex is untouched.
  `v=DMARC1; p=none; rua=mailto:admin@scdescenders.com` is monitoring-only and
  cannot cause a rejection.
  **Rollout consequence:** whatever coaches are given at onboarding has to tell
  them to check spam for the first sign-in link. Reputation improves with age
  and volume, so this fades rather than needing a permanent workaround.
  Separate, pre-existing, and deliberately not touched: the apex
  `scdescenders.com` publishes no `v=spf1` record at all — only the Google
  site-verification TXT — so the club's own Workspace mail is unauthenticated by
  SPF. Fixing that changes live club mail and is the operator's decision.
- 2026-09-09. DMARC published at **`_dmarc.send`**, value
  `v=DMARC1; p=none; rua=mailto:admin@scdescenders.com`. Verified from outside:
  `_dmarc.send.scdescenders.com` resolves, `_dmarc.scdescenders.com` is still
  absent, and the apex Google Workspace `MX` set is unchanged — the scoping held,
  so club mail carries no new policy. The sending domain now publishes all three
  of DKIM, SPF (on the bounce domain) and DMARC. This does not rescue mail
  already filtered; it changes how later messages are judged.
  The operator confirmed the magic link worked once retrieved from the spam
  folder, so the hosted sign-in path is proven end to end.
- 2026-09-11. A release-prep wizard run was stopped partway, after it had set
  `DATABASE_URL`, `AUTH_URL`, `AUTH_EMAIL_FROM` and `CURRENT_SEASON` on all of
  Preview rather than on the `dev` branch. `AUTH_URL` probably holds
  Production's value. Evidence: the #181 decision comment. The reworked wizard
  moves them to `dev` scope, asking before each removal.
