# Delivery status

Updated 2026-09-08 local date. **Goal active; D1 merged and cleaned up; D2 implementation started.** No token budget. No production deployment, paid resource, real invitation or external athlete-data transfer. The [accepted contract](accepted-contract.md), [plan](plan.md), editorial direction and later ADRs govern remaining work.

GitHub: [epic #121](https://github.com/stonematt/bike_race_results/issues/121), [milestone 7](https://github.com/stonematt/bike_race_results/milestone/7). D1: #98/#106 reporting, #100 hook verification, #123 safe setup/runtime. D2: #125 implements the accepted journey and reuses #89/#34/#82. D5 security: #124. Epic children #123/#124/#125 are linked natively. Unrelated backlog is preserved.

| Increment  | Current state                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation | Merged through PR #122; cleanup verified below.                                                                                               |
| D1         | Merged through PR #126; cleanup verified below.                                                                                               |
| D2         | Implementing #125 on `feat/editorial-reporting`; art/data gates accepted; final code review and PR checks next.                               |
| D3         | Persistent membership/roles, invitations, preferences and safe squad editing remain unimplemented.                                            |
| D4         | Evidence-backed draft/review/publish remains unimplemented.                                                                                   |
| D5         | Driver research and local Postgres binaries prepared; adapter, security upgrades, auth mailbox, CI and recovery runbook remain unimplemented. |

## Current work and resume point

Current branch `feat/editorial-reporting`, from dev `4ad144a72aeaf08bb5d535bbf201bb09cf4ed998`, implementation head `019e37e`. Astra orchestrates. Query layer `a7178b1`, season/roster UI `5bb136a`, legacy wording `f94d645` and race/rider UI `019e37e` are committed. All implementation files are frozen. Parent owns ledger, final integration and delivery lifecycle. Independent Standards and Spec review of the complete D2 diff is next; art and data gates are accepted. D3 preparation is recorded in readiness notes but remains unimplemented. No schema changes in D2.

Development and production smoke servers are stopped; port 3100 is free. Browser origin is matching `http://localhost:3100`, CDP 9224 in isolated profile `/private/tmp/descenders-d1-chrome`. D2 database `/private/tmp/descenders-d2-browser` is synthetic and persistent. It extends the accepted demo with 2025 Race 1/2/3 club starts 2/5/3, an incomplete two-conference Race 4, and a published 2024 race with zero club starters. The scenario intentionally no longer matches the resettable demo signature. Original `/private/tmp/descenders-d1-accepted` remains available. Stop the app before database writes or migrations; never open the same PGlite directory concurrently. No mail delivery configured.

Next: independently review the complete current diff along Standards and Spec, resolve findings and recheck changed work, create the PR into dev, verify final head/checks, merge and clean up. D3–D5 remain active delivery obligations.

## D1 delivery audit

PR [#126](https://github.com/stonematt/bike_race_results/pull/126) merged into dev with merge commit `4ad144a72aeaf08bb5d535bbf201bb09cf4ed998`; reviewed head `38824bc2f3d2fcce7ebf6258eab77e24993428e5`. CI run `34192422103` passed, including 62 public test files / 901 tests. Independent review coverage and resolved findings appear below and in the PR.

Cleanup confirmed: local dev fast-forwarded, reviewed head ancestry verified, local and remote `feat/local-delivery-foundation` deleted, refs pruned and absent. One clean main worktree remained on dev before creating D2 branch. Issues #98/#100/#106/#123 closed, no stale staged labels. Stone-merge run log recorded the result. Epic #121 D1 checkbox and Obsidian journal updated; D2–D5 remain incomplete.

## D2 first slices

- Query contract: explicit checkpoint through ordinal or none. Default latest published ordinal; no published results retains an unpublished schedule. Distinct club riders supply starts, never sums of squads. History preserves all result rows per race; selected event disambiguates. Links retain checkpoint.
- Parent current-season regression ran red: explicit missing 2027 returned 2026. Optional CURRENT_SEASON now prevents that fallback; malformed settings reject. Existing/default lookup remains latest recorded year. Focused season query suite passes 23 tests. Committed as `c073526`. Root empty state offers deliberate recorded-season links rather than seed commands. Authenticated browser check passed: explicit 2027 stays empty at root; 2026 requires its recorded-season link. Test server stopped.
- Dispatch query now suppresses explicit-none data, validates recorded checkpoints, counts distinct club-season riders and treats incomplete conference results as partial with unknown counts. Numerical red/green evidence covers explicit-none false zeros and partial-result false zeros. Initial API red was a missing export; some subsequent characterization cases first ran green.
- First SeasonDispatch passed independent art and data review after correcting unsupported narrative, null-to-zero, mobile race visibility, partial-result fallback, spacing and club-specific copy. Seven initial and four confirmation desktop/mobile captures were inspected; no overflow. Captures are `/private/tmp/descenders-d2-*.png`. This is bounded dispatch acceptance, not full D2 acceptance.
- Keyboard checkpoint selection/submission passed using trusted CDP typeahead, Tab and Enter: Race 2 → Race 3 and `/2025?through=3`. Harness `/private/tmp/descenders-d2-keyboard-typeahead.mjs` assigns no values or synthetic DOM events. Initial focus was programmatic. The original Arrow/Enter CDP sequence failed; its native-popup cause remains unproven.
- Race category query passed independent analyst review: exact event/category/conference fields, club-season highlights, no squad duplication, source status and unknown values preserved. RaceReview and route integration are in progress.
- Rider query: independent analyst PASS after sparse source-slot labels and derived gap provenance corrections. Official totals remain separate from none/one/many measured splits. Unreadable split remains raw with seconds null. Initial missing history, missing neighbors, unreadable-zero and sparse-slot cases ran red; additional guards first ran green.
- Roster query: independent analyst PASS, exact club/season and optional squad scope, includes unassigned/no-result members, preserves every split-event result, checkpoint bounds category grouping. One set-based result read follows the shared dispatch read, not one query per rider. Latest-category ties use source-event-ID order and retain all evidence. Four focused roster tests; combined query suites 26/26.
- Season/roster UI: final independent art PASS after two bounded capture rounds. Sticky rider and category labels survive horizontal table scroll; outer pages have no overflow. Club/squad controls retain checkpoint. Actual UI red/green cases cover lost squad checkpoint, missing roster navigation, result-availability distinctions, split-result preservation/deduplicated participation and unavailable schedule. Parent component/navigation lane 18/18. Static More from this weekend review link and club-roster entry accepted; D4 story publishing remains separate.
- Trusted-click synthetic browser journey passed: dispatch → squad → club → named rider → exact event → Field context → race review, retaining through=2. Harness `/private/tmp/descenders-d2-journey.mjs`; final URL Race 1 with through=2 and exact source anchor. First harness timeout wrongly searched visible text for an aria-label; corrected harness passed. Rider tab changes below require rechecking this journey.
- Race: independent art PASS after two bounded capture rounds and static count/singular/DNF copy closure. Lead/partial coverage, one shared strip, named callouts, singleton and noncomparable states accepted. No page overflow.
- Rider: independent art and analyst code PASS after one combined correction batch and static selected-view/deficit corrections. My ride and Field context are bookmarkable GET perspectives with one visible panel and a visible selected marker. Selected official evidence precedes compact history; missing values, source-slot labels, DNF/lap deficits, field qualifiers and rounded gaps relative to this rider are explicit. Meaningful DNF guard regression was confirmed red by removing the guard, then restored green (6 rider tests). Two visual rounds, no overflow; no third round needed for copy/classes.
- Final Impeccable detector returned `[]`; no plugin initialization/update or additional capture loop. This supports the separate art/data gates rather than replacing them.
- Integrated checks: full public suite 69 files / 956 tests passed before the final DNF regression addition. Final rider lane 6/6 and legacy language lane 52/52 passed afterward. Types/lint/repository formatting passed; final-head CI must cover the completed test set. Protected local lane 8 files / 85 passed without refetch or identifying output. All 15 brand tokens match. Privacy guard clean across 294 tracked files.
- Production build passed. Local production startup, anonymous redirect, retained development-session rejection, development provider disabled despite AUTH_DEV_LOGIN=1, and no-referrer passed. This does not establish hosted-driver or production email readiness (D5).
- Corrected browser journey passed actual GET perspective switch and native browser Back, then exact-source race review with through=2. Direct future/invalid checkpoint URLs returned 404; legacy event URL retained year, checkpoint and source anchor. Scripts `/private/tmp/descenders-d2-{journey,direct}.mjs`; all task app servers are now stopped.
- D2 commits: `c073526` current-season selection, `5fbaf73` D1 cleanup activation ledger, `a7178b1` reviewed editorial queries, `5bb136a` season/roster navigation, `f94d645` honest legacy descriptions, `019e37e` race/rider views. No D2 PR or merge yet.

**Foundation delivery audit**

- PR [#122](https://github.com/stonematt/bike_race_results/pull/122), base `dev` at `db1298edd7f6365e55e7ee48282251fc0adc58db`, reviewed head `d3a907230c24052fad9b3517aab8a9225f8bca3a` (the two original commits preserved).
- Independent Standards reviewer `foundation_standards`: zero findings. Independent Spec reviewer `foundation_spec`: zero blockers; activation follow-ups are addressed by the accepted contract and current ledger. Review recorded in the PR body.
- Local Prettier, whitespace and privacy guard passed (264 tracked files). CI run `34188391091` passed privacy, types, lint, formatting, public tests, migration drift and fresh PGlite migrations. Documentation validation does not establish runtime product acceptance.
- Merged into dev with merge commit `36ab935e7c5a8f79e88fa75dd2581499fa65060b` on 2026-09-07 local date. Local dev fast-forwarded; task tip ancestry verified; task branch removed locally and at origin; fetch/prune and both local/remote ref checks confirmed absence. No task worktrees existed to remove.
- Epic #121 and map #1 reconciled in place; milestone 7 remains open. Existing backlog/milestones preserved, no implementation issues closed. Obsidian `tyee/2a/scd/Descenders race reporting.md` updated through CLI.

## D1 implementation and evidence

- `15cf1d3`: accepted product defaults/public TDD seams activated in canonical docs.
- `32607f2`: auth and reporting share persistent identity; lazy auth configuration avoids build-time PGlite startup. Adapter identity and initialization regressions were observed red, then green.
- `85ec60d`: reproduced #100 equivalent absolute hooksPath failure; installed hook now verified by rejecting a forced synthetic payload. Personal Git configuration unchanged.
- `6c67746`: synthetic demo command with 2026 current season, 2025 checkpoint and two squads; no private corpus/config/name-map input. Reopen/rerun tests passed. Independent review subsequently found migration occurred before unrelated-database refusal; corrected in `0b09ca3` with refusal before migration, recognized older-demo upgrade, and command-level legacy/public/custom-schema regressions. Only the exact Drizzle migration metadata table is exempt.
- `6ec5a89`: conference-specific denominators, combined State Champs field and exact source revision binding; ADR-0006 records provenance. Merely archiving a later/hidden alternative cannot reclassify normalized rows; legacy missing provenance fails closed until normalization.
- `f57ba67`: matching browser/AUTH_URL guidance and explicit application build-tracing root.
- `080564c`: production rejects a development-provider token even when its email is allowlisted. Browser smoke reproduced the defect; the regression was run red before the fix. Email-provider allowlist behavior remains valid.
- `c9ce385`: sole selected hidden TT source follows the bound-source contract. Public archive → normalize → reporting regression ran red (place instead of 10% back), then green. Independent analyst re-review passed with zero findings; unselected archives remain inert.

| Check                     | Evidence and limits                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public suite              | 62 files / 900 tests passed after c9ce385 and the initial preflight correction. The final additional Drizzle-schema refusal regression and demo/URL lane passed (12 tests); final-head CI passed (901 tests), recorded above.    |
| Protected local corpus    | Full configured local lane passed: eight files / 85 tests after c9ce385. No refetch or identifying output published.                                                                                                             |
| Types/lint/format/privacy | Final correction typecheck passed. Integrated lint, formatting, whitespace and privacy passed (277 tracked files).                                                                                                               |
| Brand                     | All 15 tokens matched; check was not skipped. D1 adds no visual redesign.                                                                                                                                                        |
| Production build          | Passed after080564c, without earlier eager-PGlite aborts.                                                                                                                                                                        |
| Production browser        | Retained original development cookie rejected after080564c; anonymous redirect, provider disabled despite AUTH_DEV_LOGIN=1, and no-referrer passed.                                                                              |
| Development browser       | Fresh final-migration database: synthetic login → Cedar → Summit → Race 1 → direct category → Back passed. Opened 1440px desktop and 390px mobile captures with no overflow. Existing D1 UI only, not D2 editorial acceptance.   |
| Migrations                | Fresh migrations and non-mutating drift check passed after c9ce385. Disposable 0000–0004 → 0006 upgrade/reopen preserved identity, current season, squad and reporting on the final migration bytes. Owner's database untouched. |

TDD limits: conference denominator, missing-layout percentage, auth persistence/startup and dev-token regressions ran red first. Initial source-binding tests followed implementation after an independent failing analyst reproduction; do not claim strict red-first development for that portion. Subsequent sole-hidden-source correction did run red first.

## Review audit

- Independent Standards and Spec reviewed base 36ab935 through 080564c. Both found the demo migration-before-refusal defect; Spec also found sole-hidden-TT mismatch. Do not treat these reviews as unconditional approval.
- Analyst re-review passed the c9ce385 correction. Independent Standards reviewer passed exact c9ce385...0b09ca3342934b55689c72f9ae992251cae65456 demo delta with zero remaining Standards/Spec findings.
- Spec reviewer authored the earlier hook correction 85ec60d; separate Standards reviewer independently checked that commit against #100 and passed with zero findings. The remaining Spec review was independent.
- No human GitHub approval is replaced by these agent reviews. Current diff/head, review state, findings and checks must be rechecked before merge.

## Decisions and readiness investigations

The owner activated delivery on 2026-09-07, approving product defaults/public seams subject to later decisions. Persistent administration and reviewed editorial writes narrowly supersede the historical plate-attachment-only rule; no private behavioral notes or discussion logs are authorized. Art direction and data analysis govern reporting acceptance. See [readiness notes](readiness-notes.md) for D2 composition and D5 transport research.

Browser diagnosis preserved privacy headers: programmatic requestSubmit produced Origin:null; trusted post-hydration mouse submission succeeds. The actual sign-in cookie bounce came from mismatched AUTH_URL/browser hosts. Use one matching origin. Production smoke then exposed the separate dev-token replay defect fixed above.

Registry audit history: initial network escalation was rejected because dependency metadata transfer to npm lacked destination-specific authorization. New read-only evidence proved the repository public and the local lockfile identical to public dev (Git blob e4d767df6bb306dd5bd1123ac9e09259bed6d518). The same audit was subsequently approved and completed; no alternate transfer or bypass was used. The initial approval blocker is resolved.

Audit reports 13 advisory findings (3 critical, 5 high, 5 moderate), not proof of exploitation. Auth.js, Drizzle and PostCSS targeted compatibility/security updates are required under #124 before readiness. Local evidence: `/private/tmp/descenders-prod-audit.json`. No athlete data or secrets transferred.

PostgreSQL 17.11 installed via Homebrew for disposable synthetic parity. Homebrew initialized its empty default cluster at `/opt/homebrew/var/postgresql@17`; no service started. Use a separate task-owned temporary cluster, not that default. Standard node-postgres pool/Drizzle transport is the proposed implementation; no hosted provider is verified.

Obsidian journal: `tyee/2a/scd/Descenders race reporting.md`, maintained exclusively through the CLI. Updated at 080564c checkpoint with foundation merge, D1 evidence, auth discovery, advisory work and remaining increments. D1 merge has also been recorded; refresh at the next integrated milestone. Canonical implementation state stays in this repository.

Documentation accuracy/scope review by `foundation_spec` passed after correcting final migration status and advisory terminology; final PR/CI facts are recorded in #126 before merge.
