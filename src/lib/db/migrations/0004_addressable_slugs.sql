-- Addressable slugs on club and squad. (#114)
--
-- Club-tree URLs (`/2025`, `/2025/round/2`) carry no club or squad segment: the
-- squad is resolved implicitly from the session, and nothing can be bookmarked
-- or linked to directly. This gives club and squad each a slug so a squad's
-- own roster gets a real address — `/2025/squad/descenders` — and removes the
-- "if the season has exactly one squad, use that one" fallback that stood in
-- for a working coach link before #107/#108 fixed it.
--
-- Two different uniqueness scopes, on purpose:
--
--   club.slug   globally unique, no season in the key. ADR-0002 keeps `club`
--               deliberately season-independent — that is the whole reason
--               the club tree and the league tree stay apart — so a club's
--               slug identifies it across every season, the same as its name
--               and its id already do.
--
--   squad.slug  unique on (club_id, season_id), not globally. Squads *are*
--               season-keyed (#81), so scoping the slug to its club within a
--               season lets two clubs each have a `descenders`, and lets one
--               squad keep the same slug across a season rollover so a
--               bookmark survives it.
--
-- Both columns are added nullable, backfilled, then constrained — not a
-- single `ADD COLUMN ... NOT NULL`, which is what drizzle-kit generates by
-- default and which aborts against any database that already has a club and a
-- squad, which is every seeded dev database (the same shape 0003 documents for
-- `squad.season_id`).
--
-- The backfill derives a slug from `name` in SQL: lower-case, every run of
-- non-alphanumeric characters collapsed to one hyphen, leading and trailing
-- hyphens trimmed — the same algorithm `src/lib/slug.ts`'s `slugify` applies
-- in application code, so a freshly-seeded row and a backfilled one read the
-- same way. Two different names can slugify to the same value ("JV Squad" and
-- "JV--Squad" both derive "jv-squad"), so the backfill closes with a
-- collision pass that appends the row's own id to every slug sharing one with
-- another row in its uniqueness scope — deterministic, and it never needs a
-- second pass because appending a unique id can only ever create a new
-- collision with another already-suffixed row from the same pass, which itself
-- carries a different id.

--------------------------------------------------------------------------------
-- club.slug — globally unique, no season in the key (see header)
--------------------------------------------------------------------------------
ALTER TABLE "club" ADD COLUMN "slug" text;--> statement-breakpoint

UPDATE "club" SET "slug" = trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'));--> statement-breakpoint

-- Collision pass: every dev database seeds exactly one club today, so this is
-- a no-op in practice and exists for the database that is not that one.
UPDATE "club" c SET "slug" = c."slug" || '-' || c."id"
 WHERE EXISTS (
   SELECT 1 FROM "club" c2 WHERE c2."slug" = c."slug" AND c2."id" <> c."id"
 );--> statement-breakpoint

ALTER TABLE "club" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "club_slug_key" ON "club" USING btree ("slug");--> statement-breakpoint

--------------------------------------------------------------------------------
-- squad.slug — unique on (club_id, season_id), not globally (see header)
--------------------------------------------------------------------------------
ALTER TABLE "squad" ADD COLUMN "slug" text;--> statement-breakpoint

UPDATE "squad" SET "slug" = trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'));--> statement-breakpoint

-- Collision pass, scoped to the same (club_id, season_id) the unique index
-- below is scoped to — two clubs sharing a squad slug across each other is
-- exactly what the uniqueness rule allows, so it must not trigger this.
UPDATE "squad" s SET "slug" = s."slug" || '-' || s."id"
 WHERE EXISTS (
   SELECT 1 FROM "squad" s2
    WHERE s2."club_id" = s."club_id" AND s2."season_id" = s."season_id"
      AND s2."slug" = s."slug" AND s2."id" <> s."id"
 );--> statement-breakpoint

ALTER TABLE "squad" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "squad_club_season_slug_key" ON "squad" USING btree ("club_id","season_id","slug");
