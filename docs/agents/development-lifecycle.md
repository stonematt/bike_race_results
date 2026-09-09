# Development lifecycle

Owner's standing workflow, confirmed 2026-09-07. Applies to Codex and Claude work in this repository. These are project-specific interpretations of `stone-commit` and `stone-merge`, not a rewrite of the shared skills.

**Branches and commits**

Start each change from current `dev` on a descriptive task branch. Keep related work on that branch and use Conventional Commits through `stone-commit`. Explicitly stage intended files, preserve hooks and user edits, and avoid direct commits on `dev` or `main`. Use a PR into `dev`. A release is a separate `dev` to `main` PR when the owner asks to release.

`dev` is currently GitHub's default branch. Therefore `Closes #N` can close an issue on merge into `dev`. Use it only for fully completed issues; use `Refs #N` for partial work and delivery epics. Do not adopt the shared skill's assumption that `Closes` is inert on `dev`.

**PR readiness and review**

An invocation of `stone-merge` includes creating the PR if it is missing. Prepare the branch, description and linked scope using `stone-commit`, then complete readiness through `stone-merge`. Do not stop merely because the starting state lacks a PR.

Review policy: required, using the available two-axis `code-review` skill (Standards and Spec) when no completed review covers the current diff. Pin the base commit and PR head SHA, supply the linked issue or approved brief, and record reviewer, findings and disposition. Documentation gets a proportionate accuracy, consistency and scope review; it does not automatically skip the gate. If no spec exists, say so and use the user's recorded intent where available. Keep scope and correctness findings distinct.

A CI review check is evidence only if it actually reviews the current change. A green build or empty GitHub review decision is not a review. Required human approvals and requested changes remain binding even after an agent review. Resolve actionable findings and rerun the affected checks. After any head/base change, assess what review and verification need refreshing.

Before merging, fetch current state and confirm the PR is open, mergeable, targets the intended branch, has no unresolved blocking findings and passes required checks. Pin the reviewed head with `gh pr merge --match-head-commit <reviewed-sha>` when merging. Respect merge queues/protections if configured. Never use `--admin`. Diagnose failures and fix authorized defects rather than treating every failure as a reason to abandon the lifecycle.

**Merge method**

The owner corrected “fast-forward” to **no fast-forward**. Use merge commits preserving branch history: `gh pr merge <number> --merge --match-head-commit <reviewed-sha>`. Do not use squash or rebase merging. GitHub currently allows merge commits, squash and rebase, but the owner's choice is merge commits. Recheck repository policy at execution time; report an incompatibility instead of silently choosing another method.

This is distinct from updating a local checkout: use `git pull --ff-only` (or fetch plus an explicit fast-forward update) for local `dev`/`main`. Do not rewrite a published branch merely to tidy history. Preserve collaborators' work if the base or feature branch advances.

**Cleanup is part of merging**

Confirm GitHub reports the PR merged and record the merge commit. Fetch/prune, return to the base branch and update it with `--ff-only`. Remove only clean worktrees created for this task after confirming no agent is using them. Delete the merged task branch locally with safe deletion and at origin, then prune and verify both local and remote-tracking refs are absent. If GitHub already deleted the remote branch, verify rather than treating the missing ref as a failure.

For a merge commit, verify the task tip is contained in the updated base before deleting it. Re-read the remote task ref before deletion so another contributor's later commits are not discarded. Do not force-delete dirty/locked worktrees or unexplained unmerged branches. Never delete `dev`, `main` or other permanent branches, including the source `dev` branch of a release PR. If the base is checked out elsewhere, preserve that worktree and report its state rather than forcing a checkout.

Do not report cleanup complete until verified. Record remaining refs or worktrees and the reason if cleanup is blocked. Leave the user on the base branch when that can be done without disturbing their work.

**Codex execution and permissions**

Use available agent/tool capabilities rather than the shared merge skill's Claude-specific `sonnet`, `SendMessage`, background flags or classifier assumptions. Bounded readiness/review work can be delegated; the orchestrator owns integration and the final merge. Read the installed skill from the session catalog rather than assuming a `~/.claude` path.

An authorized merge includes PR creation and deletion of its merged task branches. Do not ask for that authorization again because a skill has a generic confirmation step. Actual sandbox escalation still applies. If automatic review rejects an action, state the action and reason, preserve recoverable state and continue unaffected work. Do not retry a content denial through another binary, agent or reworded command. Do not change permission settings to mask the problem.

This lifecycle setup does not itself merge the current documentation branch or authorize production deployment. Follow the owner's task scope and existing authorization. Release to `main` only on an explicit release request, with its own checks.

**Audit record**

For each completed merge, record PR/base/head, linked scope, review evidence and findings, check results, merge commit, issue disposition and verified cleanup. Report whether the increment is local, merged into `dev`, or released to `main`. Keep `docs/delivery/status.md` and the project journal consistent; do not claim runtime validation for documentation checks.
