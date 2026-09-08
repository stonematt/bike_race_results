# Delivery status

Updated 2026-09-07. **Goal active; foundation merged into dev; D1 starting.** No production deployment. The goal has no token budget. The owner approved product defaults and public TDD seams, subject to later recorded decisions; see [accepted contract](accepted-contract.md).

Branch: `feat/local-delivery-foundation`, from current `dev` at `36ab935`. Owner: Astra orchestrator; bounded worker ownership recorded below. No running servers started.

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
