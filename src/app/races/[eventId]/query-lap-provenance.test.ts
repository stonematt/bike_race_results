/**
 * Lap provenance through the public race-detail query.
 *
 * No lap columns is the time-trial source shape, so its whole field has one
 * comparable clock. That is different from a missing lap count inside a
 * lap-publishing event: that individual row cannot be compared safely.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../../lib/db/schema.ts';
import { createTestDb, type TestDatabase } from '../../../lib/db/testing.ts';
import { loadRaceDetail } from './query.ts';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDb();

  await db.insert(schema.season).values({ id: 1, year: 2025 });
  await db.insert(schema.round).values([
    { id: 1, seasonId: 1, ordinal: 1, name: 'Prologue' },
    { id: 2, seasonId: 1, ordinal: 2, name: 'Race 2' },
    { id: 3, seasonId: 1, ordinal: 3, name: 'Race 3' },
    { id: 4, seasonId: 1, ordinal: 4, name: 'Race 4' },
  ]);
  await db.insert(schema.event).values([
    { id: 1, roundId: 1, sourceEventId: 'time-trial', name: 'Prologue' },
    { id: 2, roundId: 2, sourceEventId: 'mass-start', conference: 'North', name: 'Race 2' },
    { id: 3, roundId: 3, sourceEventId: 'count-only', conference: 'North', name: 'Race 3' },
    { id: 4, roundId: 4, sourceEventId: 'unknown-layout', conference: 'North', name: 'Race 4' },
    { id: 5, roundId: 4, sourceEventId: 'hidden-copy', conference: 'North', name: 'Race 4' },
  ]);
  await db.insert(schema.club).values({ id: 1, name: 'Test Club' });
  await db.insert(schema.squad).values({ id: 1, clubId: 1, seasonId: 1, name: 'JV' });
  await db.insert(schema.rider).values([
    { id: 1, displayName: '«RIDER-TT»' },
    { id: 2, displayName: '«RIDER-UNKNOWN»' },
    { id: 3, displayName: '«RIDER-COUNT»' },
    { id: 4, displayName: '«RIDER-LAYOUT»' },
  ]);
  await db.insert(schema.riderPlate).values([
    { riderId: 1, seasonId: 1, plate: 'tt-2' },
    { riderId: 1, seasonId: 1, plate: 'count-1' },
    { riderId: 2, seasonId: 1, plate: 'mass-2' },
    { riderId: 3, seasonId: 1, plate: 'count-2' },
    { riderId: 4, seasonId: 1, plate: 'unknown-layout-2' },
    { riderId: 4, seasonId: 1, plate: 'hidden-copy-2' },
  ]);
  await db.insert(schema.squadMember).values([
    { squadId: 1, riderId: 1 },
    { squadId: 1, riderId: 2 },
    { squadId: 1, riderId: 3 },
    { squadId: 1, riderId: 4 },
  ]);
  const [timeTrialSource] = await db
    .insert(schema.rawFetch)
    .values({
      season: 2025,
      eventId: 'time-trial',
      listId: 'tt-results',
      listName: 'Time Trial Results',
      url: 'synthetic://time-trial',
      httpStatus: 200,
      payload: { DataFields: ['RankOrStatusTT', 'Start.TOD', 'End.TOD'] },
      contentHash: 'synthetic-time-trial-layout',
    })
    .returning({ id: schema.rawFetch.id });
  await db.insert(schema.eventResultSource).values({
    eventId: 1,
    rawFetchId: timeTrialSource!.id,
    listId: 'tt-results',
    hidden: false,
  });
  const [selectedMassSource] = await db
    .insert(schema.rawFetch)
    .values({
      season: 2025,
      eventId: 'hidden-copy',
      listId: 'mass-results',
      listName: 'Mass Start Results',
      url: 'synthetic://selected-mass-start',
      httpStatus: 200,
      payload: { DataFields: ['NumberOfLaps', 'Lap1'] },
      contentHash: 'synthetic-selected-mass-layout',
    })
    .returning({ id: schema.rawFetch.id });
  await db.insert(schema.rawFetch).values({
    season: 2025,
    eventId: 'hidden-copy',
    listId: 'hidden-tt',
    listName: 'Time Trial Copy',
    url: 'synthetic://hidden-time-trial',
    httpStatus: 200,
    payload: { DataFields: ['RankOrStatusTT', 'Start.TOD', 'End.TOD'] },
    contentHash: 'synthetic-hidden-time-trial-layout',
  });
  await db.insert(schema.eventResultSource).values({
    eventId: 5,
    rawFetchId: selectedMassSource!.id,
    listId: 'mass-results',
    hidden: false,
  });

  await db.insert(schema.individualResult).values([
    // The source published no lap fields for this event. Its clocks are still
    // one comparable time-trial contest, so 1100 / 1000 - 1 is 10%.
    {
      eventId: 1,
      plate: 'tt-1',
      displayName: 'TT WINNER',
      scoringTeam: 'Other School',
      categoryRaw: 'HS2 Girls - North',
      place: '1',
      status: 'finished',
      timeRaw: '16:40',
      timeSeconds: '1000',
      laps: null,
      lap1: null,
      lap2: null,
      lap3: null,
      lap4: null,
    },
    {
      eventId: 1,
      plate: 'tt-2',
      displayName: 'TT RIDER',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls - North',
      place: '2',
      status: 'finished',
      timeRaw: '18:20',
      timeSeconds: '1100',
      laps: null,
      lap1: null,
      lap2: null,
      lap3: null,
      lap4: null,
    },
    {
      eventId: 1,
      plate: 'tt-dnf',
      displayName: 'TT DNF',
      scoringTeam: 'Other School',
      categoryRaw: 'HS2 Girls - North',
      place: 'DNF',
      status: 'dnf',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: null,
      lap1: null,
      lap2: null,
      lap3: null,
      lap4: null,
    },
    // This event does publish lap fields. Its unknown row cannot be promoted
    // to a full-distance finisher simply because the time is present.
    {
      eventId: 2,
      plate: 'mass-1',
      displayName: 'MASS WINNER',
      scoringTeam: 'Other School',
      categoryRaw: 'HS2 Girls - North',
      place: '1',
      status: 'finished',
      timeRaw: '16:40',
      timeSeconds: '1000',
      laps: 3,
      lap1: '5:30',
      lap2: '5:30',
      lap3: '5:40',
      lap4: null,
    },
    {
      eventId: 2,
      plate: 'mass-2',
      displayName: 'UNKNOWN RIDER',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls - North',
      place: '2',
      status: 'finished',
      timeRaw: '18:20',
      timeSeconds: '1100',
      laps: null,
      lap1: null,
      lap2: null,
      lap3: null,
      lap4: null,
    },
    // NumberOfLaps alone establishes the mass-start provenance. The short
    // rider's faster clock must not become the winner without split strings.
    {
      eventId: 3,
      plate: 'count-1',
      displayName: 'COUNT WINNER',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls - North',
      place: '1',
      status: 'finished',
      timeRaw: '16:40',
      timeSeconds: '1000',
      laps: 3,
      lap1: null,
      lap2: null,
      lap3: null,
      lap4: null,
    },
    {
      eventId: 3,
      plate: 'count-2',
      displayName: 'COUNT SHORT',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls - North',
      place: '2',
      status: 'finished',
      timeRaw: '15:00',
      timeSeconds: '900',
      laps: 2,
      lap1: null,
      lap2: null,
      lap3: null,
      lap4: null,
    },
    // The normalized values alone prove no source layout. This might be an
    // unrecorded lap-bearing list whose cells were blank, so it must not gain
    // the time-trial exception without the archived time-trial signature.
    {
      eventId: 4,
      plate: 'unknown-layout-1',
      displayName: 'LAYOUT WINNER',
      scoringTeam: 'Other School',
      categoryRaw: 'HS2 Girls - North',
      place: '1',
      status: 'finished',
      timeRaw: '16:40',
      timeSeconds: '1000',
      laps: null,
      lap1: null,
      lap2: null,
      lap3: null,
      lap4: null,
    },
    // The selected visible source has lap columns. A hidden archived TT copy
    // must never turn this unknown row into a comparable time-trial finish.
    {
      eventId: 5,
      plate: 'hidden-copy-1',
      displayName: 'HIDDEN COPY WINNER',
      scoringTeam: 'Other School',
      categoryRaw: 'HS2 Girls - North',
      place: '1',
      status: 'finished',
      timeRaw: '16:40',
      timeSeconds: '1000',
      laps: null,
      lap1: null,
      lap2: null,
      lap3: null,
      lap4: null,
    },
    {
      eventId: 5,
      plate: 'hidden-copy-2',
      displayName: 'HIDDEN COPY UNKNOWN',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls - North',
      place: '2',
      status: 'finished',
      timeRaw: '18:20',
      timeSeconds: '1100',
      laps: null,
      lap1: null,
      lap2: null,
      lap3: null,
      lap4: null,
    },
    {
      eventId: 4,
      plate: 'unknown-layout-2',
      displayName: 'LAYOUT RIDER',
      scoringTeam: 'Test School',
      categoryRaw: 'HS2 Girls - North',
      place: '2',
      status: 'finished',
      timeRaw: '18:20',
      timeSeconds: '1100',
      laps: null,
      lap1: null,
      lap2: null,
      lap3: null,
      lap4: null,
    },
  ]);
});

describe('lap provenance', () => {
  it('uses the time-trial winner for a finisher when the event published no lap columns', async () => {
    const detail = await loadRaceDetail(db, 'time-trial', null);
    const rider = detail!.squads[0]!.riders.find((entry) => entry.card.plate === 'tt-2')!;

    expect(rider.card.headline).toEqual({ kind: 'pct-back', value: '10%', caption: 'back' });
    expect(rider.field.map((mark) => mark.pct)).toEqual([0, 10, null]);
  });

  it('withholds percent back for an unknown lap count in a lap-publishing event', async () => {
    const detail = await loadRaceDetail(db, 'mass-start', null);
    const rider = detail!.squads[0]!.riders.find((entry) => entry.card.plate === 'mass-2')!;

    expect(rider.card.headline).toEqual({ kind: 'place', value: '2', caption: 'of 2' });
    expect(rider.field.map((mark) => mark.pct)).toEqual([0, null]);
  });

  it('keeps an explicit short-lap clock out of the winner calculation without split strings', async () => {
    const detail = await loadRaceDetail(db, 'count-only', null);
    const winner = detail!.squads[0]!.riders.find((entry) => entry.card.plate === 'count-1')!;
    const short = detail!.squads[0]!.riders.find((entry) => entry.card.plate === 'count-2')!;

    expect(winner.card.headline).toEqual({ kind: 'pct-back', value: '0%', caption: 'back' });
    expect(short.card.headline).toEqual({
      kind: 'place-deficit',
      value: '2',
      caption: 'of 2 · −1 lap',
    });
    expect(short.field.map((mark) => mark.pct)).toEqual([0, null]);
  });

  it('withholds percent back when no archived source layout establishes a time trial', async () => {
    const detail = await loadRaceDetail(db, 'unknown-layout', null);
    const rider = detail!.squads[0]!.riders.find(
      (entry) => entry.card.plate === 'unknown-layout-2',
    )!;

    expect(rider.card.headline).toEqual({ kind: 'place', value: '2', caption: 'of 2' });
    expect(rider.field.map((mark) => mark.pct)).toEqual([null, null]);
  });

  it('uses the selected source rather than a hidden archived time-trial copy', async () => {
    const detail = await loadRaceDetail(db, 'hidden-copy', null);
    const rider = detail!.squads[0]!.riders.find((entry) => entry.card.plate === 'hidden-copy-2')!;

    expect(rider.card.headline).toEqual({ kind: 'place', value: '2', caption: 'of 2' });
    expect(rider.field.map((mark) => mark.pct)).toEqual([null, null]);
  });

  it('does not reinterpret normalized results when a later raw archive arrives', async () => {
    await db.insert(schema.rawFetch).values({
      season: 2025,
      eventId: 'time-trial',
      listId: 'tt-results',
      listName: 'Corrected Mass Start Layout',
      url: 'synthetic://later-archive-only',
      httpStatus: 200,
      payload: { DataFields: ['NumberOfLaps', 'Lap1'] },
      contentHash: 'synthetic-later-archive-only',
    });

    const detail = await loadRaceDetail(db, 'time-trial', null);
    const rider = detail!.squads[0]!.riders.find((entry) => entry.card.plate === 'tt-2')!;
    expect(rider.card.headline).toEqual({ kind: 'pct-back', value: '10%', caption: 'back' });
  });
});
