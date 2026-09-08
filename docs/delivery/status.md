# Delivery status

Updated 2026-09-07. **Goal active; foundation merged into dev; D1 acceptance in progress.** No production deployment. The goal has no token budget. The owner approved product defaults and public TDD seams, subject to later recorded decisions; see [accepted contract](accepted-contract.md).

Branch: `feat/local-delivery-foundation`, from current `dev` at `36ab935`. Owner: Astra orchestrator; bounded worker ownership recorded below. Synthetic dev server: loopback port 3100, database `/private/tmp/descenders-d1-browser`; isolated headless Chrome CDP 9224. No email delivery. Stop/restart only these task-owned processes as needed.

GitHub: [delivery epic #121](https://github.com/stonematt/bike_race_results/issues/121), linked as a child of map #1; [milestone 7](https://github.com/stonematt/bike_race_results/milestone/7). Existing implementation issues remain open.

**Accepted**

- Persistent squad definition/membership, invitations and administration are appropriate now, as the product prepares for production.
- Accepted playground UX and Financial Times-style editorial storytelling lead experiential judgment over earlier engineering-led layouts.
- Art direction and data analysis guide a coach's conversation about growth, consistency and participation. Source truth and privacy remain constraints.
- Keep decisions, an audit trail and resumable state. Use Obsidian for progress summaries when available.

**Prepared**

Curated product/design guidance, ADR-0005, supersession pointers on historical UX documents, the delivery plan and this ledger. Recommended corpus home: application docs, with the local playground retained as a private research archive. No second repository initialized and no identifying artifacts copied.

**Known implementation gaps from the preceding read-only audit**

Hosted database URLs throw. Auth uses an environment allowlist rather than invitations/roles. Squad seeding replaces configuration destructively. The complete rider-season experience and CI build/browser gates are missing. These findings are planning evidence, not newly reproduced runtime failures.

**Acceptance ledger**

| Check                              | Status and scope                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Product/code reconciliation        | Read-only inspection completed; no runtime claim.                                                                                       |
| Art-direction review               | Separate agent identified six obsolete assumptions; incorporated into editorial guidance. No visual/browser review ran.                 |
| Documentation formatting/links     | Passed: Prettier check for all changed docs, new local links and git whitespace checks.                                                 |
| Privacy guard                      | Passed on staged documentation: privacy guard clean across 262 tracked files. Manual prose review found no identifying athlete records. |
| App tests/build/browser/migrations | Not run; no application code changed.                                                                                                   |
| Production/Neon/Vercel             | Not configured or deployed.                                                                                                             |

**Decision and action trail**

- 2026-09-07: Owner requested recipe first; read-only audit and proposed execution recipe prepared in the playground.
- 2026-09-07: Owner accepted persistent operations and clarified editorial precedence. Persisted this accepted scope without treating every proposed permission detail as accepted.
- 2026-09-07: Created a documentation branch and curated public-safe guidance into the application. Historical documents retained with replacement pointers.
- 2026-09-07: Obsidian was reachable after scoped CLI escalation. Progress note placement uses the existing tyee vault's SCD area.

- 2026-09-07: Created delivery epic #121 and milestone 7; linked epic beneath map #1. Created the requested Obsidian progress summary using the CLI in the existing SCD area. Documentation only; no implementation issues closed.

- 2026-09-07: Owner confirmed the dev → task branch → reviewed PR → dev → separate release to main lifecycle, Conventional Commits, no-fast-forward PR merges and verified branch cleanup. Persisted in global Codex instructions and repository AGENTS.md/development-lifecycle.md. Shared skills were inspected but not modified. No PR merge or production release was requested by this workflow-setup instruction.

**Foundation delivery audit**

- PR [#122](https://github.com/stonematt/bike_race_results/pull/122), base `dev` at `db1298edd7f6365e55e7ee48282251fc0adc58db`, reviewed head `d3a907230c24052fad9b3517aab8a9225f8bca3a` (the two original commits preserved).
- Independent Standards reviewer `foundation_standards`: zero findings. Independent Spec reviewer `foundation_spec`: zero blockers; activation follow-ups are addressed by the accepted contract and current ledger. Review recorded in the PR body.
- Local Prettier, whitespace and privacy guard passed (264 tracked files). CI run `34188391091` passed privacy, types, lint, formatting, public tests, migration drift and fresh PGlite migrations. Documentation validation does not establish runtime product acceptance.
- Merged into dev with merge commit `36ab935e7c5a8f79e88fa75dd2581499fa65060b` on 2026-09-07 local date. Local dev fast-forwarded; task tip ancestry verified; task branch removed locally and at origin; fetch/prune and both local/remote ref checks confirmed absence. No task worktrees existed to remove.
- Epic #121 and map #1 reconciled in place; milestone 7 remains open. Existing backlog/milestones preserved, no implementation issues closed. Obsidian `tyee/2a/scd/Descenders race reporting.md` updated through CLI.

**D1 owners and next action**

- Database correctness worker: #98 and #106 together, new migration and reporting query tests. One owner for migrations.
- Synthetic setup worker: safe demo command and restart/idempotency behavior. No identifying corpus reads in demo.
- Orchestrator: accepted contract, runtime auth/database integration, ledger, GitHub, browser validation and integration.
- First tests observe approved public reporting queries and management/database boundaries. No new test seam approval is outstanding.
- Reproduce #100 only if baseline tests fail. Start on a disposable synthetic database; never overwrite the existing local database.
- Next: execute D1 red/green slices, verify production build/start and persistent restart, review current diff and merge through the lifecycle. D2-D5 remain unimplemented. Production release, paid resources, real invitations and external athlete-data transfer remain separately authorized actions.

**D1 progress, 2026-09-07 (not accepted yet)**

- Activation contract committed as `15cf1d3`. Auth persistence/build-import fix `32607f2`: public adapter write originally produced a different identity in reporting; shared handle makes the regression pass. Lazy Auth.js configuration avoids build-time PGlite startup. Four focused auth files pass (24 tests); isolated production build passes without previous PGlite abort logs. Browser sign-in still under diagnosis, so this is not full runtime acceptance.
- Hook test correction `85ec60d`: #100 reproduced equivalent absolute hooksPath assertion failure. Installed hook now verified by rejecting a forced synthetic payload; focused 20 tests pass. Personal Git config unchanged.
- Demo worker delivered synthetic bootstrap/CLI, current 2026 and checkpoint 2025 data, two squads, and on-disk reopen/rerun tests. Dedicated CLI two-pass created then no-op. Worker owns remaining default-literal test correction.
- Analyst gate found SQL regex regression, explicit-lap/no-split deficit error and incomplete State Champs/small-field acceptance coverage in working migration. Database worker is correcting all three; analyst re-review required. Intermediate full-suite failures are recorded in `/private/tmp/descenders-d1-public-green.log`, not accepted as baseline exceptions.
- GitHub #123 created for D1 setup/runtime and linked natively under #121. #98/#106 assigned and scoped together in milestone 7; #100 assigned after reproduction. Existing unrelated backlog remains open.
- Browser first run inherited a port-3000 AUTH_URL; explicit port-3100 override applied. Synthetic form submission then failed (Invalid URL with null input / later JSON parse error). Demo worker investigating; no real-email attempt or data transfer.
- Next: fix browser sign-in, complete database analyst re-review, run integrated tests/local corpus/migration upgrade/build/browser checks, record exact head, review both axes, PR into dev and clean up. D2 art-direction brief returned independently; implementation waits for D1.

**D1 follow-up evidence**

- Synthetic setup committed as `6c67746`. Pre-source-binding integrated checks passed: 62 public test files / 891 tests, lint, formatting, privacy and all 15 brand tokens. The subsequent analyst blocker requires another affected verification pass.
- Analyst confirmed the regex, explicit-lap and field-denominator fixes, then proved that any historical TT archive can misclassify normalized results. Worker ownership expanded to schema/normalizer provenance and tests. Selected source revision/mode must commit atomically with normalized results; mere archive changes must remain inert. Legacy rows without provenance fail closed until normalization establishes it.
- Browser diagnosis captured native form POST `Origin: null`; Next parses it as a URL and errors. A same-origin diagnostic header avoids that error, but acceptance must pass without request-header injection. Investigating local host/cookie consistency next. No privacy-header change accepted yet.
- PostgreSQL 17.11 installed via Homebrew for later synthetic parity. Homebrew initialized its default empty cluster at `/opt/homebrew/var/postgresql@17`; no service started. Use a separate task-owned `/private/tmp` cluster for tests.
- Runtime dependency advisory review found NextAuth beta.25 / its nested Auth core 0.37.2 affected by the official magic-link normalization advisory. Targeted beta.32 update and synthetic auth regression verification are required before deployment readiness. See [official advisory](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-7rqj-j65f-68wh).
- Registry dependency audit is not run: sandbox DNS failed, and automatic approval review rejected the network retry because sending dependency metadata to npm lacked destination-specific user authorization. Do not retry that transfer via another tool. Direct official advisory review continued, without exporting the dependency inventory. Explicit owner authorization is required before retrying registry audit.

- Audit authorization resolved after new risk evidence: GitHub reports `isPrivate:false`; public dev and local `pnpm-lock.yaml` both hash to `e4d767df6bb306dd5bd1123ac9e09259bed6d518`; dependency declarations unchanged. The same audit command was then approved by automatic review and completed. No alternative transfer or bypass was used. The earlier pending-approval statement is superseded.
- Production audit reports 13 affected dependency paths (3 critical, 5 high, 5 moderate), across Auth.js, Drizzle and PostCSS. This is an advisory count, not proof of exploitability. Targeted fixes and compatibility verification are required under D5; preserve `/private/tmp/descenders-prod-audit.json` as local evidence. No athlete data or secrets were transferred.

- Browser diagnosis resolved: trusted CDP mouse submission succeeds under existing no-referrer headers. The failed programmatic requestSubmit probe supplied Origin:null. Actual sign-in cookie failure was mismatched AUTH_URL/browser host; consistent `http://localhost:3100` works. No privacy header was relaxed. README/CLI now require matching origin.
- Synthetic browser smoke passed login -> 2026 Cedar -> Summit -> Race 1 -> direct rider category -> Back to Race 1. Desktop 1440 and mobile 390 screenshots were opened and showed no document overflow. These verify existing D1 navigation, not D2 editorial acceptance. Art direction still rejects the roster-wall-first experience for D2.
- Active synthetic dev process was restarted by worker as PID 68462 (no unified exec session); database `/private/tmp/descenders-d1-browser`, AUTH_URL `http://localhost:3100`, bind 127.0.0.1:3100. Chrome remains task-owned CDP9224. Final source-provenance migration must be applied with server stopped before repeating acceptance.

**D1 final acceptance checkpoint**

- Reporting committed as `6ec5a89`; independent data analyst passed selected-source binding, conference fields, State Champs and missing-lap semantics. Public suite: 62 files / 894 tests passed on final production code; the subsequent hidden-copy fixture strengthening passed its six focused tests. Protected reporting lane: eight files / 85 tests passed. No identifying outputs published.
- TDD evidence: conference denominator and missing-layout percentage regressions were observed red first. Source-binding regressions were added after implementation began, following an independent failing reproduction; do not describe that portion as strict red-first development.
- Final production build passed. Migration drift reported no schema changes. Synthetic upgrade from migrations 0000–0004 to 0006 preserved identity, 2026 season, squad and race reporting after reopen. Upgrade used a disposable database, not the owner's existing database.
- Production browser smoke found an additional admission defect: an existing development session with an allowlisted email was admitted despite production disabling the credentials provider. D1 acceptance remains blocked on the correction and repeated production check. Anonymous redirect and no-referrer passed. The earlier development browser journey remains a smoke check only.
- Runtime server currently uses production mode on task-owned localhost:3100. Stop it before rebuilding. Chrome uses isolated profile `/private/tmp/descenders-d1-chrome`, CDP9224. No real mail or invitations were sent.
- Next: regression-first admission correction, final checks and current-head two-axis review, then D1 PR into dev and verified cleanup. Continue D2–D5 after merge; no production authorization implied.
