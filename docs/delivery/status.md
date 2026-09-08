# Delivery status

Updated 2026-09-07 local date. **Goal active; D1 merged and cleaned up; D2 implementation started.** No token budget. No production deployment, paid resource, real invitation or external athlete-data transfer. The [accepted contract](accepted-contract.md), [plan](plan.md), editorial direction and later ADRs govern remaining work.

GitHub: [epic #121](https://github.com/stonematt/bike_race_results/issues/121), [milestone 7](https://github.com/stonematt/bike_race_results/milestone/7). D1: #98/#106 reporting, #100 hook verification, #123 safe setup/runtime. D2: #125 implements the accepted journey and reuses #89/#34/#82. D5 security: #124. Epic children #123/#124/#125 are linked natively. Unrelated backlog is preserved.

| Increment  | Current state                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation | Merged through PR #122; cleanup verified below.                                                                                               |
| D1         | Merged through PR #126; cleanup verified below.                                                                                               |
| D2         | Implementing #125 on `feat/editorial-reporting`; checkpoint query and first dispatch UI in parallel.                                          |
| D3         | Persistent membership/roles, invitations, preferences and safe squad editing remain unimplemented.                                            |
| D4         | Evidence-backed draft/review/publish remains unimplemented.                                                                                   |
| D5         | Driver research and local Postgres binaries prepared; adapter, security upgrades, auth mailbox, CI and recovery runbook remain unimplemented. |

## Current work and resume point

Current branch `feat/editorial-reporting`, from dev `4ad144a72aeaf08bb5d535bbf201bb09cf4ed998`. Astra orchestrates. D2 `d1_reporting` owns new editorial query/types/tests; `d1_demo` owns the first SeasonDispatch component/test and season page. Parent owns current-season root/query/config integration and ledger. No schema changes authorized within these first slices; demonstrate a need before changing that boundary. Preserve other workers' files.

Task-owned development server was stopped after acceptance; port 3100 is free. Synthetic database `/private/tmp/descenders-d1-accepted` remains for restart and later increments. Isolated Chrome: CDP 9224, profile `/private/tmp/descenders-d1-chrome`, session 59301. The new synthetic database has the final migration bytes and passed setup/login/navigation. Stop the app before rebuild/migrations. No mail delivery configured.

Next: finish the first checkpoint-aware dispatch query and component with red/green evidence, wire protected club scope, verify current-season empty state and dispatch browser behavior, then continue race/rider slices. Analyst and art-director acceptance are required before D2 lands. D3–D5 remain active delivery obligations.

## D1 delivery audit

PR [#126](https://github.com/stonematt/bike_race_results/pull/126) merged into dev with merge commit `4ad144a72aeaf08bb5d535bbf201bb09cf4ed998`; reviewed head `38824bc2f3d2fcce7ebf6258eab77e24993428e5`. CI run `34192422103` passed, including 62 public test files / 901 tests. Independent review coverage and resolved findings appear below and in the PR.

Cleanup confirmed: local dev fast-forwarded, reviewed head ancestry verified, local and remote `feat/local-delivery-foundation` deleted, refs pruned and absent. One clean main worktree remained on dev before creating D2 branch. Issues #98/#100/#106/#123 closed, no stale staged labels. Stone-merge run log recorded the result. Epic #121 D1 checkbox and Obsidian journal updated; D2–D5 remain incomplete.

## D2 first slices

- Query contract: explicit checkpoint through ordinal or none. Default latest published ordinal; no published results retains an unpublished schedule. Distinct club riders supply starts, never sums of squads. History preserves all result rows per race; selected event disambiguates. Links retain checkpoint.
- Parent current-season regression ran red: explicit missing 2027 returned 2026. Optional CURRENT_SEASON now prevents that fallback; malformed settings reject. Existing/default lookup remains latest recorded year. Focused season query suite passes 23 tests. Committed as `c073526`. Root empty state offers deliberate recorded-season links rather than seed commands. Authenticated browser check passed: explicit 2027 stays empty at root; 2026 requires its recorded-season link. Test server stopped.
- Worker dispatch query/component code remains in progress and uncommitted. Initial query tests pass checkpoint counts and no-published-results defaults; explicit-none suppression and invalid-checkpoint guards are the next red/green cases. Initial query red was a missing module, not a demonstrated numerical failure; record that limit honestly. Parent flagged unsupported WIP UI headline/null-to-zero and route/contrast issues before acceptance; art director is reviewing the first composition. Use public synthetic tests; no placeholder production data.

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
