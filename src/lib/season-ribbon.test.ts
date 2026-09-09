import { describe, expect, it } from 'vitest';
import { ribbonRoundsForSeason } from './season-ribbon.ts';

describe('ribbonRoundsForSeason', () => {
  it('shows the published 2026 Oregon weekends, while only result-backed rounds link locally', () => {
    const ribbon = ribbonRoundsForSeason(2026, [{ id: 1, ordinal: 1, name: 'Race 1', starts: 6 }]);

    expect(ribbon).toMatchObject([
      {
        ordinal: 1,
        label: 'Old Oak Prologue',
        date: 'Aug 30',
        conference: 'North + South · same day',
        href: '/2026/round/1',
        starts: 6,
      },
      {
        ordinal: 2,
        label: 'Magical Madras',
        date: 'Sep 12–13',
        conference: 'North Sep 12 · South Sep 13',
        href: null,
      },
      {
        ordinal: 3,
        label: 'Cascade Challenge',
        conference: 'South Sep 26 · North Sep 27',
        href: null,
      },
      {
        ordinal: 4,
        label: 'Newport Gnarnia',
        conference: 'North Oct 10 · South Oct 11',
        href: null,
      },
      {
        ordinal: 5,
        label: 'State Champs: Butte Scoot Boogie',
        conference: 'North + South · same day',
        href: null,
      },
    ]);
  });

  it('keeps another year limited to its available result rounds', () => {
    expect(ribbonRoundsForSeason(2025, [{ id: 9, ordinal: 4, name: 'Race 4', starts: 3 }])).toEqual(
      [{ ordinal: 4, label: 'Race 4', href: '/2025/round/4', starts: 3 }],
    );
  });

  it('retains an available 2026 result round that is outside the five Oregon weekends', () => {
    const ribbon = ribbonRoundsForSeason(2026, [
      { id: 1, ordinal: 1, name: 'Race 1', starts: 6 },
      { id: 6, ordinal: 6, name: 'Western Regionals', starts: 2 },
    ]);

    expect(ribbon.at(-1)).toEqual({
      ordinal: 6,
      label: 'Western Regionals',
      href: '/2026/round/6',
      starts: 2,
    });
  });
});
