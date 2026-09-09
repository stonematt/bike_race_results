import { describe, expect, it } from 'vitest';
import { buildSeasonPulse } from './season-pulse.ts';

describe('buildSeasonPulse', () => {
  it('makes one distinct start per rider and round, and keeps podium and first-start marks independent', () => {
    const wall = buildSeasonPulse({
      rounds: [
        { id: 1, ordinal: 1, name: 'Race 1' },
        { id: 2, ordinal: 2, name: 'Race 2' },
      ],
      riders: [
        { id: 1, name: '«AQUA RIDER»', category: 'HS2 Girls' },
        { id: 2, name: '«PODIUM RIDER»', category: 'MS1 Boys' },
        { id: 3, name: '«NO RESULT RIDER»', category: null },
      ],
      results: [
        { riderId: 1, roundOrdinal: 2, status: 'finished', place: '5' },
        { riderId: 1, roundOrdinal: 2, status: 'finished', place: '5' },
        { riderId: 2, roundOrdinal: 1, status: 'finished', place: '6' },
        { riderId: 2, roundOrdinal: 2, status: 'dnf', place: 'DNF' },
      ],
    });

    expect(wall.rounds.map((round) => round.starts)).toEqual([1, 2]);
    expect(wall.groups.map((group) => group.label)).toEqual([
      'Girls · High School',
      'Boys · Middle School',
      'Category not recorded',
    ]);
    expect(wall.groups[0]?.riders[0]?.marks).toEqual([
      { state: 'no-result' },
      { state: 'start', lateFirstStart: true, podium: true },
    ]);
    expect(wall.groups[1]?.riders[0]?.marks).toEqual([
      { state: 'start', lateFirstStart: false, podium: false },
      { state: 'start', lateFirstStart: false, podium: false },
    ]);
  });

  it('only draws an every-race thread when two or more available races exist', () => {
    const oneRace = buildSeasonPulse({
      rounds: [{ id: 1, ordinal: 1, name: 'Race 1' }],
      riders: [{ id: 1, name: '«RIDER»', category: 'MS1 Girls' }],
      results: [{ riderId: 1, roundOrdinal: 1, status: 'finished', place: '1' }],
    });
    const twoRaces = buildSeasonPulse({
      rounds: [
        { id: 1, ordinal: 1, name: 'Race 1' },
        { id: 2, ordinal: 2, name: 'Race 2' },
      ],
      riders: [{ id: 1, name: '«RIDER»', category: 'MS1 Girls' }],
      results: [
        { riderId: 1, roundOrdinal: 1, status: 'finished', place: '1' },
        { riderId: 1, roundOrdinal: 2, status: 'finished', place: 'DNF' },
      ],
    });

    expect(oneRace.groups[0]?.riders[0]?.everyRace).toBe(false);
    expect(twoRaces.groups[0]?.riders[0]?.everyRace).toBe(true);
  });

  it('keeps each latest published category and orders riders by its ascending league rank', () => {
    const wall = buildSeasonPulse({
      rounds: [{ id: 1, ordinal: 1, name: 'Race 1' }],
      riders: [
        { id: 1, name: 'Zed', category: 'MS2 Girls' },
        { id: 2, name: 'Ada', category: 'MS1 Girls' },
        { id: 3, name: 'Bea', category: 'MS1 Girls' },
        { id: 4, name: 'Unknown', category: null },
      ],
      results: [],
    });

    expect(wall.groups[0]?.riders.map((rider) => [rider.name, rider.category])).toEqual([
      ['Ada', 'MS1 Girls'],
      ['Bea', 'MS1 Girls'],
      ['Zed', 'MS2 Girls'],
    ]);
    expect(wall.groups[1]?.riders).toMatchObject([{ name: 'Unknown', category: null }]);
  });
});
