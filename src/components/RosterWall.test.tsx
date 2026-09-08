/*
 * The guards at the render boundary — the half `roster-wall.test.ts` cannot
 * reach. The ticket's central constraint is a negative claim about markup: a
 * positioned cell must draw no bar and no sparkline, and the three states
 * must be told apart by more than colour. Both are only really held by
 * looking at the output.
 *
 * `renderToStaticMarkup`, matching `RaceDetail.test.tsx`: a server component
 * with no state and no events has nothing to drive.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RosterWallCell, RosterWallRound, RosterWallRow } from '../lib/roster-wall.ts';
import { RosterWall } from './RosterWall.tsx';

const ROUNDS: RosterWallRound[] = [
  { roundId: 1, roundOrdinal: 1, roundName: 'Race 1' },
  { roundId: 2, roundOrdinal: 2, roundName: 'Race 2' },
  { roundId: 3, roundOrdinal: 3, roundName: 'Race 3' },
];

const positionedCell: RosterWallCell = {
  state: 'positioned',
  place: '3',
  pctBack: 8.4,
  lapsDown: 0,
  fieldSize: 30,
  category: 'HS1 Boys',
};

const positionedNoGapCell: RosterWallCell = { ...positionedCell, pctBack: null, place: '1' };
const shortLapCell: RosterWallCell = {
  ...positionedCell,
  place: '65',
  pctBack: null,
  lapsDown: 1,
};
const dnfCell: RosterWallCell = { state: 'started-not-positioned', reason: 'dnf' };
const absentCell: RosterWallCell = { state: 'did-not-start' };

const ROWS: RosterWallRow[] = [
  {
    rider: { riderId: 1, riderName: '«RIDER-A»' },
    category: 'HS1 Boys',
    cells: [positionedCell, dnfCell, absentCell],
  },
  {
    rider: { riderId: 2, riderName: '«RIDER-B»' },
    category: 'HS1 Boys',
    cells: [shortLapCell, positionedNoGapCell, absentCell],
  },
];

function render(rows: RosterWallRow[] = ROWS, rounds: RosterWallRound[] = ROUNDS): string {
  return renderToStaticMarkup(<RosterWall seasonYear={2026} rounds={rounds} rows={rows} />);
}

describe('the wall', () => {
  it('draws one row per rider and one header per round', () => {
    const markup = render();
    expect(markup).toContain('«RIDER-A»');
    expect(markup).toContain('«RIDER-B»');
    expect(markup).toContain('Race 1');
    expect(markup).toContain('Race 2');
    expect(markup).toContain('Race 3');
  });

  it('links every round header to its own round page', () => {
    const markup = render();
    expect(markup).toContain('href="/2026/round/1"');
    expect(markup).toContain('href="/2026/round/2"');
    expect(markup).toContain('href="/2026/round/3"');
  });

  it('says so when the squad has no riders, and draws no table', () => {
    const markup = render([]);
    expect(markup).toContain('No riders are on this squad');
    expect(markup).not.toContain('<table');
  });

  it('says so when the season has no rounds yet, and draws no table', () => {
    const markup = render(
      [{ rider: { riderId: 1, riderName: '«RIDER-A»' }, category: 'HS1 Boys', cells: [] }],
      [],
    );
    expect(markup).toContain('No rounds are published yet');
    expect(markup).not.toContain('<table');
  });
});

describe('the three cell states', () => {
  it('draws no bar, sparkline, or any length-encoded mark, anywhere', () => {
    // The ticket's central constraint: marks, not magnitudes. No inline
    // width/height style, no <svg>, nothing that could encode "how well" as
    // a length or an area.
    const markup = render();
    expect(markup).not.toContain('<svg');
    expect(markup).not.toMatch(/style="[^"]*(width|height):/);
  });

  it('renders a positioned cell as text — place, field size and percent back, verbatim', () => {
    const markup = render();
    expect(markup).toContain('>3<');
    expect(markup).toContain('of 30');
    expect(markup).toContain('+8.4% back');
  });

  it('never renders a null percent back as zero or as blank silence', () => {
    const markup = render();
    expect(markup).toContain('Time comparison unavailable');
    expect(markup).not.toMatch(/>0%</);
  });

  it('preserves a place carrying `*` verbatim, without parsing it', () => {
    const starred: RosterWallCell = { ...positionedCell, place: '*' };
    const markup = render(
      [{ rider: { riderId: 1, riderName: '«RIDER-A»' }, category: 'HS1 Boys', cells: [starred] }],
      [ROUNDS[0]!],
    );
    expect(markup).toContain('>*<');
  });

  it('marks a DNF with its own chip, and a short-lap rider with the place and deficit (issue #111)', () => {
    // NICA orders a short-lap rider in the same single sequence as everyone
    // else, so the cell carries the published place, not a state word.
    const markup = render();
    expect(markup).toContain('>DNF<');
    expect(markup).toContain('>65<');
    expect(markup).toContain('−1 lap');
    expect(markup).not.toContain('>Lapped<');
  });

  it('gives DNF its own chip class; a short-lap rider gets no chip, just the place', () => {
    const markup = render();
    expect(markup).toMatch(/bg-fg[^"]*"[^>]*>DNF/);
    // `bg-navy` was the lapped chip's tone (issue #111) — retired along with
    // the chip it painted, since a short-lap rider is a positioned cell now.
    expect(markup).not.toContain('bg-navy');
  });

  it('draws a did-not-start cell empty of any visible mark or chip', () => {
    const single: RosterWallRow[] = [
      { rider: { riderId: 1, riderName: '«RIDER-A»' }, category: 'HS1 Boys', cells: [absentCell] },
    ];
    const markup = render(single, [ROUNDS[0]!]);
    // No DNF chip, no place, no percent — but the fact still reaches a screen
    // reader via the sr-only span, so it does not read as a silent gap in the
    // data. (The table's own sr-only caption names "DNF" in prose describing
    // the wall's states in general, so match the chip's own shape rather than
    // the bare word.)
    expect(markup).not.toContain('>DNF<');
    expect(markup).not.toContain('>Lapped<');
    expect(markup).not.toMatch(/<td[^>]*>\s*<[^s][^>]*>\d/);
    expect(markup).toContain('No result recorded');
    expect(markup).toContain('sr-only');
  });

  it('crosses to the rider’s Category from a cell the rider started, and only from one', () => {
    // The crossing is the one link that leaves the club tree (ADR-0002), so
    // which cells carry it is the rule worth pinning. RIDER-A: positioned at
    // Race 1, DNF at Race 2, absent at Race 3.
    const markup = render();
    expect(markup).toContain('href="/2026/round/1/category/1#rider"');
    expect(markup).toContain('href="/2026/round/2/category/1#rider"');
    expect(markup).not.toContain('/2026/round/3/category/1');
  });

  it('never addresses a rider by pronoun — the wall renders boys’ and girls’ categories alike (issue #112)', () => {
    const markup = render();
    expect(markup).toMatch(/Open this rider.*?s Category at this round\./);
    expect(markup).not.toMatch(/\bher\b|\bshe\b|\bhers\b|\bherself\b/i);
  });

  it('opens no Category for a Round the rider did not start', () => {
    const single: RosterWallRow[] = [
      { rider: { riderId: 1, riderName: '«RIDER-A»' }, category: 'HS1 Boys', cells: [absentCell] },
    ];
    const markup = render(single, [ROUNDS[0]!]);
    // The column header still links to the Round page; nothing links to a
    // Category, because there is no field the rider was in to open.
    expect(markup).not.toContain('/category/');
  });

  it('reads a did-not-start cell as absence, never as a bad result — no danger/warn tone', () => {
    const single: RosterWallRow[] = [
      { rider: { riderId: 1, riderName: '«RIDER-A»' }, category: 'HS1 Boys', cells: [absentCell] },
    ];
    const markup = render(single, [ROUNDS[0]!]);
    expect(markup).not.toContain('bg-danger');
    expect(markup).not.toContain('text-danger');
    expect(markup).not.toContain('bg-fg');
    expect(markup).not.toContain('bg-navy');
  });
});

describe('grouped by category, Varsity down to MS1 (issue #113)', () => {
  const grouped: RosterWallRow[] = [
    { rider: { riderId: 1, riderName: '«RIDER-A»' }, category: 'MS1 Boys', cells: [absentCell] },
    {
      rider: { riderId: 2, riderName: '«RIDER-B»' },
      category: 'Varsity Girls',
      cells: [absentCell],
    },
    { rider: { riderId: 3, riderName: '«RIDER-C»' }, category: 'HS2 Girls', cells: [absentCell] },
  ];

  it('renders a heading per category, ordered from the top of the league down', () => {
    const markup = render(grouped, [ROUNDS[0]!]);
    const varsityAt = markup.indexOf('Varsity Girls');
    const hs2At = markup.indexOf('HS2 Girls');
    const ms1At = markup.indexOf('MS1 Boys');
    expect(varsityAt).toBeGreaterThan(-1);
    expect(varsityAt).toBeLessThan(hs2At);
    expect(hs2At).toBeLessThan(ms1At);
  });

  it('keeps a rider in exactly one group, never repeated under an earlier category', () => {
    const markup = render(grouped, [ROUNDS[0]!]);
    expect(markup.match(/«RIDER-B»/g)).toHaveLength(1);
  });

  it('gives an unrecognized category its own heading, trailing every recognized one', () => {
    const rows: RosterWallRow[] = [
      { rider: { riderId: 1, riderName: '«RIDER-A»' }, category: 'MS1 Boys', cells: [absentCell] },
      {
        rider: { riderId: 2, riderName: '«RIDER-B»' },
        category: 'Tandem Unicycle',
        cells: [absentCell],
      },
    ];
    const markup = render(rows, [ROUNDS[0]!]);
    expect(markup).toContain('Tandem Unicycle');
    expect(markup.indexOf('MS1 Boys')).toBeLessThan(markup.indexOf('Tandem Unicycle'));
  });

  it('gives a rider with no results at all a named, trailing home rather than dropping the rider', () => {
    const rows: RosterWallRow[] = [
      { rider: { riderId: 1, riderName: '«RIDER-A»' }, category: 'MS1 Boys', cells: [absentCell] },
      { rider: { riderId: 2, riderName: '«RIDER-B»' }, category: null, cells: [absentCell] },
    ];
    const markup = render(rows, [ROUNDS[0]!]);
    expect(markup).toContain('«RIDER-B»');
    expect(markup).toContain('No results yet');
  });

  it('renders no category with an empty group — only categories a rider actually raced', () => {
    const markup = render(ROWS);
    // The shared ROWS fixture is all one category, HS1 Boys: exactly one
    // heading, not sixteen with thirteen empty ones.
    expect(markup.match(/HS1 Boys/g)).toHaveLength(1);
  });

  it('still draws no bar, sparkline, or length-encoded mark once rows are grouped', () => {
    // The grouping headings must not smuggle a magnitude back in — the same
    // marks-not-magnitudes guard as the ungrouped wall.
    const markup = render(grouped, [ROUNDS[0]!]);
    expect(markup).not.toContain('<svg');
    expect(markup).not.toMatch(/style="[^"]*(width|height):/);
  });
});
