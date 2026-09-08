# Codex project instructions

Read `CLAUDE.md` for shared project conventions, then `PRODUCT.md`, `CONTEXT.md`, `docs/design/editorial-direction.md`, `docs/brand.md`, `docs/fixtures.md` and `docs/delivery/status.md`. Read the applicable ADRs and GitHub map/issue before implementing a slice.

Follow [the development lifecycle](docs/agents/development-lifecycle.md). Use `stone-commit` and `stone-merge`, applying the owner's recorded lifecycle clarifications over conflicting skill defaults. Feature branches start from `dev`, PRs merge back to `dev` with merge commits, and releases go separately to `main`. A merge includes review, passing checks and verified cleanup.

Accepted editorial UX leads product judgment over historical engineering layouts. Published source semantics and privacy remain binding. Keep the delivery ledger current and preserve other agents' work. Never copy identifying playground artifacts into this public repository.
