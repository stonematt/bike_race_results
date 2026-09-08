/**
 * Conference-scoped fields through the public reporting queries.
 *
 * A combined Event can publish North and South contests under the same
 * canonical Category. The source's Category suffix is the contest boundary:
 * each side has its own winner, full-lap count, field size, and strip.
 * State Champs drops that suffix, so its null Conference remains one field.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../../lib/db/schema.ts';
import { loadCategoryField } from '../../../lib/db/category-query.ts';
import { createTestDb, type TestDatabase } from '../../../lib/db/testing.ts';
import { loadRaceDetail } from './query.ts';

let db: TestDatabase;

const conferenceFillers = ['3', '4', '5', '6'].flatMap((place) => [
  {
    eventId: 1,
    plate: `north-${place}`,
    displayName: `NORTH ${place}`,
    scoringTeam: 'North School',
    categoryRaw: 'HS2 Girls - North',
    place,
    status: 'finished' as const,
    timeRaw: `20:${place}0`,
    timeSeconds: String(1200 + Number(place) * 10),
    laps: 3,
  },
  {
    eventId: 1,
    plate: `south-${place}`,
    displayName: `SOUTH ${place}`,
    scoringTeam: 'South School',
    categoryRaw: 'HS2 Girls - South',
    place,
    status: 'finished' as const,
    timeRaw: `18:${place}0`,
    timeSeconds: String(1080 + Number(place) * 10),
    laps: 2,
  },
]);

beforeAll(async () => {
  db = await createTestDb();

  await db.insert(schema.season).values({ id: 1, year: 2025 });
  await db.insert(schema.round).values([
    { id: 1, seasonId: 1, ordinal: 1, name: 'Prologue' },
    { id: 2, seasonId: 1, ordinal: 5, name: 'State Champs' },
  ]);
  await db.insert(schema.event).values([
    { id: 1, roundId: 1, sourceEventId: 'combined', name: 'Prologue' },
    { id: 2, roundId: 2, sourceEventId: 'state', name: 'State Champs' },
  ]);

  await db.insert(schema.club).values({ id: 1, name: 'Test Club' });
  await db.insert(schema.squad).values({ id: 1, clubId: 1, seasonId: 1, name: 'JV' });
  await db.insert(schema.rider).values([
    { id: 1, displayName: '«RIDER-N»' },
    { id: 2, displayName: '«RIDER-S»' },
  ]);
  await db.insert(schema.riderPlate).values([
    { riderId: 1, seasonId: 1, plate: 'north-2' },
    { riderId: 1, seasonId: 1, plate: 'state-2' },
    { riderId: 2, seasonId: 1, plate: 'south-2' },
  ]);
  await db.insert(schema.squadMember).values([
    { squadId: 1, riderId: 1 },
    { squadId: 1, riderId: 2 },
  ]);

  await db.insert(schema.individualResult).values([
    // North's contest: its own three-lap winner makes RIDER-N 10% back.
    {
      eventId: 1,
      plate: 'north-1',
      displayName: 'NORTH WINNER',
      scoringTeam: 'North School',
      categoryRaw: 'HS2 Girls - North',
      place: '1',
      status: 'finished',
      timeRaw: '16:40',
      timeSeconds: '1000',
      laps: 3,
    },
    {
      eventId: 1,
      plate: 'north-2',
      displayName: 'NORTH RIDER',
      scoringTeam: 'North School',
      categoryRaw: 'HS2 Girls - North',
      place: '2',
      status: 'finished',
      timeRaw: '18:20',
      timeSeconds: '1100',
      laps: 3,
    },
    // South is a distinct two-lap contest despite sharing Event and Category.
    {
      eventId: 1,
      plate: 'south-1',
      displayName: 'SOUTH WINNER',
      scoringTeam: 'South School',
      categoryRaw: 'HS2 Girls - South',
      place: '1',
      status: 'finished',
      timeRaw: '15:00',
      timeSeconds: '900',
      laps: 2,
    },
    {
      eventId: 1,
      plate: 'south-2',
      displayName: 'SOUTH RIDER',
      scoringTeam: 'South School',
      categoryRaw: 'HS2 Girls - South',
      place: '2',
      status: 'finished',
      timeRaw: '16:30',
      timeSeconds: '990',
      laps: 2,
    },
    ...conferenceFillers,
    // State Champs publishes one unsuffixed category, so its two riders stay combined.
    {
      eventId: 2,
      plate: 'state-1',
      displayName: 'STATE WINNER',
      scoringTeam: 'State School',
      categoryRaw: 'HS2 Girls',
      place: '1',
      status: 'finished',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: 3,
    },
    {
      eventId: 2,
      plate: 'state-2',
      displayName: 'STATE RIDER',
      scoringTeam: 'State School',
      categoryRaw: 'HS2 Girls',
      place: '2',
      status: 'finished',
      timeRaw: '22:00',
      timeSeconds: '1320',
      laps: 3,
    },
  ]);
});

describe('combined events', () => {
  it('keeps a rider’s category winner, field, and strip inside her Conference', async () => {
    const [field, detail] = await Promise.all([
      loadCategoryField(db, 1, 1, 1),
      loadRaceDetail(db, 'combined', 1),
    ]);

    expect(field?.fieldSize).toBe(6);
    expect(field?.rows.slice(0, 2).map((row) => [row.displayName, row.pctBack])).toEqual([
      ['NORTH WINNER', 0],
      ['NORTH RIDER', 10],
    ]);

    const north = detail!.squads[0]!.riders.find((rider) => rider.card.plate === 'north-2')!;
    expect(north.card.stats.find((stat) => stat.label === 'Place')?.value).toBe('2 / 6');
    expect(north.card.stats.find((stat) => stat.label === 'Field')?.value).toBe(
      '6 started, too few to rank',
    );
    expect(north.card.headline).toEqual({ kind: 'pct-back', value: '10%', caption: 'back' });
    expect(north.field).toHaveLength(6);
  });

  it('keeps an unsuffixed State Champs category league-wide', async () => {
    const detail = await loadRaceDetail(db, 'state', 1);
    expect(detail!.starters).toBe(2);
    const rider = detail!.squads[0]!.riders.find((entry) => entry.card.plate === 'state-2')!;
    expect(rider.card.stats.find((stat) => stat.label === 'Place')?.value).toBe('2 / 2');
    expect(rider.card.headline).toEqual({ kind: 'pct-back', value: '10%', caption: 'back' });
    expect(rider.field).toHaveLength(2);
  });
});
