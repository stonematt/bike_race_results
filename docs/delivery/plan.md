# Editorial application delivery

Updated 2026-09-07. Product direction and persistent administration are accepted. This is the execution plan for preparing a real application; [status](status.md) distinguishes decisions from delivered behavior.

Deliver a local, authenticated PGlite application where a member opens the current season and personal squad, explores other permitted squads, reads a race review and drills into an athlete's season and race. Every reporting page should help a coach discuss growth, consistency and participation through accurate visual evidence. Add persistent squad administration and invitations, and prepare a tested hosted-Postgres deployment path.

**Sequence**

| Increment                      | Required evidence                                                                                                                                                             | Existing issues to reconcile                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| D1: Local foundation           | Fresh safe seed and migrations; login to current season and squad; production build/start; baseline failures classified.                                                      | #98 and #106 data correctness; #100 if reproduced.                 |
| D2: Editorial reporting        | Accepted season dispatch, race review, shared category strips and compact rider views over protected real queries. Begin with 2025 Race 2/3 checkpoints, then current season. | #89 scope control, #34 rider design, #82 season arc.               |
| D3: Persistent club operations | Club authorization, invitations, saved squad preference and squad editing; seed preservation; two synthetic clubs prove private-state isolation.                              | #120 squad authority; #79 where roster reconciliation is required. |
| D4: Reviewed stories           | Small draft/evidence/review/publish workflow; source correction invalidates stale stories; full member and admin browser journeys.                                            | #95 coach feedback, without automatically contacting anyone.       |
| D5: Deployment readiness       | PGlite/Postgres behavior parity, fresh/upgrade migrations, production-mode auth, CI build/browser gate, bootstrap and recovery runbook.                                       | Hosting work previously deferred by map #1.                        |

The [delivery epic #121](https://github.com/stonematt/bike_race_results/issues/121) is linked beneath map #1 in [milestone 7](https://github.com/stonematt/bike_race_results/milestone/7). Reuse existing GitHub issues before opening duplicates. Link the delivery epic to map #1. Record native blocking dependencies or explicit fallback links. A ticket is ready for an agent only when its scope, test boundary, acceptance cases and blockers are concrete. Do not close issues merely because documentation has been written. Since dev is the default branch, partial PRs use Refs rather than Closes.

**Execution and review**

GPT-6 Astra orchestrates architecture, context, issue state and integration. Default to two bounded workers when independent work is available. Give each a file boundary, public contract, one behavior and a stop condition. One owner handles shared schema/migrations. Workers preserve others' changes and return paths, red/green evidence and limitations. Use separate analyst and art-director reviews for reporting increments, with engineering checks as a supporting gate.

Use the TDD skill and existing public interfaces: protected requests/actions, reporting queries over migrated PGlite, management commands, editorial publishing, components/browser journeys and database adapters. The owner approved these seams at activation on 2026-09-07; the complete contract is in [accepted-contract.md](accepted-contract.md). Work one failing behavioral test to one minimal implementation at a time. Avoid speculative abstractions and implementation-coupled tests. No runtime tests were added in the decision-persistence session.

Public CI uses pseudonymous data. Real corpus fidelity stays local. Do not refetch what is already available. Never commit or publish the playground's identifying mockups, extracts or screenshots. Use the destination's identity mapping, source semantics and privacy rules.

**Approved working defaults**

Start with one club per installation while modeling club-scoped memberships so another club can be added. Keep authenticated league result comparisons distinct from private club administration. Approved roles are member, coach and club admin. Invitations should bind to verified email, expire, be single-use and revocable. Approved squad lifecycle is archive rather than identifier deletion. The [accepted contract](accepted-contract.md) specifies the permission matrix, invitation lifecycle and last-admin protection; implementation must prove them.

Neon and Vercel remain deployment candidates. Check current official driver/runtime guidance at implementation time. Prove Postgres compatibility with disposable synthetic data. Prepare real-provider setup and migration commands before requesting credentials or any release action. No actual hosting, billing, real invitations or external athlete-data transfer has happened.

**Done means**

A documented clean installation runs locally, survives restart and preserves squad edits. Local and production-mode authentication work, with the dev shim disabled in production. The current season and chosen squad have honest unassigned/missing-data states. Direct URLs and browser navigation preserve context. All reporting surfaces pass the analyst/art-director gate, including sparse data, DNF, lap deficits and checkpoint exclusions.

Typecheck, lint, formatting, public tests, authorized local tests, privacy checks, migrations and production build must pass. Record brand-check skips honestly. Verify hosted-adapter behavior separately from a local PGlite build. The runbook covers bootstrap, secrets by variable name only, migration order, ingest/corrections, backup/restore and rollback. Provider-specific verification that cannot run remains explicitly outstanding; deployment readiness is not a claim of deployed production.

**Resume contract**

After each integrated slice and before compaction, update status with branch/commit, issue/milestone, changed files and owners, checks and their scope, active servers, blockers and the next concrete action. Keep a dated decision/action trail. On resume, read PRODUCT.md, design guidance, ADRs, plan and status; inspect git state and active agents; reconcile GitHub; continue the first unblocked increment. Obsidian summarizes milestones and reasons with links here. Do not reconstruct the project from chat or maintain competing copies of the specification.
