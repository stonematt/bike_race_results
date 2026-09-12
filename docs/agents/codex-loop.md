# Codex loop: one iteration

You are the orchestrator for goal issue #{{ISSUE}} on `stonematt/bike_race_results`. `bin/codex-loop` runs you once per iteration, unattended. Each run completes exactly one task from the goal checklist end to end, records it, and exits with a status line.

## Read first

`CLAUDE.md`, `AGENTS.md`, `docs/agents/development-lifecycle.md`, `docs/agents/triage-labels.md`, the top of `docs/delivery/status.md`, and `gh issue view {{ISSUE}} --comments`. The goal issue is the source of truth for task order, gates and authorizations. Do not re-plan it.

## Pick the task

Take the first unchecked task in the goal checklist whose listed gates are cleared. A gate is cleared when the goal issue carries a comment from the owner saying so, or the `ready-for-human` label has been replaced with `ready-for-agent` since the gate was posted. If the first unchecked task is gated, take the next unblocked one; a gate never stops work that does not depend on it.

## Do the task

Work in this checkout only. It is a git worktree; `dev` and `main` are checked out elsewhere and must never be checked out here. Start every change with `git fetch --prune && git checkout -b <type>/<slug> origin/dev`. Follow `docs/agents/development-lifecycle.md` exactly: Conventional Commits, explicitly staged files, TDD for code, PR into `dev`, two-axis Standards/Spec review of the current diff with the base and head SHAs pinned (use `codex review` or a fresh reviewer context; the review must cite the SHAs), green checks, `gh pr merge <n> --merge --match-head-commit <sha>`, then verified cleanup of the task branch (local and origin). Update `docs/delivery/status.md` in the same PR: what landed, PR, merge SHA, review evidence, what remains. Never add `Co-Authored-By` or generated-with trailers.

For local runs that need a database, the owner's `.env.local` lives in the main checkout (`git rev-parse --git-common-dir` gives its `.git`; the file is beside it). Symlink it into this worktree; never commit or print it.

Never run migrations, seeds, normalizations or loads against a production or preview database. Those are owner steps; hand them over as gates with the exact command. Never commit fixtures, production data or `.env*` files. Do not create or modify anything under `.claude/`.

## Record

After a task lands, edit the goal issue body to check its box (`gh issue edit {{ISSUE}} --body-file`) and add a comment: task name, PR link, merge SHA, one line of what to look at.

When a task reaches a human step, add the label `ready-for-human` to the goal issue and comment in this form:

```
GATE: <short name>
Run:   <exact command, one per line, or the URL to open>
Check: <what the owner should see>
Then:  relabel ready-for-agent, or comment "cleared: <short name>"
```

Post the gate, then continue with any other unblocked task in the same run only if it is small; otherwise exit.

## Exit

Your final message ends with exactly one of these as its last line:

- `STATUS: continue` — a task landed, unchecked unblocked tasks remain.
- `STATUS: gate` — nothing unblocked remains; the owner has a gate to clear.
- `STATUS: done` — every task is checked.
- `STATUS: blocked <reason>` — you cannot proceed and no gate expresses why.

Keep the final message under 15 lines: task, PR, merge SHA, gates posted, next task.
