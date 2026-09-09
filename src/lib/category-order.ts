/**
 * The league's fourteen categories, and the one place their order lives.
 *
 * Originally a single copy inside `src/components/race-detail.ts`, promoted
 * out here (issue #113) once a second caller needed the same list in the
 * opposite direction: the season roster wall groups a squad Varsity down to
 * MS1, the reverse of the race-detail card order (MS1 up to Varsity). Two
 * copies of a league's category order will drift, so there is exactly one
 * list, and each caller picks a `CategoryDirection`.
 *
 * Written out rather than derived from `GRADE_BANDS`/`GENDERS`
 * (`src/lib/ingest/category.ts`) for the same reason `race-detail.ts` gave
 * when this was its own copy: they are the same fourteen in the same order,
 * but a constant is not worth a dependency on the ingest layer for every
 * caller of this module. `category-order.test.ts` and `race-detail.test.ts`
 * both pin this list against `GRADE_BANDS`/`GENDERS` directly, so a band the
 * league adds cannot quietly fail to appear here.
 */

export const CATEGORY_SEQUENCE: readonly string[] = [
  'MS1 Boys',
  'MS1 Girls',
  'MS2 Boys',
  'MS2 Girls',
  'MS3 Boys',
  'MS3 Girls',
  'HS1 Boys',
  'HS1 Girls',
  'HS2 Boys',
  'HS2 Girls',
  'HS3 Boys',
  'HS3 Girls',
  'Varsity Boys',
  'Varsity Girls',
] as const;

const CATEGORY_ORDER: ReadonlyMap<string, number> = new Map(
  CATEGORY_SEQUENCE.map((category, rank) => [category, rank]),
);

/** `'ascending'` is MS1 Boys first, the order the league publishes results
 *  in. `'descending'` is Varsity Girls first, the order a coach reads a
 *  squad on race day. */
export type CategoryDirection = 'ascending' | 'descending';

/**
 * Where a category sorts, in the caller's chosen direction. Defaults to
 * `'ascending'`, `race-detail.ts`'s own order.
 *
 * Anything unrecognized sorts trailing in **either** direction —
 * `CATEGORY_SEQUENCE.length`, one past the last real rank. That is the
 * invariant a naive `size - 1 - rank` flip would break: it would send the
 * highest ascending rank (unknown) to the front once the direction reverses.
 * `normalizeCategory` refuses an unknown category at ingest, so a category
 * that reaches here unrecognized is already an anomaly; it is still ranked,
 * and ranked last, rather than dropped or thrown over.
 */
export function categoryRank(category: string, direction: CategoryDirection = 'ascending'): number {
  const rank = CATEGORY_ORDER.get(category);
  if (rank === undefined) return CATEGORY_SEQUENCE.length;
  return direction === 'ascending' ? rank : CATEGORY_SEQUENCE.length - 1 - rank;
}
