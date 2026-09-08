/**
 * Everything the `[season]` segment reads: which years exist, which one a URL
 * segment names, and which squad a coach lands on by default.
 *
 * Season is the ambient frame (CONTEXT.md), not a filter, so this module has
 * no notion of "the current page's data" — it only resolves the frame itself.
 * The wall content that will eventually render inside that frame belongs to a
 * different lane (`src/lib/roster-wall.ts`, `src/components/RosterWall.tsx`).
 *
 * Imports here are relative, not `@/`-aliased, for the same reason as
 * `src/app/races/[eventId]/query.ts`: this module is loaded directly by a
 * test, and the `@/` alias is a tsconfig path Next resolves but vitest does
 * not.
 */

import { cache } from 'react';
import { sql } from 'drizzle-orm';
import type { Database } from '../../lib/db/index.ts';

/**
 * Any database this module can read: the app's, or a test's in-memory one.
 * Narrowed to `execute` for the same reason `races/[eventId]/query.ts` is —
 * it keeps the test seam structural rather than importing `db/testing.ts`.
 */
export type AnyDatabase = Pick<Database, 'execute'>;

export type SeasonRef = { id: number; year: number };
export type SquadRef = { id: number; name: string; slug: string };

type Row = Record<string, unknown>;
const rowsOf = (result: { rows: unknown[] }): Row[] => result.rows as Row[];
const str = (v: unknown): string => String(v ?? '');
const num = (v: unknown): number => Number(v);

/** Every season year on record, newest first — what the selector offers. */
export async function listSeasonYears(db: AnyDatabase): Promise<number[]> {
  const result = await db.execute(sql`select year from season order by year desc`);
  return rowsOf(result).map((row) => num(row.year));
}

/**
 * The season a `[season]` URL segment names, or null when it does not name
 * one. A segment that is not a bare non-negative integer, or one that is but
 * matches no season on record, are both "not one" — the caller's cue to
 * render a real not-found instead of crashing on a bad lookup.
 *
 * `cache()`-wrapped: `SeasonLayout` and the page beneath it both resolve the
 * same segment against the same `db` (a module-level singleton, `appDb()`),
 * so within one request the second call is deduped rather than re-querying.
 * Outside a request — this file's own tests included — `cache()` has no
 * dispatcher to key into and simply calls through, so behaviour there is
 * unchanged.
 */
export const resolveSeasonByYear = cache(
  async (db: AnyDatabase, segment: string): Promise<SeasonRef | null> => {
    if (!/^\d+$/.test(segment)) return null;

    const result = await db.execute(
      sql`select id, year from season where year = ${Number(segment)} limit 1`,
    );
    const row = rowsOf(result)[0];
    return row ? { id: num(row.id), year: num(row.year) } : null;
  },
);

/** An explicit current year never falls back; otherwise use the latest recorded year. */
export async function resolveCurrentSeason(
  db: AnyDatabase,
  configuredYear?: string,
): Promise<SeasonRef | null> {
  if (configuredYear) {
    if (!/^[1-9]\d{3}$/.test(configuredYear)) {
      throw new Error('CURRENT_SEASON must be a four-digit year.');
    }
    return resolveSeasonByYear(db, configuredYear);
  }
  const result = await db.execute(sql`select id, year from season order by year desc limit 1`);
  const row = rowsOf(result)[0];
  return row ? { id: num(row.id), year: num(row.year) } : null;
}

/**
 * The squad a coach lands on by default, for a given season.
 *
 * Read off `squad_coach` (many-to-many). When a coach holds more than one
 * squad in the season, the pick is deterministic — lowest `squad.name`
 * collating — and deliberately arbitrary: there is no coach preference to
 * break the tie honestly yet, so "first alphabetically" is a placeholder,
 * not a judgement about which squad matters more. A coach with more than one
 * squad also gets an in-UI switcher (`listCoachSquads`, `SquadSwitcher`) so
 * this pick is never the only way to reach the others.
 *
 * No coach link is null, full stop — there used to be a fallback here that
 * guessed the season's only Squad when the coach link came up empty, standing
 * in for a coach link that could not work yet (dev sign-in issued a session
 * `user.id` that never matched `coach.user_id`, #107; `squad_coach` had no
 * seeder, #108). Both landed in #116, so the fallback was a shim around a
 * broken link, not a decision anybody made, and removing it is the point of
 * #114: a multi-squad database no longer behaves differently from a
 * single-squad one depending on whether the guess happened to be right.
 */
export async function resolveDefaultSquad(
  db: AnyDatabase,
  userId: string | null,
  seasonId: number,
): Promise<SquadRef | null> {
  if (userId === null) return null;

  const result = await db.execute(sql`
    select s.id, s.name, s.slug from squad s
      join squad_coach sc on sc.squad_id = s.id
     where sc.user_id = ${userId} and s.season_id = ${seasonId}
     order by s.name
     limit 1`);
  const row = rowsOf(result)[0];
  return row ? { id: num(row.id), name: str(row.name), slug: str(row.slug) } : null;
}

/**
 * The Squad a `/[season]/squad/[slug]` URL segment names.
 *
 * `squad.slug` is unique per `(club_id, season_id)`, not globally. Callers
 * with an auth-resolved Club pass it here so duplicate slugs resolve inside
 * that Club. The optional unscoped form remains conservative: a cross-Club
 * duplicate is ambiguous and returns null.
 *
 * `limit 2` so "exactly one" is a fact this checks rather than assumes — the
 * same shape `resolveRound` and `resolveClub` use elsewhere.
 */
export async function resolveSquadBySlug(
  db: AnyDatabase,
  seasonId: number,
  slug: string,
  clubId?: number,
): Promise<SquadRef | null> {
  const clubFilter = clubId === undefined ? sql`` : sql`and club_id = ${clubId}`;
  const result = await db.execute(sql`
    select id, name, slug from squad
     where season_id = ${seasonId} and slug = ${slug} ${clubFilter}
     limit 2`);
  const rows = rowsOf(result);
  if (rows.length !== 1) return null;
  return { id: num(rows[0]!.id), name: str(rows[0]!.name), slug: str(rows[0]!.slug) };
}

/**
 * Every Squad a coach holds in a Season, ordered the same way
 * `resolveDefaultSquad` breaks its tie — the switcher's own read. Empty for a
 * coach who holds none or holds exactly one; the caller (`SquadSwitcher`)
 * only renders when there is a real choice to make.
 */
export async function listCoachSquads(
  db: AnyDatabase,
  userId: string,
  seasonId: number,
  clubId?: number,
): Promise<SquadRef[]> {
  const clubFilter = clubId === undefined ? sql`` : sql`and s.club_id = ${clubId}`;
  const result = await db.execute(sql`
    select s.id, s.name, s.slug from squad s
      join squad_coach sc on sc.squad_id = s.id
     where sc.user_id = ${userId} and s.season_id = ${seasonId} ${clubFilter}
     order by s.name`);
  return rowsOf(result).map((row) => ({
    id: num(row.id),
    name: str(row.name),
    slug: str(row.slug),
  }));
}
