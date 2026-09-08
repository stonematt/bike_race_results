# Delivery readiness investigations

2026-09-07. Findings guide implementation; they are not acceptance evidence. The [accepted contract](accepted-contract.md) remains authoritative.

## D2 art-direction brief

Independent art-direction planning by `foundation_spec`, before D2 implementation. Reporting uses Read mode; administration uses Operate mode. Preserve Anton/Nunito, paper, navy, restrained orange emphasis and readable aqua.

- Season: compact masthead, scheduled race ribbon, explicit checkpoint and personal-squad entry; starts chart beside a supported observation, followed by more from the weekend and rider comparisons. On mobile the observation immediately precedes its chart. Keep detailed roster evidence deeper.
- Race: one supported lead and evidence; manual, keyboard-accessible story selection; one shared strip per category/event/conference with linked rider callouts; a labeled detailed-results disclosure.
- Rider: current name, season and selected race in a compact heading; actual results immediately below; season history; working My ride / Field context selector. Show measured lap values and official total, or a simple value for one lap. Field context uses valid comparisons and up to two available classified neighbors each side, with an explicit gap reference.
- Sparse states distinguish no schedule, no published results, no recorded start, DNF and unavailable laps. No approved narrative means factual counts, labels and a useful question. Never substitute historical data for the current season or invent memberships or trend geometry.
- Preserve Banner, season/squad controls, protected dynamic routes, CategoryView source ordering and RosterWall as deeper evidence. Existing FieldStrip is percent back; rank and seconds are different scales and must be labeled separately.
- Replace the automatic squad redirect as the whole season experience, repeated per-rider category strips, category list as a substitute for rider profile, and coach-facing instructions to edit seed files.
- Acceptance requires actual desktop/mobile captures, keyboard/direct-URL/back navigation, readable long names and chart alternatives, plus independent analyst and art-director review of the implemented artifact. This planning pass performed no browser review.

## D2 implementation boundaries

Read-only code mapping by `foundation_spec`; implementation tracked in #125 after D1. Existing #89/#34/#82 received reconciliation comments preserving source-honesty rules while superseding the mandatory wall homepage/four-chart grid and obsolete blanket TT rule.

- Query/model owner: reporting query modules, route query files and explicit response types. Begin with a migrated synthetic Race-2 checkpoint regression that excludes later starts and deduplicates overlapping squad membership. Add Race-3, current-season, shared category and rider-neighborhood cases one behavior at a time. No schema change is currently needed.
- UI owner: season/race/rider route components, dispatch/profile components and behavioral component tests. First slice exposes checkpoint, actual starts, personal-squad entry and a working race link. Consume agreed query types; derive no independent production statistics.
- Season integration: replace `[season]/page.tsx` redirect; reuse season resolution but add explicit configured-season behavior and honest missing-data states. Existing roster queries are squad-specific and cannot simply be summed for club totals.
- Race integration: group by event/category/conference, retain the percent-back scale and explicit outside-axis states. Reuse FieldStrip once per group; keep the category destination as detailed evidence.
- Rider integration: new `[season]/rider/[riderId]` route with current identity, season history, selected-race official total, measured splits and valid classified neighbors. Preserve checkpoint in links/direct URLs/Back. My ride/Field context shows only the active perspective.
- Independent analyst and art-director reviews follow actual desktop/mobile captures and keyboard/browser checks. Factual observations/questions can ship in D2; approved story storage/publication remains D4.

## D5 database transport

Independent source/installed-code investigation by `foundation_spec`. Installed Drizzle 0.38.4 supports `drizzle-orm/node-postgres` and its migrator. Recommend standard `pg` Pool, preserving PGlite for local persistent operation. No Drizzle upgrade is needed merely to add this transport. The public database/executor contract must support both implementations without casting a NodePg database to PgliteDatabase.

Use the Node runtime, a reusable bounded pool, a driver-specific migration dispatcher and explicit CLI cleanup. Keep auth and reporting on the same application handle. Drizzle transactions must retain a single checked-out Postgres client. Hosted candidate configuration uses a pooled application URL and direct migration URL. Vercel-specific pool lifecycle attachment and provider verification remain later work.

Primary references:

- [Node-postgres compatibility](https://node-postgres.com/) and [transactions](https://node-postgres.com/features/transactions).
- [Drizzle PostgreSQL integration](https://orm.drizzle.team/docs/get-started-postgresql). Current online installation examples may target newer release candidates; reconcile with installed declarations.
- [Next.js Edge constraints](https://nextjs.org/docs/pages/api-reference/edge).
- [Vercel pool lifecycle](https://vercel.com/kb/guide/connection-pooling-with-functions).
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling). Investigator read official search excerpt; full-page retrieval unavailable in that pass. Recheck before provider setup.

Initial local inspection found libpq clients and Docker CLI but no Postgres server or running container daemon. Parent began installation of PostgreSQL 17 binaries for a disposable loopback synthetic cluster. No hosted service, paid resource, production release or athlete-data transfer is authorized by this preparation. Record completed installation and parity evidence in status when verified.
