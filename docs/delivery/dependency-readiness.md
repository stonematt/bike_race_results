# Runtime dependency verification

D5A under #124, started 2026-09-08 from dev `76f5835`. This records dependency compatibility work, not hosted deployment or complete D5 acceptance.

The original production audit reported 13 advisory findings: three critical, five high and five moderate. The affected paths included direct Auth.js and Drizzle ORM dependencies, Auth.js's nested core, and Next's nested PostCSS. The independently installed Drizzle adapter's newer core did not repair the core nested beneath the old Auth.js release.

The selected update is Auth.js `5.0.0-beta.32`, Drizzle ORM `0.45.2`, Drizzle Kit `0.31.10`, and a PostCSS `8.5.28` pnpm override that reaches the nested compiler dependency. Next remains on the existing `15.5.25`. The lockfile pins these verified versions while the package manifest retains the existing range convention; the override is needed because adding a direct PostCSS dependency would leave the vulnerable nested copy. The patch boundaries come from the official [Auth.js advisory](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-8fpg-xm3f-6cx3), [Drizzle advisory](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9) and [PostCSS advisory](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp).

Initial research proposed Nodemailer `8.0.11` to match Auth.js's declared peer range. The implementation audit found another high advisory affecting that version, so the update retains the existing patched Nodemailer `9.1.1`. The Auth.js beta's declared peer range does not include 9.x. Keep that warning visible and distinguish locally tested email compatibility from upstream-declared support; do not suppress it with a metadata override. The official [Nodemailer advisory](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-p6gq-j5cr-w38f) affects versions through 9.0.0 and specifies 9.0.1 as patched.

## Current verification

The production audit is now clean. The resolved graph confirms Auth.js uses core `0.41.3` and Next uses PostCSS `8.5.28`. Focused auth/access/demo tests passed 53/53; typecheck passed. Full public regression passed 78 files / 1,022 tests with the separate invitation-acceptance TODO; the protected local corpus passed 8 files / 85 tests without refetch or identifying output. Production build, lint, formatting, migration drift and a fresh persistent PGlite migration passed.

Production-mode browser verification passed with the patched graph: retained development session rejected, development provider absent despite `AUTH_DEV_LOGIN=1`, existing synthetic-admin magic link delivered only to the loopback capture, token consumed into a Nodemailer session, and no-store/no-referrer verified. Replaying that consumed link with cookies cleared failed and created no session. The capture does not relay and accepts only `demo.coach@example.test`. App and SMTP servers were stopped afterward.

Evidence logs: `/private/tmp/descenders-d5a-{public,local,build,format}.log` and clean audit `/private/tmp/descenders-d5a-audit.json`. The final local capture is `message-1788861363539680000.eml`; its token is not included in repository artifacts. This establishes tested local compatibility of Auth.js beta.32 with Nodemailer 9.1.1, not upstream peer-range support or hosted-provider verification.

Independent Standards and Spec implementation reviews passed. PR #132 passed exact-head CI and merged into dev; its branch cleanup is complete, with exact review/merge evidence in the delivery ledger. This PR references #124; it does not close it. Upgrade-migration and PGlite/PostgreSQL parity criteria remain open and will be verified with #129. D5 Postgres runtime and concurrency, CI browser/build integration, and the recovery runbook remain #129. The existing invitation TODO is not resolved by this dependency update.

Invitation acceptance remains outside this implementation after its recorded approval-review rejection. No real email recipient, paid resource, hosted database or athlete-data transfer is involved.
