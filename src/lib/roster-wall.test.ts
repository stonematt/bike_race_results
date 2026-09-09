/**
 * `buildRosterWall` on synthetic objects — no database, per `docs/fixtures.md`.
 *
 * The behavior worth pinning is the three-state derivation, not arithmetic:
 * this module never computes a place, a percentage or a field size, it only
 * arranges the facts the query layer already resolved.
 */

import { describe, expect, it } from 'vitest';
import {
  buildRosterWall,
  groupRosterWallRows,
  NO_RESULTS_HEADING,
  type RosterWallResult,
  type RosterWallRound,
  type RosterWallRow,
} from './roster-wall.ts';

const ROUNDS: RosterWallRound[] = [
  { roundId: 1, roundOrdinal: 1, roundName: 'Prologue' },
  { roundId: 2, roundOrdinal: 2, roundName: 'Race 2' },
  { roundId: 3, roundOrdinal: 3, roundName: 'Race 3' },
];

const RIDERS = [
  { riderId: 1, riderName: '«RIDER-A»' },
  { riderId: 2, riderName: '«RIDER-B»' },
];

function result(over: Partial<RosterWallResult>): RosterWallResult {
  return {
    riderId: 1,
    roundOrdinal: 1,
    place: '3',
    status: 'finished',
    pctBack: 5.2,
    lapsDown: 0,
    fieldSize: 40,
    category: 'HS2 Girls',
    ...over,
  };
}

describe('the three states', () => {
  it('marks a published place as positioned, carrying only description', () => {
    const wall = buildRosterWall(RIDERS, ROUNDS, [result({})]);
    expect(wall[0]!.cells[0]).toEqual({
      state: 'positioned',
      place: '3',
      pctBack: 5.2,
      lapsDown: 0,
      fieldSize: 40,
      category: 'HS2 Girls',
    });
  });

  it('marks a DNF as started but not positioned', () => {
    const wall = buildRosterWall(RIDERS, ROUNDS, [
      result({ status: 'dnf', place: '*', pctBack: null, lapsDown: null }),
    ]);
    expect(wall[0]!.cells[0]).toEqual({ state: 'started-not-positioned', reason: 'dnf' });
  });

  it('positions a short-lap finisher with her published place, her deficit riding beside it', () => {
    // NICA still prints a numeric place for a rider it pulled at the line —
    // 2025 Race 4 North ranked short-lap riders 65th and 67th, in the same
    // single sequence as everyone else (issue #111). "Positioned" means she
    // holds a published place, not that her time is comparable.
    const wall = buildRosterWall(RIDERS, ROUNDS, [
      result({ status: 'finished', place: '65', pctBack: null, lapsDown: 1 }),
    ]);
    expect(wall[0]!.cells[0]).toEqual({
      state: 'positioned',
      place: '65',
      pctBack: null,
      lapsDown: 1,
      fieldSize: 40,
      category: 'HS2 Girls',
    });
  });

  it('marks a rider with no result row at the Round as did-not-start', () => {
    const wall = buildRosterWall(RIDERS, ROUNDS, []);
    expect(wall[0]!.cells).toEqual([
      { state: 'did-not-start' },
      { state: 'did-not-start' },
      { state: 'did-not-start' },
    ]);
  });
});

describe('the grid shape', () => {
  it('gives every rider a cell for every Round, including ones she skipped', () => {
    const wall = buildRosterWall(RIDERS, ROUNDS, [
      result({ riderId: 1, roundOrdinal: 1 }),
      result({ riderId: 1, roundOrdinal: 3, place: '9' }),
      // Rider 2 raced none of it.
    ]);

    expect(wall).toHaveLength(2);
    expect(wall[0]!.rider.riderId).toBe(1);
    expect(wall[0]!.cells).toHaveLength(3);
    expect(wall[0]!.cells[0]!.state).toBe('positioned');
    expect(wall[0]!.cells[1]).toEqual({ state: 'did-not-start' });
    expect(wall[0]!.cells[2]!.state).toBe('positioned');

    expect(wall[1]!.rider.riderId).toBe(2);
    expect(wall[1]!.cells.every((c) => c.state === 'did-not-start')).toBe(true);
  });

  it('includes a Round the Squad did not attend as a column, not an absence', () => {
    const wall = buildRosterWall(RIDERS, ROUNDS, [result({ riderId: 1, roundOrdinal: 1 })]);
    expect(wall[0]!.cells).toHaveLength(ROUNDS.length);
  });

  it('orders columns by round ordinal, regardless of the order Rounds arrived in', () => {
    const scrambled = [...ROUNDS].reverse();
    const wall = buildRosterWall(RIDERS, scrambled, [
      result({ riderId: 1, roundOrdinal: 1, place: '1' }),
      result({ riderId: 1, roundOrdinal: 2, place: '2' }),
      result({ riderId: 1, roundOrdinal: 3, place: '3' }),
    ]);
    const places = wall[0]!.cells.map((c) => (c.state === 'positioned' ? c.place : c.state));
    expect(places).toEqual(['1', '2', '3']);
  });

  it('produces no row for a rider not on the roster passed in', () => {
    const wall = buildRosterWall([RIDERS[0]!], ROUNDS, [
      result({ riderId: 2, roundOrdinal: 1 }), // a stray result for someone not on this roster
    ]);
    expect(wall).toHaveLength(1);
    expect(wall[0]!.rider.riderId).toBe(1);
  });
});

describe('a data anomaly this club should never produce', () => {
  it('prefers a positioned result over a second, contradictory row for the same round', () => {
    // Two Events in one Round is real (a North/South split); two results for
    // the SAME rider in the SAME round is not, for a club that sits entirely
    // in one Conference. If it ever happens, positioned wins over not.
    const wall = buildRosterWall(RIDERS, ROUNDS, [
      result({ riderId: 1, roundOrdinal: 1, status: 'dnf', place: '*', pctBack: null }),
      result({ riderId: 1, roundOrdinal: 1, status: 'finished', place: '7' }),
    ]);
    expect(wall[0]!.cells[0]!.state).toBe('positioned');
  });
});

describe('most-recent category (issue #113)', () => {
  // Category is a per-event attribute, not a rider attribute: a rider's
  // published string can change between rounds when the rider moves up. The
  // wall groups a rider under the category raced most recently in the season.

  it('takes the category from the latest round raced, not the first', () => {
    const wall = buildRosterWall(RIDERS, ROUNDS, [
      result({ riderId: 1, roundOrdinal: 1, category: 'HS2 Girls' }),
      result({ riderId: 1, roundOrdinal: 3, category: 'Varsity Girls' }),
    ]);
    expect(wall[0]!.category).toBe('Varsity Girls');
  });

  it('takes the category from a DNF just the same as a positioned result', () => {
    // A rider who only ever DNF'd still carries a category on every result
    // row (issue #113) — the wall must not lose the rider because none of
    // that rider's rows ever resolved to a position.
    const wall = buildRosterWall(RIDERS, ROUNDS, [
      result({ riderId: 1, roundOrdinal: 1, status: 'dnf', place: '*', category: 'MS1 Boys' }),
      result({ riderId: 1, roundOrdinal: 2, status: 'dnf', place: '*', category: 'MS1 Boys' }),
    ]);
    expect(wall[0]!.category).toBe('MS1 Boys');
  });

  it('is null for a rider with no result row at all this season', () => {
    const wall = buildRosterWall(RIDERS, ROUNDS, []);
    expect(wall[0]!.category).toBeNull();
    expect(wall[1]!.category).toBeNull();
  });
});

describe('groupRosterWallRows (issue #113)', () => {
  function row(riderId: number, riderName: string, category: string | null): RosterWallRow {
    return { rider: { riderId, riderName }, category, cells: [] };
  }

  it('orders groups Varsity down to MS1, the reverse of the league order', () => {
    const rows = [
      row(1, '«RIDER-A»', 'MS1 Boys'),
      row(2, '«RIDER-B»', 'Varsity Girls'),
      row(3, '«RIDER-C»', 'HS2 Girls'),
    ];
    const groups = groupRosterWallRows(rows);
    expect(groups.map((g) => g.heading)).toEqual(['Varsity Girls', 'HS2 Girls', 'MS1 Boys']);
  });

  it('puts a rider who moved up mid-season in exactly one group, the latest', () => {
    const wall = buildRosterWall([{ riderId: 1, riderName: '«RIDER-A»' }], ROUNDS, [
      result({ riderId: 1, roundOrdinal: 1, category: 'HS2 Girls' }),
      result({ riderId: 1, roundOrdinal: 2, category: 'Varsity Girls' }),
    ]);
    const groups = groupRosterWallRows(wall);
    const withHer = groups.filter((g) => g.rows.some((r) => r.rider.riderId === 1));
    expect(withHer).toHaveLength(1);
    expect(withHer[0]!.heading).toBe('Varsity Girls');
  });

  it('gives a category with a single rider its own group', () => {
    const rows = [row(1, '«RIDER-A»', 'Varsity Boys'), row(2, '«RIDER-B»', 'MS1 Boys')];
    const groups = groupRosterWallRows(rows);
    expect(groups.find((g) => g.heading === 'Varsity Boys')?.rows).toHaveLength(1);
  });

  it('groups an unrecognized category under its own heading, trailing every known one', () => {
    const rows = [row(1, '«RIDER-A»', 'MS1 Boys'), row(2, '«RIDER-B»', 'Tandem Unicycle')];
    const groups = groupRosterWallRows(rows);
    expect(groups.map((g) => g.heading)).toEqual(['MS1 Boys', 'Tandem Unicycle']);
    expect(groups[1]!.rows[0]!.rider.riderId).toBe(2);
  });

  it('gives a rider with no results at all a predictable, named, trailing home', () => {
    const rows = [row(1, '«RIDER-A»', 'Varsity Girls'), row(2, '«RIDER-B»', null)];
    const groups = groupRosterWallRows(rows);
    expect(groups.map((g) => g.heading)).toEqual(['Varsity Girls', NO_RESULTS_HEADING]);
  });

  it('never drops a rider, whatever the category', () => {
    const rows = [
      row(1, '«RIDER-A»', 'Varsity Girls'),
      row(2, '«RIDER-B»', null),
      row(3, '«RIDER-C»', 'Tandem Unicycle'),
    ];
    const groups = groupRosterWallRows(rows);
    const seen = groups.flatMap((g) => g.rows.map((r) => r.rider.riderId));
    expect(seen.sort()).toEqual([1, 2, 3]);
  });
});
