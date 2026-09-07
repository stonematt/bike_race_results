/*
 * The guards at the render boundary — the half `category-view.test.ts`
 * cannot reach. The ticket's central constraints are claims about markup:
 * the anchor row is marked and carries the anchor id, squad-mates are
 * tinted, the three states render inline, and none of the three is told
 * apart by colour alone. All four are only really held by looking at the
 * output.
 *
 * `renderToStaticMarkup`, matching `RosterWall.test.tsx`: a server component
 * with no state and no events has nothing to drive.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CategoryField, CategoryFieldRow } from '../lib/category.ts';
import { CategoryView } from './CategoryView.tsx';

function row(over: Partial<CategoryFieldRow>): CategoryFieldRow {
  return {
    plate: '10',
    displayName: '«RIDER»',
    scoringTeam: 'Some Team',
    place: '3',
    status: 'finished',
    pctBack: 5.2,
    lapsDown: 0,
    riderId: null,
    isSquadMate: false,
    ...over,
  };
}

function render(field: CategoryField, riderId: number): string {
  return renderToStaticMarkup(<CategoryView field={field} riderId={riderId} />);
}

const smallField: CategoryField = {
  categoryName: 'Varsity Girls - South',
  scope: 'conference',
  conference: 'South',
  fieldSize: 2,
  rows: [
    row({ plate: '1', place: '1', displayName: '«RIVAL»', riderId: 9 }),
    row({ plate: '2', place: '2', displayName: '«RIDER-A»', riderId: 1, isSquadMate: true }),
  ],
};

const largeField: CategoryField = {
  categoryName: 'HS1 Boys - North',
  scope: 'conference',
  conference: 'North',
  fieldSize: 80,
  rows: [
    ...Array.from({ length: 78 }, (_, i) =>
      row({ plate: String(i), place: String(i + 1), displayName: `rider-${i}`, riderId: null }),
    ),
    row({ plate: '998', place: '79', displayName: '«RIDER-B»', riderId: 2, isSquadMate: true }),
    row({ plate: '999', place: '80', displayName: '«RIDER-A»', riderId: 1, isSquadMate: true }),
  ],
};

const withDnfAndShortLap: CategoryField = {
  categoryName: 'HS2 Girls',
  scope: 'league',
  conference: null,
  fieldSize: 3,
  rows: [
    row({ plate: '1', place: '1', displayName: '«RIDER-A»', riderId: 1 }),
    row({
      plate: '2',
      place: '65',
      status: 'finished',
      lapsDown: 1,
      pctBack: null,
      displayName: '«SHORT-LAP-RIDER»',
      riderId: null,
    }),
    row({
      plate: '3',
      place: '*',
      status: 'dnf',
      pctBack: null,
      lapsDown: null,
      displayName: '«DNF-RIDER»',
      riderId: null,
    }),
  ],
};

describe('the anchor row', () => {
  it('is marked with a text badge, not colour alone, and carries the anchor id', () => {
    const markup = render(smallField, 1);
    expect(markup).toContain('id="rider"');
    expect(markup).toContain('This rider');
    expect(markup).toContain('«RIDER-A»');
  });

  it('states the headline as an ordinal against the field size', () => {
    const markup = render(smallField, 1);
    expect(markup).toContain('2nd of 2');
  });

  it('labels the card with the rider’s own name, never a pronoun', () => {
    const markup = render(smallField, 1);
    expect(markup).toContain('«RIDER-A»');
    expect(markup).not.toMatch(/\bher\b|\bshe\b/i);
  });
});

describe('no pronoun, on a boys’ category (issue #112)', () => {
  const boysField: CategoryField = {
    categoryName: 'MS3 Boys - North',
    scope: 'conference',
    conference: 'North',
    fieldSize: 31,
    rows: [row({ plate: '1', place: '1', displayName: '«RIDER-A»', riderId: 1 })],
  };

  it('labels the anchor card and row by name, never "her" or "she"', () => {
    const markup = render(boysField, 1);
    expect(markup).toContain('«RIDER-A»');
    expect(markup).toContain('This rider');
    expect(markup).not.toMatch(/\bher\b|\bshe\b|\bhers\b|\bherself\b/i);
  });
});

describe('squad-mates', () => {
  it('are tinted and carry their own text badge, distinct from the anchor’s', () => {
    const markup = render(largeField, 1);
    expect(markup).toContain('Squad');
    // The anchor row says "This rider", not "Squad", even though it is also
    // a squad-mate's row — the two badges never collide on one row.
    const anchorRowMatch = markup.match(/<li id="rider"[^]*?<\/li>/);
    expect(anchorRowMatch).not.toBeNull();
    expect(anchorRowMatch![0]).toContain('This rider');
    expect(anchorRowMatch![0]).not.toContain('>Squad<');
  });

  it('reads correctly at the small end of the corpus: a two-rider Category', () => {
    const markup = render(smallField, 1);
    expect(markup).toContain('«RIVAL»');
    expect(markup).toContain('«RIDER-A»');
    expect(markup).toContain('2nd of 2');
  });

  it('reads correctly at the large end of the corpus: an eighty-rider Category', () => {
    const markup = render(largeField, 1);
    expect(markup).toContain('id="rider"');
    expect(markup).toContain('80th of 80');
    expect((markup.match(/<li/g) ?? []).length).toBe(80);
  });
});

describe('who is included', () => {
  it('names the Category and the Conference it is scoped to', () => {
    const markup = render(smallField, 1);
    expect(markup).toContain('Varsity Girls - South');
    expect(markup).toContain('South Conference');
  });

  it('says league-wide instead of naming a Conference, at State Champs', () => {
    const markup = render(withDnfAndShortLap, 1);
    expect(markup).toContain('every starter across the league');
  });
});

describe('the three states render inline', () => {
  it('draws a DNF as a row with no position, not a missing row', () => {
    const markup = render(withDnfAndShortLap, 1);
    expect(markup).toContain('«DNF-RIDER»');
    expect(markup).toContain('>DNF<');
    expect((markup.match(/<li/g) ?? []).length).toBe(3);
  });

  it('draws a short-lap rider with the published place, the deficit riding beside it (issue #111)', () => {
    // NICA orders the rider in the same single sequence as everyone else, so
    // the row carries the numeral like anyone else's — never a state chip in
    // place of it.
    const markup = render(withDnfAndShortLap, 1);
    expect(markup).toContain('«SHORT-LAP-RIDER»');
    expect(markup).toContain('>65<');
    expect(markup).toContain('−1 lap');
    expect(markup).not.toContain('>Lapped<');
  });

  it('never renders a null percent back as zero or as blank silence', () => {
    const markup = render(withDnfAndShortLap, 1);
    expect(markup).toContain('no gap published');
    expect(markup).not.toMatch(/>0%</);
  });

  it('gives DNF its own chip class; a short-lap rider gets no chip, just the numeral', () => {
    const markup = render(withDnfAndShortLap, 1);
    expect(markup).toMatch(/bg-fg[^"]*"[^>]*>DNF/);
    // `bg-navy` was the lapped chip's tone (issue #111) — retired along with
    // the chip it painted, since a short-lap rider gets no chip at all now.
    expect(markup).not.toContain('bg-navy');
  });
});

describe('no chart, no histogram', () => {
  it('draws no bar, sparkline, or any length-encoded mark', () => {
    const markup = render(largeField, 1);
    expect(markup).not.toContain('<svg');
    expect(markup).not.toMatch(/style="[^"]*(width|height):/);
  });
});
