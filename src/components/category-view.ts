/**
 * The Category view's presentational model — pure functions `CategoryView.tsx`
 * draws from, no database and no JSX here.
 *
 * Same split as `roster-wall-view.ts`: `src/lib/category.ts` and
 * `src/lib/db/category-query.ts` already resolve, rank and package the
 * field (ADR-0002's crossing). This module only chooses the words the page
 * says about facts those two already settled — the headline stat for the
 * anchor row, the mark each row shows, and the sentence stating exactly who
 * is in the list.
 *
 * ADR-0001 line, restated for this module: everything here is a description
 * of what the source already published, dressed in words for a coach to
 * read. It never computes or invents a place, a percent back, a field size
 * or a Category assignment — `ordinal` below reads a published place as a
 * number only to choose an English suffix, the same number, never a
 * different one.
 */

import type { CategoryField, CategoryFieldRow } from '@/lib/category.ts';
import { deficitText } from './lap-deficit.ts';
import { CROSSING_ANCHOR } from './roster-wall-view.ts';

/**
 * The `id` the anchor row on the Category page carries, so the crossing
 * link's `#` fragment lands the browser on it natively — the mechanism
 * "visible on load" runs on, at both ends of the corpus (2 riders, 80
 * riders), with no client script required. Re-exported from
 * `roster-wall-view.ts` so the two sides of the crossing (the link, and the
 * row it points at) can never name two different anchors.
 */
export const ANCHOR_ROW_ID = CROSSING_ANCHOR;

const WHOLE_NUMBER = /^\d+$/;

/**
 * A whole number, spelled as the English ordinal a coach reads — "1st",
 * "2nd", "3rd", "11th", "22nd"… Formatting only: the number is exactly the
 * source's own published place, read once to choose a suffix, never
 * re-derived and never re-sorted (`src/lib/category.ts` already ranked the
 * field; this never touches order).
 */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * The headline stat for the anchor row — "3rd of 30" when the source
 * published a numeric place. When it did not, this names the rider's state
 * instead of inventing a rank for it: a DNF carries no ordinal to give, and
 * still states the field size in words. A short-lap rider's place IS a
 * numeric ordinal — NICA orders the rider in the same single sequence as
 * everyone else (issue #111) — so the row reaches the ordinal branch like
 * anyone else's; the lap deficit is a separate fact, rendered beside this
 * headline by `rowDeficit`, never inside it.
 */
export function anchorHeadline(row: CategoryFieldRow, fieldSize: number): string {
  if (row.status === 'dnf') return `DNF, field of ${fieldSize}`;
  const trimmed = row.place.trim();
  if (WHOLE_NUMBER.test(trimmed)) return `${ordinal(Number(trimmed))} of ${fieldSize}`;
  return `Unplaced, field of ${fieldSize}`;
}

/**
 * The mark one row of the ranked list shows — the source's own place,
 * verbatim, or the reason there is none. The three states render inline,
 * here as everywhere else in this app: a DNF is a row with this mark, never
 * a row that is simply missing. A short-lap rider's mark is the rider's
 * place, like anyone else's — the deficit is a separate annotation, from
 * `rowDeficit`.
 */
export function rowMark(row: CategoryFieldRow): string {
  if (row.status === 'dnf') return 'DNF';
  return row.place;
}

/**
 * The lap deficit beside a row's mark, when NICA recorded one — the
 * annotation ADR-0004 keeps distinct from the place itself. Null for a DNF,
 * a full-distance finisher, or a row whose lap count could not be compared;
 * `src/components/lap-deficit.ts` is the one place the deficit is spelled
 * out, so the Category list and the wall cannot word it differently.
 */
export function rowDeficit(row: CategoryFieldRow): string | null {
  return deficitText(row.lapsDown);
}

/**
 * The sentence stating exactly who is in this list: the Category as
 * published, and whether the peer set is this Club's own Conference or the
 * whole league (`CONTEXT.md`, Category — Conference-scoped through Round 4,
 * league-wide at State Champs). Read this instead of inferring it from
 * `scope`/`conference` — the ticket's own words for why this function
 * exists.
 */
export function scopeStatement(field: CategoryField): string {
  return field.scope === 'league'
    ? `${field.categoryName} — every starter across the league.`
    : `${field.categoryName} — every starter in the ${field.conference} Conference.`;
}

/**
 * The screen-reader summary for the ranked list as a whole — the field size,
 * the anchor row (when there is one to point at), and that squad-mates are
 * marked separately. Sighted and non-sighted readers get the same facts;
 * this is the non-sighted phrasing, matching the split `describeCell` makes
 * in `roster-wall-view.ts`.
 */
export function listDescription(
  field: CategoryField,
  anchor: CategoryFieldRow | undefined,
): string {
  const base = `Ranked list of ${field.fieldSize} starter${field.fieldSize === 1 ? '' : 's'} in ${field.categoryName}.`;
  if (anchor === undefined) return base;
  return `${base} ${anchor.displayName}'s row is marked. Squad-mates are marked separately.`;
}
