/**
 * The editorial roster is a checkpoint-bounded, current-identity Club read.
 */

import { expect, it } from 'vitest';
import * as schema from './schema.ts';
import { createTestDb } from './testing.ts';
import { loadEditorialRoster } from './editorial-roster-query.ts';

it('uses the latest included category and excludes a Rider’s later result', async () => {
  const db = await createTestDb();
  await db.insert(schema.season).values({ id: 1, year: 2046 });
  await db.insert(schema.round).values([
    { id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' },
    { id: 2, seasonId: 1, ordinal: 2, name: 'Race 2' },
    { id: 3, seasonId: 1, ordinal: 3, name: 'Race 3' },
  ]);
  await db.insert(schema.event).values([
    { id: 1, roundId: 1, sourceEventId: 'race-1', name: 'Race 1' },
    { id: 2, roundId: 2, sourceEventId: 'race-2', name: 'Race 2' },
    { id: 3, roundId: 3, sourceEventId: 'race-3', name: 'Race 3' },
  ]);
  await db.insert(schema.club).values({ id: 1, name: 'Test Club' });
  await db.insert(schema.rider).values([
    { id: 1, displayName: '«CURRENT RIDER»' },
    { id: 2, displayName: '«NO RESULT RIDER»' },
  ]);
  await db.insert(schema.clubMember).values([
    { clubId: 1, seasonId: 1, riderId: 1 },
    { clubId: 1, seasonId: 1, riderId: 2 },
  ]);
  await db.insert(schema.riderPlate).values({ riderId: 1, seasonId: 1, plate: 'RIDER' });
  await db.insert(schema.individualResult).values([
    {
      eventId: 1,
      plate: 'RIDER',
      displayName: 'HISTORICAL RIDER',
      scoringTeam: 'Test School',
      categoryRaw: 'HS1 Girls',
      place: '1',
      status: 'finished',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: 2,
    },
    {
      eventId: 2,
      plate: 'RIDER',
      displayName: 'HISTORICAL RIDER',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls',
      place: '1',
      status: 'finished',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: 2,
    },
    {
      eventId: 3,
      plate: 'RIDER',
      displayName: 'HISTORICAL RIDER',
      scoringTeam: 'Test School',
      categoryRaw: 'Varsity Girls',
      place: '1',
      status: 'finished',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: 2,
    },
  ]);

  const roster = await loadEditorialRoster(db, {
    seasonId: 1,
    clubId: 1,
    checkpoint: { kind: 'through', ordinal: 2 },
  });

  expect(roster).toMatchObject({
    season: { id: 1, year: 2046 },
    checkpoint: { kind: 'through', ordinal: 2 },
    squad: null,
    rounds: [
      { round: { ordinal: 1 }, availability: 'published' },
      { round: { ordinal: 2 }, availability: 'published' },
      { round: { ordinal: 3 }, availability: 'after-checkpoint' },
    ],
    riders: [
      {
        id: 1,
        name: '«CURRENT RIDER»',
        category: 'HS2 Girls',
        results: [
          { race: { sourceEventId: 'race-1', roundOrdinal: 1 } },
          { race: { sourceEventId: 'race-2', roundOrdinal: 2 } },
        ],
      },
      { id: 2, name: '«NO RESULT RIDER»', category: null, results: [] },
    ],
  });
});

it('limits an optional Squad to its Club and Season', async () => {
  const db = await createTestDb();
  await db.insert(schema.season).values([
    { id: 1, year: 2047 },
    { id: 2, year: 2048 },
  ]);
  await db.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });
  await db.insert(schema.club).values([
    { id: 1, name: 'Test Club' },
    { id: 2, name: 'Other Club' },
  ]);
  await db.insert(schema.squad).values([
    { id: 1, clubId: 1, seasonId: 1, name: 'Cedar' },
    { id: 2, clubId: 2, seasonId: 1, name: 'Other Cedar' },
    { id: 3, clubId: 1, seasonId: 2, name: 'Next Cedar' },
  ]);
  await db.insert(schema.rider).values([
    { id: 1, displayName: '«CEDAR RIDER»' },
    { id: 2, displayName: '«UNASSIGNED RIDER»' },
  ]);
  await db.insert(schema.clubMember).values([
    { clubId: 1, seasonId: 1, riderId: 1 },
    { clubId: 1, seasonId: 1, riderId: 2 },
  ]);
  await db.insert(schema.squadMember).values({ squadId: 1, riderId: 1 });

  const scoped = await loadEditorialRoster(db, { seasonId: 1, clubId: 1, squadId: 1 });
  expect(scoped).toMatchObject({
    squad: { id: 1, name: 'Cedar' },
    riders: [{ id: 1, name: '«CEDAR RIDER»', results: [] }],
  });
  await expect(loadEditorialRoster(db, { seasonId: 1, clubId: 1, squadId: 2 })).resolves.toBeNull();
  await expect(loadEditorialRoster(db, { seasonId: 1, clubId: 1, squadId: 3 })).resolves.toBeNull();
});

it('retains every split-Event result and deterministically qualifies the latest Round', async () => {
  const db = await createTestDb();
  await db.insert(schema.season).values({ id: 1, year: 2048 });
  await db.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 2, name: 'Race 2' });
  await db.insert(schema.event).values([
    { id: 1, roundId: 1, sourceEventId: 'north', name: 'Race 2 North' },
    { id: 2, roundId: 1, sourceEventId: 'south', name: 'Race 2 South' },
  ]);
  await db.insert(schema.club).values({ id: 1, name: 'Test Club' });
  await db.insert(schema.rider).values({ id: 1, displayName: '«SPLIT RIDER»' });
  await db.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 1 });
  await db.insert(schema.riderPlate).values({ riderId: 1, seasonId: 1, plate: 'SPLIT' });
  await db.insert(schema.individualResult).values([
    {
      eventId: 1,
      plate: 'SPLIT',
      displayName: 'SPLIT RIDER',
      scoringTeam: 'Test School',
      categoryRaw: 'HS1 Girls - North',
      place: '1',
      status: 'finished',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: 2,
    },
    {
      eventId: 2,
      plate: 'SPLIT',
      displayName: 'SPLIT RIDER',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls - South',
      place: '1',
      status: 'finished',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: 2,
    },
  ]);

  const roster = await loadEditorialRoster(db, { seasonId: 1, clubId: 1 });

  expect(roster?.riders).toMatchObject([
    {
      id: 1,
      category: 'HS1 Girls',
      results: [
        {
          race: { sourceEventId: 'north' },
          result: { category: 'HS1 Girls', conference: 'North' },
        },
        {
          race: { sourceEventId: 'south' },
          result: { category: 'HS2 Girls', conference: 'South' },
        },
      ],
    },
  ]);
});

it('rejects an unknown explicit checkpoint instead of showing a different roster view', async () => {
  const db = await createTestDb();
  await db.insert(schema.season).values({ id: 1, year: 2049 });
  await db.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });

  await expect(
    loadEditorialRoster(db, {
      seasonId: 1,
      clubId: 1,
      checkpoint: { kind: 'through', ordinal: 2 },
    }),
  ).resolves.toBeNull();
});
