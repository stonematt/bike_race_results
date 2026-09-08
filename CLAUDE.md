# bike_race_results

## Agent skills

### Issue tracker

Issues live as GitHub issues on `stonematt/bike_race_results`, via the `gh` CLI. External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical label vocabulary, unmodified — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.

## Brand

Read `docs/brand.md` before building any UI. It holds the rules that constrain code, the asset policy for this public repo, and the reskin procedure. Tokens are vendored into `src/app/globals.css`; `pnpm brand:check` diffs them against upstream.

The source design system is `stonematt/scd-brand` (`DESIGN.md`, status APPROVED), which is **private** — do not point a contributor at it.

## Wayfinder

Planning for this project is charted as a wayfinder map on the issue tracker: `gh issue list --label "wayfinder:map"`. Read the map before starting work; it holds the destination, domain vocabulary, and standing decisions.

## Product and delivery authority

Read `PRODUCT.md`, `docs/design/editorial-direction.md` and `docs/delivery/status.md` before implementation. Accepted playground UX and editorial storytelling lead product judgment over historical engineering layouts. Source semantics and privacy remain binding. ADR-0005 permits persistent club administration. Keep completed work and verification distinct from decisions in the delivery ledger.
