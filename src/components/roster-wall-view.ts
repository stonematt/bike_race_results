/**
 * The Roster Wall's presentational model — pure functions `RosterWall.tsx`
 * draws from, no database and no JSX here.
 *
 * `src/lib/roster-wall.ts` already owns the wall's facts: rows are Riders,
 * columns are Rounds, and each cell is one of three states (`docs/ux/coach-flow-session.md`).
 * This file owns the two things that are about *drawing* that model rather
 * than computing it:
 *
 *   - the column header — a Round's name and the link to its own page,
 *     `/<year>/round/<ordinal>` (`src/app/[season]/round/[ordinal]/page.tsx`)
 *   - the words a cell says, and the accessible description that goes with
 *     them, kept as plain functions so the three-state rule — marks, not
 *     magnitudes; distinguishable by more than colour — is provable on plain
 *     data. The same split `field-strip.ts` makes from `FieldStrip.tsx`.
 *
 * Nothing here computes a fact ADR-0001 would call adjudication, or one it
 * would call description that the query layer has not already produced —
 * this module only chooses words and an href for facts `buildRosterWall`
 * already settled.
 */

import type { RosterWallCell, RosterWallRound } from '@/lib/roster-wall.ts';
import { deficitText } from './lap-deficit.ts';

/** One column header: the Round it names, and where it links. */
export type RosterWallColumn = {
  roundOrdinal: number;
  roundName: string;
  href: string;
};

/** `/<year>/round/<ordinal>` — the Round page a column header links to. */
export function roundHref(seasonYear: number, roundOrdinal: number): string {
  return `/${seasonYear}/round/${roundOrdinal}`;
}

/**
 * The fragment a crossing link's URL ends in, and the `id` the Category page
 * gives her own row so the browser lands on it natively — no client script
 * required for "visible on load" to hold at either end of the corpus (2
 * riders, 80 riders). `src/components/category-view.ts` reads this same
 * constant so the two sides of the crossing never drift apart.
 */
export const CROSSING_ANCHOR = 'her';

/**
 * `/<year>/round/<ordinal>/category/<riderId>#her` — the crossing (ADR-0002):
 * the single link out of the club tree, from a wall cell that started to her
 * own Category field at that Round. Only ever built for a `positioned` or
 * `started-not-positioned` cell; a `did-not-start` cell opens no Category
 * (`src/lib/db/category-query.ts` returns null for a non-start).
 */
export function categoryHref(seasonYear: number, roundOrdinal: number, riderId: number): string {
  return `/${seasonYear}/round/${roundOrdinal}/category/${riderId}#${CROSSING_ANCHOR}`;
}

/**
 * The wall's columns, in `roundOrdinal` ascending order — owned here rather
 * than trusted from the caller, the same "own the order" instinct
 * `buildFieldStrip` and `buildRosterWall` both state in their own headers: an
 * order this module does not guarantee is one a future caller can get wrong.
 * Sorting the same way `buildRosterWall` sorts its `rounds` argument is what
 * keeps a header built from this function lined up with the `cells` array
 * `buildRosterWall` returns for every row, regardless of what order the
 * caller's own `rounds` array happened to arrive in.
 */
export function buildRosterWallColumns(
  seasonYear: number,
  rounds: readonly RosterWallRound[],
): RosterWallColumn[] {
  return [...rounds]
    .sort((a, b) => a.roundOrdinal - b.roundOrdinal)
    .map((round) => ({
      roundOrdinal: round.roundOrdinal,
      roundName: round.roundName,
      href: roundHref(seasonYear, round.roundOrdinal),
    }));
}

/** One cell's short, on-face mark — the text that sits in the grid square.
 *  A short-lap rider's mark is her published place, same as anyone else's
 *  (issue #111); her deficit is a separate annotation, from `cellDeficit`. */
export function cellMark(cell: RosterWallCell): string {
  switch (cell.state) {
    case 'positioned':
      return cell.place;
    case 'started-not-positioned':
      return 'DNF';
    case 'did-not-start':
      return '';
  }
}

/**
 * The lap deficit beside a positioned cell's place, when NICA recorded one —
 * the annotation ADR-0004 keeps distinct from the place itself. Null for a
 * full-distance finisher or a row whose lap count could not be compared.
 * `src/components/lap-deficit.ts` is the one place the deficit is spelled
 * out, so the wall and the Category list cannot word it differently.
 */
export function cellDeficit(cell: Extract<RosterWallCell, { state: 'positioned' }>): string | null {
  return deficitText(cell.lapsDown);
}

/**
 * The percent-back reading, worded so a null never reads as zero or as a
 * blank that could be mistaken for one. A DNF, a short-lap rider, and
 * (today) every rider at a time trial carry a null here — this is the
 * different kind of statement the null becomes, never `0%` and never
 * silence.
 */
export function pctBackText(pctBack: number | null): string {
  return pctBack === null ? 'no gap published' : `+${pctBack}% back`;
}

/**
 * The full sentence a screen reader gets for one cell — the same facts a
 * sighted coach reads off its shape, spelled out for someone who cannot see
 * it. Distinguishing the three states on words alone (not only on the chip
 * colour or the cell being empty) is what keeps the wall from being a wall of
 * colour-only marks.
 */
export function describeCell(cell: RosterWallCell): string {
  switch (cell.state) {
    case 'positioned': {
      const base = `Place ${cell.place} of ${cell.fieldSize}, ${pctBackText(cell.pctBack)}`;
      const deficit = cellDeficit(cell);
      return deficit ? `${base}, ${deficit}` : base;
    }
    case 'started-not-positioned':
      return 'Started, did not finish';
    case 'did-not-start':
      return 'Did not start this round';
  }
}
