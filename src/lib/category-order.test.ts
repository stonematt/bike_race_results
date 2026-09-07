/**
 * The league's category order, pinned against the ingest vocabulary — the
 * same pin `race-detail.test.ts` held before this list moved out from under
 * `src/components/` (issue #113).
 */

import { describe, expect, it } from 'vitest';
import { GENDERS, GRADE_BANDS } from './ingest/category.ts';
import { categoryRank } from './category-order.ts';

const LEAGUE = GRADE_BANDS.flatMap((band) => GENDERS.map((gender) => `${band} ${gender}`));

describe('categoryRank, ascending (the league order MS1 up to Varsity)', () => {
  it('ranks exactly the fourteen the league publishes, in the league order', () => {
    // A band added to the league that never reached this module fails here.
    expect(LEAGUE.map((c) => categoryRank(c))).toEqual(LEAGUE.map((_, rank) => rank));
  });

  it('sorts a category the league does not publish behind all fourteen', () => {
    expect(categoryRank('Tandem Unicycle')).toBe(LEAGUE.length);
  });
});

describe('categoryRank, descending (the wall order Varsity down to MS1)', () => {
  it('reverses the fourteen', () => {
    const descending = [...LEAGUE].reverse();
    expect(descending.map((c) => categoryRank(c, 'descending'))).toEqual(
      descending.map((_, rank) => rank),
    );
  });

  it('still sorts an unrecognized category trailing, never leading', () => {
    // A naive `size - 1 - rank` flip would put "unknown" (the highest
    // ascending rank) at the front once the direction reverses. It must not:
    // an unrecognized category always sorts after every recognized one,
    // whichever direction a caller picked (issue #113, rule 4).
    expect(categoryRank('Tandem Unicycle', 'descending')).toBe(LEAGUE.length);
    expect(categoryRank('Tandem Unicycle', 'descending')).toBeGreaterThan(
      categoryRank('MS1 Boys', 'descending'),
    );
  });
});
