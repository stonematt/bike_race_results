/**
 * The Season dispatch reads published Starts through a chosen checkpoint.
 *
 * This is intentionally a migrated-PGlite seam: it exercises the identity
 * view that maps season-scoped plates to Riders and proves club-wide counts do
 * not accidentally sum overlapping Squads.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from './schema.ts';
import { createTestDb, type TestDatabase } from './testing.ts';
import { loadRaceCategories, loadRiderSeason, loadSeasonDispatch } from './editorial-query.ts';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDb();

  await db.insert(schema.season).values({ id: 1, year: 2025 });
  await db.insert(schema.round).values([
    { id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' },
    { id: 2, seasonId: 1, ordinal: 2, name: 'Race 2' },
    { id: 3, seasonId: 1, ordinal: 3, name: 'Race 3' },
  ]);
  await db.insert(schema.event).values([
    { id: 1, roundId: 1, sourceEventId: 'race-1', conference: 'North', name: 'Race 1' },
    { id: 2, roundId: 2, sourceEventId: 'race-2', conference: 'North', name: 'Race 2' },
    { id: 3, roundId: 3, sourceEventId: 'race-3', conference: 'North', name: 'Race 3' },
  ]);
  await db.insert(schema.club).values({ id: 1, name: 'Test Club' });
  await db.insert(schema.squad).values([
    { id: 1, clubId: 1, seasonId: 1, name: 'Cedar' },
    { id: 2, clubId: 1, seasonId: 1, name: 'Summit' },
  ]);
  await db.insert(schema.rider).values([
    { id: 1, displayName: '«RIDER-A»' },
    { id: 2, displayName: '«RIDER-B»' },
    { id: 3, displayName: '«RIDER-C»' },
  ]);
  await db.insert(schema.clubMember).values([
    { clubId: 1, seasonId: 1, riderId: 1 },
    { clubId: 1, seasonId: 1, riderId: 2 },
    { clubId: 1, seasonId: 1, riderId: 3 },
  ]);
  // Rider A belongs to both current-state Squads. Club reporting counts one
  // Start for her at a Round, never one per Squad.
  await db.insert(schema.squadMember).values([
    { squadId: 1, riderId: 1 },
    { squadId: 1, riderId: 2 },
    { squadId: 2, riderId: 1 },
    { squadId: 2, riderId: 3 },
  ]);
  await db.insert(schema.riderPlate).values([
    { riderId: 1, seasonId: 1, plate: 'A' },
    { riderId: 2, seasonId: 1, plate: 'B' },
    { riderId: 3, seasonId: 1, plate: 'C' },
  ]);
  await db.insert(schema.individualResult).values([
    {
      eventId: 1,
      plate: 'A',
      displayName: 'RIDER A',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls - North',
      place: '1',
      status: 'finished',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: 2,
    },
    {
      eventId: 1,
      plate: 'B',
      displayName: 'RIDER B',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls - North',
      place: '2',
      status: 'finished',
      timeRaw: '21:00',
      timeSeconds: '1260',
      laps: 2,
    },
    {
      eventId: 2,
      plate: 'A',
      displayName: 'RIDER A',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls - North',
      place: '1',
      status: 'finished',
      timeRaw: '19:00',
      timeSeconds: '1140',
      laps: 2,
    },
    {
      eventId: 2,
      plate: 'C',
      displayName: 'RIDER C',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls - North',
      place: '2',
      status: 'finished',
      timeRaw: '22:00',
      timeSeconds: '1320',
      laps: 2,
    },
    // These are real later starts, but a Race-2 dispatch must not use them.
    {
      eventId: 3,
      plate: 'A',
      displayName: 'RIDER A',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls - North',
      place: '1',
      status: 'finished',
      timeRaw: '18:00',
      timeSeconds: '1080',
      laps: 2,
    },
    {
      eventId: 3,
      plate: 'B',
      displayName: 'RIDER B',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls - North',
      place: '2',
      status: 'finished',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: 2,
    },
  ]);
});

describe('loadSeasonDispatch', () => {
  it('counts distinct club Starts through Race 2 without borrowing Race 3', async () => {
    const dispatch = await loadSeasonDispatch(db, {
      seasonId: 1,
      clubId: 1,
      userId: null,
      checkpoint: { kind: 'through', ordinal: 2 },
    });

    expect(dispatch).toEqual({
      season: { id: 1, year: 2025 },
      checkpoint: { kind: 'through', ordinal: 2 },
      schedule: {
        kind: 'available',
        rounds: [
          {
            round: { id: 1, ordinal: 1, name: 'Race 1' },
            events: [{ sourceEventId: 'race-1', name: 'Race 1', conference: 'North' }],
            availability: 'published',
            clubStarts: 2,
            firstRecordedStarts: 2,
          },
          {
            round: { id: 2, ordinal: 2, name: 'Race 2' },
            events: [{ sourceEventId: 'race-2', name: 'Race 2', conference: 'North' }],
            availability: 'published',
            clubStarts: 2,
            firstRecordedStarts: 1,
          },
          {
            round: { id: 3, ordinal: 3, name: 'Race 3' },
            events: [{ sourceEventId: 'race-3', name: 'Race 3', conference: 'North' }],
            availability: 'after-checkpoint',
            clubStarts: null,
            firstRecordedStarts: null,
          },
        ],
      },
      personalSquad: null,
      availableSquads: [],
    });
  });

  it('keeps a scheduled Season honest when no Round has published results', async () => {
    const unpublished = await createTestDb();
    await unpublished.insert(schema.season).values({ id: 1, year: 2026 });
    await unpublished
      .insert(schema.round)
      .values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });
    await unpublished.insert(schema.event).values({
      id: 1,
      roundId: 1,
      sourceEventId: 'scheduled-race-1',
      conference: 'North',
      name: 'Race 1',
    });

    const dispatch = await loadSeasonDispatch(unpublished, {
      seasonId: 1,
      clubId: 1,
      userId: null,
    });

    expect(dispatch).toEqual({
      season: { id: 1, year: 2026 },
      checkpoint: { kind: 'none' },
      schedule: {
        kind: 'available',
        rounds: [
          {
            round: { id: 1, ordinal: 1, name: 'Race 1' },
            events: [{ sourceEventId: 'scheduled-race-1', name: 'Race 1', conference: 'North' }],
            availability: 'unpublished',
            clubStarts: null,
            firstRecordedStarts: null,
          },
        ],
      },
      personalSquad: null,
      availableSquads: [],
    });
  });

  it('does not turn published results into zero Starts for an explicit no-checkpoint view', async () => {
    const dispatch = await loadSeasonDispatch(db, {
      seasonId: 1,
      clubId: 1,
      userId: null,
      checkpoint: { kind: 'none' },
    });

    expect(dispatch?.schedule).toEqual({
      kind: 'available',
      rounds: expect.arrayContaining([
        expect.objectContaining({
          round: { id: 1, ordinal: 1, name: 'Race 1' },
          availability: 'after-checkpoint',
          clubStarts: null,
          firstRecordedStarts: null,
        }),
        expect.objectContaining({
          round: { id: 2, ordinal: 2, name: 'Race 2' },
          availability: 'after-checkpoint',
          clubStarts: null,
          firstRecordedStarts: null,
        }),
      ]),
    });
  });

  it('marks a split Round partial instead of inferring zero Starts from an unreported Event', async () => {
    const splitRound = await createTestDb();
    await splitRound.insert(schema.season).values({ id: 1, year: 2029 });
    await splitRound
      .insert(schema.round)
      .values({ id: 1, seasonId: 1, ordinal: 2, name: 'Race 2' });
    await splitRound.insert(schema.event).values([
      {
        id: 1,
        roundId: 1,
        sourceEventId: 'race-2-north',
        conference: 'North',
        name: 'Race 2 North',
      },
      {
        id: 2,
        roundId: 1,
        sourceEventId: 'race-2-south',
        conference: 'South',
        name: 'Race 2 South',
      },
    ]);
    await splitRound.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await splitRound.insert(schema.rider).values({ id: 1, displayName: '«NORTH RIDER»' });
    await splitRound.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 1 });
    await splitRound.insert(schema.riderPlate).values({
      riderId: 1,
      seasonId: 1,
      plate: 'NORTH',
    });
    // The club's North Event has no published result. A South result proves
    // only the other Event in this Round is available.
    await splitRound.insert(schema.individualResult).values({
      eventId: 2,
      plate: 'SOUTH',
      displayName: 'SOUTH RIDER',
      scoringTeam: 'Other School',
      categoryRaw: 'HS2 Girls - South',
      place: '1',
      status: 'finished',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: 2,
    });

    const dispatch = await loadSeasonDispatch(splitRound, {
      seasonId: 1,
      clubId: 1,
      userId: null,
      checkpoint: { kind: 'through', ordinal: 2 },
    });

    expect(dispatch?.schedule).toEqual({
      kind: 'available',
      rounds: [
        expect.objectContaining({
          availability: 'partial',
          clubStarts: null,
          firstRecordedStarts: null,
        }),
      ],
    });
  });

  it('scopes Starts to the requested Club and Season', async () => {
    const scoped = await createTestDb();
    await scoped.insert(schema.season).values([
      { id: 1, year: 2030 },
      { id: 2, year: 2031 },
    ]);
    await scoped.insert(schema.round).values([
      { id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' },
      { id: 2, seasonId: 2, ordinal: 1, name: 'Race 1' },
    ]);
    await scoped.insert(schema.event).values([
      { id: 1, roundId: 1, sourceEventId: '2030-race-1', name: 'Race 1' },
      { id: 2, roundId: 2, sourceEventId: '2031-race-1', name: 'Race 1' },
    ]);
    await scoped.insert(schema.club).values([
      { id: 1, name: 'North Club' },
      { id: 2, name: 'South Club' },
    ]);
    await scoped.insert(schema.rider).values([
      { id: 1, displayName: '«NORTH RIDER»' },
      { id: 2, displayName: '«SOUTH RIDER»' },
    ]);
    await scoped.insert(schema.clubMember).values([
      { clubId: 1, seasonId: 1, riderId: 1 },
      { clubId: 2, seasonId: 1, riderId: 2 },
      { clubId: 1, seasonId: 2, riderId: 2 },
    ]);
    await scoped.insert(schema.riderPlate).values([
      { riderId: 1, seasonId: 1, plate: 'NORTH-2030' },
      { riderId: 2, seasonId: 1, plate: 'SOUTH-2030' },
      { riderId: 2, seasonId: 2, plate: 'SOUTH-2031' },
    ]);
    await scoped.insert(schema.individualResult).values([
      {
        eventId: 1,
        plate: 'NORTH-2030',
        displayName: 'NORTH RIDER',
        scoringTeam: 'North School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'SOUTH-2030',
        displayName: 'SOUTH RIDER',
        scoringTeam: 'South School',
        categoryRaw: 'HS2 Girls',
        place: '2',
        status: 'finished',
        timeRaw: '22:00',
        timeSeconds: '1320',
        laps: 2,
      },
      {
        eventId: 2,
        plate: 'SOUTH-2031',
        displayName: 'SOUTH RIDER',
        scoringTeam: 'South School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '21:00',
        timeSeconds: '1260',
        laps: 2,
      },
    ]);

    const dispatch = await loadSeasonDispatch(scoped, {
      seasonId: 1,
      clubId: 1,
      userId: null,
      checkpoint: { kind: 'through', ordinal: 1 },
    });

    expect(dispatch?.schedule).toMatchObject({
      kind: 'available',
      rounds: [{ availability: 'published', clubStarts: 1, firstRecordedStarts: 1 }],
    });
  });

  it('counts a published DNF as a Club Start', async () => {
    const dnf = await createTestDb();
    await dnf.insert(schema.season).values({ id: 1, year: 2032 });
    await dnf.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });
    await dnf.insert(schema.event).values({
      id: 1,
      roundId: 1,
      sourceEventId: '2032-race-1',
      name: 'Race 1',
    });
    await dnf.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await dnf.insert(schema.rider).values({ id: 1, displayName: '«DNF RIDER»' });
    await dnf.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 1 });
    await dnf.insert(schema.riderPlate).values({ riderId: 1, seasonId: 1, plate: 'DNF' });
    await dnf.insert(schema.individualResult).values({
      eventId: 1,
      plate: 'DNF',
      displayName: 'DNF RIDER',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls',
      place: '*',
      status: 'dnf',
      timeRaw: 'DNF',
      timeSeconds: null,
      laps: null,
    });

    const dispatch = await loadSeasonDispatch(dnf, {
      seasonId: 1,
      clubId: 1,
      userId: null,
    });

    expect(dispatch?.schedule).toMatchObject({
      kind: 'available',
      rounds: [{ availability: 'published', clubStarts: 1, firstRecordedStarts: 1 }],
    });
  });

  it('defaults to the latest ordinal when multiple complete Rounds are published', async () => {
    const published = await createTestDb();
    await published.insert(schema.season).values({ id: 1, year: 2033 });
    await published.insert(schema.round).values([
      { id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' },
      { id: 2, seasonId: 1, ordinal: 2, name: 'Race 2' },
    ]);
    await published.insert(schema.event).values([
      { id: 1, roundId: 1, sourceEventId: '2033-race-1', name: 'Race 1' },
      { id: 2, roundId: 2, sourceEventId: '2033-race-2', name: 'Race 2' },
    ]);
    await published.insert(schema.individualResult).values([
      {
        eventId: 1,
        plate: 'ONE',
        displayName: 'ONE',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 2,
      },
      {
        eventId: 2,
        plate: 'TWO',
        displayName: 'TWO',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 2,
      },
    ]);

    const dispatch = await loadSeasonDispatch(published, {
      seasonId: 1,
      clubId: 1,
      userId: null,
    });

    expect(dispatch?.checkpoint).toEqual({ kind: 'through', ordinal: 2 });
    expect(dispatch?.schedule).toMatchObject({
      kind: 'available',
      rounds: [{ availability: 'published' }, { availability: 'published' }],
    });
  });

  it('rejects a malformed or unknown explicit checkpoint instead of changing it', async () => {
    for (const ordinal of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 99]) {
      await expect(
        loadSeasonDispatch(db, {
          seasonId: 1,
          clubId: 1,
          userId: null,
          checkpoint: { kind: 'through', ordinal },
        }),
      ).resolves.toBeNull();
    }
  });

  it('distinguishes an unavailable schedule from a published Round with zero club Starts', async () => {
    const noSchedule = await createTestDb();
    await noSchedule.insert(schema.season).values({ id: 1, year: 2027 });

    const zeroStarts = await createTestDb();
    await zeroStarts.insert(schema.season).values({ id: 1, year: 2028 });
    await zeroStarts
      .insert(schema.round)
      .values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });
    await zeroStarts.insert(schema.event).values({
      id: 1,
      roundId: 1,
      sourceEventId: 'published-without-club',
      conference: 'North',
      name: 'Race 1',
    });
    await zeroStarts.insert(schema.individualResult).values({
      eventId: 1,
      plate: 'OTHER',
      displayName: 'OTHER RIDER',
      scoringTeam: 'Other School',
      categoryRaw: 'HS2 Girls - North',
      place: '1',
      status: 'finished',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: 2,
    });

    const [unavailable, published] = await Promise.all([
      loadSeasonDispatch(noSchedule, { seasonId: 1, clubId: 1, userId: null }),
      loadSeasonDispatch(zeroStarts, { seasonId: 1, clubId: 1, userId: null }),
    ]);

    expect(unavailable).toMatchObject({
      season: { id: 1, year: 2027 },
      checkpoint: { kind: 'none' },
      schedule: { kind: 'unavailable' },
    });
    expect(published).toMatchObject({
      season: { id: 1, year: 2028 },
      checkpoint: { kind: 'through', ordinal: 1 },
      schedule: {
        kind: 'available',
        rounds: [
          expect.objectContaining({
            availability: 'published',
            clubStarts: 0,
            firstRecordedStarts: 0,
          }),
        ],
      },
    });
  });
});

describe('loadRiderSeason', () => {
  it('keeps the current Rider name and excludes later results at a Race-2 checkpoint', async () => {
    const rider = await loadRiderSeason(db, {
      seasonId: 1,
      clubId: 1,
      riderId: 1,
      checkpoint: { kind: 'through', ordinal: 2 },
      selectedSourceEventId: 'race-2',
    });

    expect(rider).toMatchObject({
      rider: { id: 1, name: '«RIDER-A»' },
      checkpoint: { kind: 'through', ordinal: 2 },
      rounds: [
        {
          round: { id: 1, ordinal: 1, name: 'Race 1' },
          results: [
            {
              race: { sourceEventId: 'race-1', roundOrdinal: 1 },
              result: { plate: 'A', timeRaw: '20:00' },
              officialTotal: '20:00',
              measured: { kind: 'none' },
            },
          ],
        },
        {
          round: { id: 2, ordinal: 2, name: 'Race 2' },
          results: [
            {
              race: { sourceEventId: 'race-2', roundOrdinal: 2 },
              result: { plate: 'A', timeRaw: '19:00' },
              officialTotal: '19:00',
              measured: { kind: 'none' },
            },
          ],
        },
      ],
      selected: {
        race: { sourceEventId: 'race-2', roundOrdinal: 2 },
        result: { plate: 'A', timeRaw: '19:00' },
        officialTotal: '19:00',
        measured: { kind: 'none' },
      },
    });
    expect(
      rider?.rounds.flatMap((round) => round.results).map((result) => result.race.sourceEventId),
    ).toEqual(['race-1', 'race-2']);
    expect(rider?.selected?.neighbors).toEqual({
      gapBasis: 'derived-percent-back-percentage-points',
      ahead: [],
      behind: [{ plate: 'C', place: '2', pctBack: 15.8, gapPctPoints: 15.8 }],
    });
  });

  it('retains every Event result in a split Round and uses the selected Event only to disambiguate detail', async () => {
    const split = await createTestDb();
    await split.insert(schema.season).values({ id: 1, year: 2037 });
    await split.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 2, name: 'Race 2' });
    await split.insert(schema.event).values([
      {
        id: 1,
        roundId: 1,
        sourceEventId: 'race-2-north',
        conference: 'North',
        name: 'Race 2 North',
      },
      {
        id: 2,
        roundId: 1,
        sourceEventId: 'race-2-south',
        conference: 'South',
        name: 'Race 2 South',
      },
    ]);
    await split.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await split.insert(schema.rider).values({ id: 1, displayName: '«SPLIT RIDER»' });
    await split.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 1 });
    await split.insert(schema.riderPlate).values({ riderId: 1, seasonId: 1, plate: 'SPLIT' });
    await split.insert(schema.individualResult).values([
      {
        eventId: 1,
        plate: 'SPLIT',
        displayName: 'OLD SPLIT RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls - North',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 2,
      },
      {
        eventId: 2,
        plate: 'SPLIT',
        displayName: 'OLD SPLIT RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls - South',
        place: '1',
        status: 'finished',
        timeRaw: '21:00',
        timeSeconds: '1260',
        laps: 2,
      },
    ]);

    const rider = await loadRiderSeason(split, {
      seasonId: 1,
      clubId: 1,
      riderId: 1,
      checkpoint: { kind: 'through', ordinal: 2 },
      selectedSourceEventId: 'race-2-south',
    });

    expect(rider?.rounds).toMatchObject([
      {
        round: { id: 1, ordinal: 2, name: 'Race 2' },
        results: [
          { race: { sourceEventId: 'race-2-north' }, result: { conference: 'North' } },
          { race: { sourceEventId: 'race-2-south' }, result: { conference: 'South' } },
        ],
      },
    ]);
    expect(rider?.selected).toMatchObject({
      race: { sourceEventId: 'race-2-south' },
      result: { conference: 'South', timeRaw: '21:00' },
    });
  });

  it('reports no neighbors for a one-finisher field', async () => {
    const single = await createTestDb();
    await single.insert(schema.season).values({ id: 1, year: 2038 });
    await single.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });
    await single.insert(schema.event).values({
      id: 1,
      roundId: 1,
      sourceEventId: 'one-finisher',
      name: 'Race 1',
    });
    await single.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await single.insert(schema.rider).values({ id: 1, displayName: '«ONLY RIDER»' });
    await single.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 1 });
    await single.insert(schema.riderPlate).values({ riderId: 1, seasonId: 1, plate: 'ONLY' });
    await single.insert(schema.individualResult).values({
      eventId: 1,
      plate: 'ONLY',
      displayName: 'ONLY RIDER',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls',
      place: '1',
      status: 'finished',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: 2,
    });

    const rider = await loadRiderSeason(single, {
      seasonId: 1,
      clubId: 1,
      riderId: 1,
      selectedSourceEventId: 'one-finisher',
    });

    expect(rider?.selected?.neighbors).toEqual({
      gapBasis: 'derived-percent-back-percentage-points',
      ahead: [],
      behind: [],
    });
  });

  it('does not mislabel an equal published place as ahead or behind', async () => {
    const ties = await createTestDb();
    await ties.insert(schema.season).values({ id: 1, year: 2039 });
    await ties.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });
    await ties.insert(schema.event).values({
      id: 1,
      roundId: 1,
      sourceEventId: 'tied-place',
      name: 'Race 1',
    });
    await ties.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await ties.insert(schema.rider).values({ id: 1, displayName: '«TIED RIDER»' });
    await ties.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 1 });
    await ties.insert(schema.riderPlate).values({ riderId: 1, seasonId: 1, plate: 'TIED' });
    await ties.insert(schema.individualResult).values([
      {
        eventId: 1,
        plate: 'WINNER',
        displayName: 'WINNER',
        scoringTeam: 'Other School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'TIED',
        displayName: 'TIED RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '2',
        status: 'finished',
        timeRaw: '22:00',
        timeSeconds: '1320',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'OTHER-TIED',
        displayName: 'OTHER TIED RIDER',
        scoringTeam: 'Other School',
        categoryRaw: 'HS2 Girls',
        place: '2',
        status: 'finished',
        timeRaw: '22:00',
        timeSeconds: '1320',
        laps: 2,
      },
    ]);

    const rider = await loadRiderSeason(ties, {
      seasonId: 1,
      clubId: 1,
      riderId: 1,
      selectedSourceEventId: 'tied-place',
    });

    expect(rider?.selected?.neighbors).toEqual({
      gapBasis: 'derived-percent-back-percentage-points',
      ahead: [{ plate: 'WINNER', place: '1', pctBack: 0, gapPctPoints: 10 }],
      behind: [],
    });
  });

  it('rejects a selected Event outside the Season or checkpoint without choosing another result', async () => {
    const selections = await createTestDb();
    await selections.insert(schema.season).values([
      { id: 1, year: 2040 },
      { id: 2, year: 2041 },
    ]);
    await selections.insert(schema.round).values([
      { id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' },
      { id: 2, seasonId: 1, ordinal: 2, name: 'Race 2' },
      { id: 3, seasonId: 2, ordinal: 1, name: 'Race 1' },
    ]);
    await selections.insert(schema.event).values([
      { id: 1, roundId: 1, sourceEventId: 'included', name: 'Race 1' },
      { id: 2, roundId: 2, sourceEventId: 'future', name: 'Race 2' },
      { id: 3, roundId: 3, sourceEventId: 'foreign', name: 'Race 1' },
    ]);
    await selections.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await selections.insert(schema.rider).values({ id: 1, displayName: '«SELECTED RIDER»' });
    await selections.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 1 });
    await selections
      .insert(schema.riderPlate)
      .values({ riderId: 1, seasonId: 1, plate: 'SELECTED' });
    await selections.insert(schema.individualResult).values([
      {
        eventId: 1,
        plate: 'SELECTED',
        displayName: 'SELECTED RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 2,
      },
      {
        eventId: 2,
        plate: 'SELECTED',
        displayName: 'SELECTED RIDER',
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
        plate: 'FOREIGN',
        displayName: 'FOREIGN RIDER',
        scoringTeam: 'Other School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 2,
      },
    ]);

    const input = {
      seasonId: 1,
      clubId: 1,
      riderId: 1,
      checkpoint: { kind: 'through' as const, ordinal: 1 },
    };
    await expect(
      loadRiderSeason(selections, { ...input, selectedSourceEventId: 'future' }),
    ).resolves.toBeNull();
    await expect(
      loadRiderSeason(selections, { ...input, selectedSourceEventId: 'foreign' }),
    ).resolves.toBeNull();
  });

  it('preserves a selected DNF total and status without fabricating comparison neighbors', async () => {
    const dnf = await createTestDb();
    await dnf.insert(schema.season).values({ id: 1, year: 2042 });
    await dnf.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });
    await dnf.insert(schema.event).values({
      id: 1,
      roundId: 1,
      sourceEventId: 'dnf-rider',
      name: 'Race 1',
    });
    await dnf.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await dnf.insert(schema.rider).values({ id: 1, displayName: '«DNF RIDER»' });
    await dnf.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 1 });
    await dnf.insert(schema.riderPlate).values({ riderId: 1, seasonId: 1, plate: 'DNF' });
    await dnf.insert(schema.individualResult).values([
      {
        eventId: 1,
        plate: 'WINNER',
        displayName: 'WINNER',
        scoringTeam: 'Other School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'DNF',
        displayName: 'DNF RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '*',
        status: 'dnf',
        timeRaw: 'DNF',
        timeSeconds: null,
        laps: null,
      },
    ]);

    const rider = await loadRiderSeason(dnf, {
      seasonId: 1,
      clubId: 1,
      riderId: 1,
      selectedSourceEventId: 'dnf-rider',
    });

    expect(rider?.selected).toMatchObject({
      result: { place: '*', status: 'dnf', timeRaw: 'DNF', pctBack: null },
      officialTotal: 'DNF',
      measured: { kind: 'none' },
      neighbors: {
        gapBasis: 'derived-percent-back-percentage-points',
        ahead: [],
        behind: [],
      },
    });
  });

  it('preserves a finished result with no published total as unavailable for comparison', async () => {
    const missingTime = await createTestDb();
    await missingTime.insert(schema.season).values({ id: 1, year: 2043 });
    await missingTime
      .insert(schema.round)
      .values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });
    await missingTime.insert(schema.event).values({
      id: 1,
      roundId: 1,
      sourceEventId: 'missing-total',
      name: 'Race 1',
    });
    await missingTime.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await missingTime.insert(schema.rider).values({ id: 1, displayName: '«UNKNOWN TIME»' });
    await missingTime.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 1 });
    await missingTime
      .insert(schema.riderPlate)
      .values({ riderId: 1, seasonId: 1, plate: 'UNKNOWN' });
    await missingTime.insert(schema.individualResult).values([
      {
        eventId: 1,
        plate: 'WINNER',
        displayName: 'WINNER',
        scoringTeam: 'Other School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'UNKNOWN',
        displayName: 'UNKNOWN TIME',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '2',
        status: 'finished',
        timeRaw: '-',
        timeSeconds: null,
        laps: 2,
      },
    ]);

    const rider = await loadRiderSeason(missingTime, {
      seasonId: 1,
      clubId: 1,
      riderId: 1,
      selectedSourceEventId: 'missing-total',
    });

    expect(rider?.selected).toMatchObject({
      result: { place: '2', status: 'finished', timeRaw: '-', pctBack: null },
      officialTotal: '-',
      measured: { kind: 'none' },
      neighbors: {
        gapBasis: 'derived-percent-back-percentage-points',
        ahead: [],
        behind: [],
      },
    });
  });

  it('distinguishes unavailable, one, and many measured lap values from each official total', async () => {
    const measurements = await createTestDb();
    await measurements.insert(schema.season).values({ id: 1, year: 2044 });
    await measurements.insert(schema.round).values([
      { id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' },
      { id: 2, seasonId: 1, ordinal: 2, name: 'Race 2' },
      { id: 3, seasonId: 1, ordinal: 3, name: 'Race 3' },
      { id: 4, seasonId: 1, ordinal: 4, name: 'Race 4' },
      { id: 5, seasonId: 1, ordinal: 5, name: 'Race 5' },
      { id: 6, seasonId: 1, ordinal: 6, name: 'Race 6' },
    ]);
    await measurements.insert(schema.event).values([
      { id: 1, roundId: 1, sourceEventId: 'no-measurement', name: 'Race 1' },
      { id: 2, roundId: 2, sourceEventId: 'one-measurement', name: 'Race 2' },
      { id: 3, roundId: 3, sourceEventId: 'many-measurements', name: 'Race 3' },
      { id: 4, roundId: 4, sourceEventId: 'unreadable-measurement', name: 'Race 4' },
      { id: 5, roundId: 5, sourceEventId: 'offset-measurements', name: 'Race 5' },
      { id: 6, roundId: 6, sourceEventId: 'one-offset-measurement', name: 'Race 6' },
    ]);
    await measurements.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await measurements.insert(schema.rider).values({ id: 1, displayName: '«MEASURED RIDER»' });
    await measurements.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 1 });
    await measurements
      .insert(schema.riderPlate)
      .values({ riderId: 1, seasonId: 1, plate: 'MEASURED' });
    await measurements.insert(schema.individualResult).values([
      {
        eventId: 1,
        plate: 'MEASURED',
        displayName: 'MEASURED RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 1,
      },
      {
        eventId: 2,
        plate: 'MEASURED',
        displayName: 'MEASURED RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '10:00',
        timeSeconds: '600',
        laps: 1,
        lap1: '10:00',
      },
      {
        eventId: 3,
        plate: 'MEASURED',
        displayName: 'MEASURED RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '21:00',
        timeSeconds: '1260',
        laps: 2,
        lap1: '10:20',
        lap2: '10:40',
      },
      {
        eventId: 4,
        plate: 'MEASURED',
        displayName: 'MEASURED RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 1,
        lap1: 'unreadable',
      },
      {
        eventId: 5,
        plate: 'MEASURED',
        displayName: 'MEASURED RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '20:30',
        timeSeconds: '1230',
        laps: 2,
        lap1: null,
        lap2: '10:00',
        lap3: '10:30',
      },
      {
        eventId: 6,
        plate: 'MEASURED',
        displayName: 'MEASURED RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '10:00',
        timeSeconds: '600',
        laps: 1,
        lap1: null,
        lap2: '10:00',
      },
    ]);

    const rider = await loadRiderSeason(measurements, {
      seasonId: 1,
      clubId: 1,
      riderId: 1,
      checkpoint: { kind: 'through', ordinal: 6 },
    });

    expect(
      rider?.rounds
        .flatMap((round) => round.results)
        .map((result) => ({
          sourceEventId: result.race.sourceEventId,
          officialTotal: result.officialTotal,
          measured: result.measured,
        })),
    ).toEqual([
      { sourceEventId: 'no-measurement', officialTotal: '20:00', measured: { kind: 'none' } },
      {
        sourceEventId: 'one-measurement',
        officialTotal: '10:00',
        measured: { kind: 'one', label: 'Lap 1', value: '10:00', seconds: 600 },
      },
      {
        sourceEventId: 'many-measurements',
        officialTotal: '21:00',
        measured: {
          kind: 'many',
          values: [
            { label: 'Lap 1', value: '10:20', seconds: 620 },
            { label: 'Lap 2', value: '10:40', seconds: 640 },
          ],
        },
      },
      {
        sourceEventId: 'unreadable-measurement',
        officialTotal: '20:00',
        measured: { kind: 'one', label: 'Lap 1', value: 'unreadable', seconds: null },
      },
      {
        sourceEventId: 'offset-measurements',
        officialTotal: '20:30',
        measured: {
          kind: 'many',
          values: [
            { label: 'Lap 2', value: '10:00', seconds: 600 },
            { label: 'Lap 3', value: '10:30', seconds: 630 },
          ],
        },
      },
      {
        sourceEventId: 'one-offset-measurement',
        officialTotal: '10:00',
        measured: { kind: 'one', label: 'Lap 2', value: '10:00', seconds: 600 },
      },
    ]);
  });

  it('returns at most the two nearest valid neighbors on each side', async () => {
    const field = await createTestDb();
    await field.insert(schema.season).values({ id: 1, year: 2045 });
    await field.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });
    await field.insert(schema.event).values({
      id: 1,
      roundId: 1,
      sourceEventId: 'neighbor-cap',
      name: 'Race 1',
    });
    await field.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await field.insert(schema.rider).values({ id: 1, displayName: '«FOCAL RIDER»' });
    await field.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 1 });
    await field.insert(schema.riderPlate).values({ riderId: 1, seasonId: 1, plate: 'FOCAL' });
    await field.insert(schema.individualResult).values([
      {
        eventId: 1,
        plate: 'ONE',
        displayName: 'ONE',
        scoringTeam: 'Other',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '16:40',
        timeSeconds: '1000',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'TWO',
        displayName: 'TWO',
        scoringTeam: 'Other',
        categoryRaw: 'HS2 Girls',
        place: '2',
        status: 'finished',
        timeRaw: '18:20',
        timeSeconds: '1100',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'FOCAL',
        displayName: 'FOCAL',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '3',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'FOUR',
        displayName: 'FOUR',
        scoringTeam: 'Other',
        categoryRaw: 'HS2 Girls',
        place: '4',
        status: 'finished',
        timeRaw: '21:40',
        timeSeconds: '1300',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'FIVE',
        displayName: 'FIVE',
        scoringTeam: 'Other',
        categoryRaw: 'HS2 Girls',
        place: '5',
        status: 'finished',
        timeRaw: '23:20',
        timeSeconds: '1400',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'SIX',
        displayName: 'SIX',
        scoringTeam: 'Other',
        categoryRaw: 'HS2 Girls',
        place: '6',
        status: 'finished',
        timeRaw: '25:00',
        timeSeconds: '1500',
        laps: 2,
      },
    ]);

    const rider = await loadRiderSeason(field, {
      seasonId: 1,
      clubId: 1,
      riderId: 1,
      selectedSourceEventId: 'neighbor-cap',
    });

    expect(rider?.selected?.neighbors).toEqual({
      gapBasis: 'derived-percent-back-percentage-points',
      ahead: [
        { plate: 'TWO', place: '2', pctBack: 10, gapPctPoints: 10 },
        { plate: 'ONE', place: '1', pctBack: 0, gapPctPoints: 20 },
      ],
      behind: [
        { plate: 'FOUR', place: '4', pctBack: 30, gapPctPoints: 10 },
        { plate: 'FIVE', place: '5', pctBack: 40, gapPctPoints: 20 },
      ],
    });
  });
});

describe('loadRaceCategories', () => {
  it('keeps two conference fields separate and highlights each club rider once', async () => {
    const raceDb = await createTestDb();
    await raceDb.insert(schema.season).values({ id: 1, year: 2025 });
    await raceDb.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 1, name: 'Prologue' });
    await raceDb.insert(schema.event).values({
      id: 1,
      roundId: 1,
      sourceEventId: 'combined-prologue',
      name: 'Combined Prologue',
    });
    await raceDb.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await raceDb.insert(schema.squad).values([
      { id: 1, clubId: 1, seasonId: 1, name: 'Cedar' },
      { id: 2, clubId: 1, seasonId: 1, name: 'Summit' },
    ]);
    await raceDb.insert(schema.rider).values([
      { id: 1, displayName: '«CURRENT-A»' },
      { id: 2, displayName: '«CURRENT-B»' },
      { id: 3, displayName: '«CURRENT-C»' },
    ]);
    await raceDb.insert(schema.clubMember).values([
      { clubId: 1, seasonId: 1, riderId: 1 },
      { clubId: 1, seasonId: 1, riderId: 2 },
      { clubId: 1, seasonId: 1, riderId: 3 },
    ]);
    // A is in both Squads, but is one Club rider and one highlighted mark.
    await raceDb.insert(schema.squadMember).values([
      { squadId: 1, riderId: 1 },
      { squadId: 1, riderId: 2 },
      { squadId: 2, riderId: 1 },
      { squadId: 2, riderId: 3 },
    ]);
    await raceDb.insert(schema.riderPlate).values([
      { riderId: 1, seasonId: 1, plate: 'N1' },
      { riderId: 2, seasonId: 1, plate: 'N2' },
      { riderId: 3, seasonId: 1, plate: 'S1' },
    ]);
    await raceDb.insert(schema.individualResult).values([
      {
        eventId: 1,
        plate: 'N1',
        displayName: 'OLD A',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls - North',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'N2',
        displayName: 'OLD B',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls - North',
        place: '2',
        status: 'finished',
        timeRaw: '22:00',
        timeSeconds: '1320',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'N3',
        displayName: 'NORTH OTHER',
        scoringTeam: 'Other School',
        categoryRaw: 'HS2 Girls - North',
        place: '3',
        status: 'finished',
        timeRaw: '24:00',
        timeSeconds: '1440',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'S1',
        displayName: 'OLD C',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls - South',
        place: '1',
        status: 'finished',
        timeRaw: '21:00',
        timeSeconds: '1260',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'S2',
        displayName: 'SOUTH OTHER',
        scoringTeam: 'Other School',
        categoryRaw: 'HS2 Girls - South',
        place: '2',
        status: 'finished',
        timeRaw: '23:06',
        timeSeconds: '1386',
        laps: 2,
      },
    ]);

    const categories = await loadRaceCategories(raceDb, {
      sourceEventId: 'combined-prologue',
      clubId: 1,
    });

    expect(categories).toMatchObject({
      race: {
        eventId: 1,
        sourceEventId: 'combined-prologue',
        name: 'Combined Prologue',
        seasonYear: 2025,
        roundOrdinal: 1,
      },
      categories: [
        {
          key: { eventId: 1, category: 'HS2 Girls', conference: 'North' },
          scope: 'conference',
          fieldSize: 3,
          marks: [
            { place: '1', pct: 0, ours: true, label: '«CURRENT-A»' },
            { place: '2', pct: 10, ours: true, label: '«CURRENT-B»' },
            { place: '3', pct: 20, ours: false },
          ],
          outside: [],
          clubRiders: [
            { riderId: 1, name: '«CURRENT-A»', row: { plate: 'N1', category: 'HS2 Girls' } },
            { riderId: 2, name: '«CURRENT-B»', row: { plate: 'N2', category: 'HS2 Girls' } },
          ],
        },
        {
          key: { eventId: 1, category: 'HS2 Girls', conference: 'South' },
          scope: 'conference',
          fieldSize: 2,
          marks: [
            { place: '1', pct: 0, ours: true, label: '«CURRENT-C»' },
            { place: '2', pct: 10, ours: false },
          ],
          outside: [],
          clubRiders: [
            { riderId: 3, name: '«CURRENT-C»', row: { plate: 'S1', category: 'HS2 Girls' } },
          ],
        },
      ],
    });
    expect(
      categories?.categories
        .flatMap((category) => category.clubRiders)
        .map((rider) => rider.riderId),
    ).toEqual([1, 2, 3]);
  });

  it('keeps a one-finisher field as a source field, without manufacturing a percentile', async () => {
    const single = await createTestDb();
    await single.insert(schema.season).values({ id: 1, year: 2034 });
    await single.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });
    await single.insert(schema.event).values({
      id: 1,
      roundId: 1,
      sourceEventId: 'single-finisher',
      name: 'Race 1',
    });
    await single.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await single.insert(schema.rider).values({ id: 1, displayName: '«ONLY RIDER»' });
    await single.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 1 });
    await single.insert(schema.riderPlate).values({ riderId: 1, seasonId: 1, plate: 'ONLY' });
    await single.insert(schema.individualResult).values({
      eventId: 1,
      plate: 'ONLY',
      displayName: 'ONLY RIDER',
      scoringTeam: 'Test School',
      categoryRaw: 'Varsity Girls',
      place: '1',
      status: 'finished',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: 2,
    });

    const categories = await loadRaceCategories(single, {
      sourceEventId: 'single-finisher',
      clubId: 1,
    });

    expect(categories?.categories).toMatchObject([
      {
        key: { eventId: 1, category: 'Varsity Girls', conference: null },
        scope: 'league',
        fieldSize: 1,
        marks: [{ place: '1', pct: 0, ours: true, label: '«ONLY RIDER»' }],
        outside: [],
        clubRiders: [
          {
            riderId: 1,
            name: '«ONLY RIDER»',
            row: { fieldSize: 1, fieldTopPct: null },
          },
        ],
      },
    ]);
  });

  it('keeps club lap deficits and DNFs explicit outside the percent-back axis', async () => {
    const outside = await createTestDb();
    await outside.insert(schema.season).values({ id: 1, year: 2035 });
    await outside.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });
    await outside.insert(schema.event).values({
      id: 1,
      roundId: 1,
      sourceEventId: 'outside-axis',
      name: 'Race 1',
    });
    await outside.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await outside.insert(schema.rider).values([
      { id: 1, displayName: '«DEFICIT RIDER»' },
      { id: 2, displayName: '«DNF RIDER»' },
    ]);
    await outside.insert(schema.clubMember).values([
      { clubId: 1, seasonId: 1, riderId: 1 },
      { clubId: 1, seasonId: 1, riderId: 2 },
    ]);
    await outside.insert(schema.riderPlate).values([
      { riderId: 1, seasonId: 1, plate: 'DEFICIT' },
      { riderId: 2, seasonId: 1, plate: 'DNF' },
    ]);
    await outside.insert(schema.individualResult).values([
      {
        eventId: 1,
        plate: 'WINNER',
        displayName: 'WINNER',
        scoringTeam: 'Other School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 3,
      },
      {
        eventId: 1,
        plate: 'DEFICIT',
        displayName: 'DEFICIT RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '2',
        status: 'finished',
        timeRaw: '16:40',
        timeSeconds: '1000',
        laps: 2,
      },
      {
        eventId: 1,
        plate: 'DNF',
        displayName: 'DNF RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '*',
        status: 'dnf',
        timeRaw: 'DNF',
        timeSeconds: null,
        laps: null,
      },
    ]);

    const categories = await loadRaceCategories(outside, {
      sourceEventId: 'outside-axis',
      clubId: 1,
    });

    expect(categories?.categories[0]).toMatchObject({
      fieldSize: 3,
      marks: [
        { place: '1', pct: 0, ours: false },
        { place: '2', pct: null, ours: true, label: '«DEFICIT RIDER»' },
        { place: '*', pct: null, ours: true, label: '«DNF RIDER»' },
      ],
      outside: [
        { text: '«DEFICIT RIDER» — 2 of 3 · −1 lap', kind: 'lap-deficit' },
        { text: '«DNF RIDER» — DNF', kind: 'dnf' },
      ],
      clubRiders: [
        { riderId: 1, row: { lapsDown: 1, pctBack: null, status: 'finished', place: '2' } },
        { riderId: 2, row: { lapsDown: null, pctBack: null, status: 'dnf', place: '*' } },
      ],
    });
  });

  it('retains an unknown-lap finish as an unplaced field mark without inventing an outside state', async () => {
    const unknown = await createTestDb();
    await unknown.insert(schema.season).values({ id: 1, year: 2036 });
    await unknown.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });
    await unknown.insert(schema.event).values({
      id: 1,
      roundId: 1,
      sourceEventId: 'unknown-laps',
      name: 'Race 1',
    });
    await unknown.insert(schema.club).values({ id: 1, name: 'Test Club' });
    await unknown.insert(schema.rider).values({ id: 1, displayName: '«UNKNOWN RIDER»' });
    await unknown.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 1 });
    await unknown.insert(schema.riderPlate).values({ riderId: 1, seasonId: 1, plate: 'UNKNOWN' });
    await unknown.insert(schema.individualResult).values([
      {
        eventId: 1,
        plate: 'WINNER',
        displayName: 'WINNER',
        scoringTeam: 'Other School',
        categoryRaw: 'HS2 Girls',
        place: '1',
        status: 'finished',
        timeRaw: '20:00',
        timeSeconds: '1200',
        laps: 3,
      },
      {
        eventId: 1,
        plate: 'UNKNOWN',
        displayName: 'UNKNOWN RIDER',
        scoringTeam: 'Test School',
        categoryRaw: 'HS2 Girls',
        place: '2',
        status: 'finished',
        timeRaw: '25:00',
        timeSeconds: '1500',
        laps: null,
      },
    ]);

    const categories = await loadRaceCategories(unknown, {
      sourceEventId: 'unknown-laps',
      clubId: 1,
    });

    expect(categories?.categories[0]).toMatchObject({
      fieldSize: 2,
      marks: [
        { place: '1', pct: 0, ours: false },
        { place: '2', pct: null, ours: true, label: '«UNKNOWN RIDER»' },
      ],
      outside: [],
      clubRiders: [
        { riderId: 1, row: { place: '2', lapsDown: null, pctBack: null, status: 'finished' } },
      ],
    });
  });
});
