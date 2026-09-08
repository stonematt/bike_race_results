/**
 * Absent and zero are different facts about a lap count.
 *
 * A time trial publishes no lap columns at all. Counting non-empty splits to
 * recover a lap count — which is right for a mass-start race — turns that
 * absence into `0`. The source shape still establishes a time trial: its
 * finishers share one comparable clock, while `laps` remains unknown because
 * the source never said how to count distance.
 *
 * So this suite pins the distinction from both sides: a list with no lap
 * columns yields `laps = null` and a comparable percentage, while a list that
 * does publish splits recovers exactly the count it always did — including a
 * legitimate zero and an individually unknown row.
 *
 * Separate from `views.test.ts` because these need several events in one
 * database and that suite counts rows across the whole view.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from './schema.ts';
import { createTestDb, type TestDatabase } from './testing.ts';

let db: TestDatabase;

/** The prologue's shape: a time trial, no `laps`, no lap-split columns, ever. */
const TIME_TRIAL = [
  ['501', '1', 1080.5],
  ['502', '2', 1102.3],
  ['503', '3', 1150.0],
  ['504', '4', 1188.7],
  ['505', '5', 1204.1],
  ['506', '6', 1260.9],
  ['507', '7', 1301.4],
  ['508', '8', 1355.2],
  ['509', '9', 1402.8],
  ['510', '10', 1499.6],
  ['511', '11', 2940.7], // 172% back from the time-trial winner
  ['512', 'DNF', null], // the time trial marks a DNF in place, not in time
] as const;

/**
 * A mass-start list that publishes splits but no lap-count column — the shape
 * the view's split-counting fallback exists for. `laps` is left null on
 * purpose; the fallback has to recover it.
 *
 * (plate, place, time_seconds, lap1, lap2, lap3, status)
 */
const MASS_START = [
  ['601', '1', 3000.0, '20:00', '20:00', '20:00', 'finished'], // 3 laps, the winner
  ['602', '2', 3300.0, '22:00', '22:00', '22:00', 'finished'], // 3 laps, 10% back
  ['603', '3', 2900.0, '24:10', '24:10', '-', 'finished'], // 2 laps: faster clock, lapped
  ['604', '4', 1500.0, '25:00', '-', '-', 'finished'], // 1 lap
  ['605', '*', null, '-', '-', '-', 'dnf'], // zero laps, and a real zero
] as const;

beforeAll(async () => {
  db = await createTestDb();

  await db.insert(schema.season).values({ id: 1, year: 2025 });
  await db.insert(schema.round).values([
    { id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' },
    { id: 2, seasonId: 1, ordinal: 2, name: 'Race 2' },
  ]);
  await db.insert(schema.event).values([
    { id: 1, roundId: 1, sourceEventId: '357242', conference: null, name: 'Race 1 - Prologue' },
    { id: 2, roundId: 2, sourceEventId: '359477', conference: 'North', name: 'Race 2 - North' },
  ]);
  const [timeTrialSource] = await db
    .insert(schema.rawFetch)
    .values({
      season: 2025,
      eventId: '357242',
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

  await db.insert(schema.individualResult).values([
    ...TIME_TRIAL.map(([plate, place, seconds]) => ({
      eventId: 1,
      plate,
      displayName: `RIDER ${plate}`,
      scoringTeam: 'Some Team',
      categoryRaw: 'MS 6 Boys',
      place,
      status: place === 'DNF' ? 'dnf' : 'finished',
      timeRaw: seconds === null ? 'DNF' : String(seconds),
      timeSeconds: seconds === null ? null : String(seconds),
      // No lap count and no splits. This is the whole point of the fixture.
      laps: null,
      lap1: null,
      lap2: null,
      lap3: null,
      lap4: null,
    })),
    ...MASS_START.map(([plate, place, seconds, lap1, lap2, lap3, status]) => ({
      eventId: 2,
      plate,
      displayName: `RIDER ${plate}`,
      scoringTeam: 'Some Team',
      categoryRaw: 'HS1 Boys - North',
      place,
      status,
      timeRaw: seconds === null ? 'DNF' : String(seconds),
      timeSeconds: seconds === null ? null : String(seconds),
      laps: null,
      lap1,
      lap2,
      lap3,
      lap4: null,
    })),
  ]);
  await db.insert(schema.individualResult).values({
    // This is a blank row inside a lap-publishing event, not a list without
    // lap columns. No `-` sentinel or split establishes an honest count.
    eventId: 2,
    plate: '606',
    displayName: 'RIDER 606',
    scoringTeam: 'Some Team',
    categoryRaw: 'HS1 Boys - North',
    place: '6',
    status: 'finished',
    timeRaw: '3600',
    timeSeconds: '3600',
    laps: null,
    lap1: null,
    lap2: null,
    lap3: null,
    lap4: null,
  });
});

async function rows(eventId: number) {
  const result = await db.execute(
    `select plate, place, laps, category_laps, is_lapped, laps_down, pct_back, field_size,
            field_top_pct
       from v_race_result where event_id = ${eventId}`,
  );
  return result.rows as Record<string, unknown>[];
}

const byPlate = async (eventId: number, plate: string) =>
  (await rows(eventId)).find((r) => r.plate === plate)!;

describe('a list that publishes no lap columns', () => {
  it('leaves the lap count null rather than calling it zero', async () => {
    const all = await rows(1);
    expect(all).toHaveLength(TIME_TRIAL.length);
    expect(all.every((r) => r.laps === null)).toBe(true);
    expect(all.every((r) => r.category_laps === null)).toBe(true);
  });

  it('uses its winner’s clock for each finisher, while DNF remains null', async () => {
    expect(Number((await byPlate(1, '501')).pct_back)).toBe(0);
    expect(Number((await byPlate(1, '502')).pct_back)).toBeCloseTo(2, 1);
    expect(Number((await byPlate(1, '511')).pct_back)).toBeCloseTo(172.2, 1);
    expect((await byPlate(1, '512')).pct_back).toBeNull();
  });

  it('calls nobody lapped, and says so as false rather than as unknown', async () => {
    // A null boolean reads as false in most render paths and as a bug in the
    // rest. A time trial has no lapping, which is a fact, not an unknown.
    const all = await rows(1);
    expect(all.every((r) => r.is_lapped === false)).toBe(true);
    expect(all.every((r) => r.laps_down === null)).toBe(true);
  });

  it('still ranks the field — a percentile needs places, not laps', async () => {
    const tenth = await byPlate(1, '510');
    expect(Number(tenth.field_size)).toBe(12);
    expect(Number(tenth.field_top_pct)).toBe(83);
  });
});

describe('a list that publishes splits but no lap count', () => {
  it('recovers the lap count by counting non-empty splits', async () => {
    expect(Number((await byPlate(2, '601')).laps)).toBe(3);
    expect(Number((await byPlate(2, '603')).laps)).toBe(2);
    expect(Number((await byPlate(2, '604')).laps)).toBe(1);
  });

  it('keeps a genuine zero at zero — a rider who completed no lap', async () => {
    // The `-` splits are published emptiness, not an absent column, and zero is
    // the honest reading of them.
    expect(Number((await byPlate(2, '605')).laps)).toBe(0);
  });

  it('leaves a blank row unknown when the event publishes lap columns', async () => {
    const unknown = await byPlate(2, '606');
    expect(unknown.laps).toBeNull();
    expect(unknown.laps_down).toBeNull();
    expect(unknown.pct_back).toBeNull();
  });

  it('still refuses a percentage to a lapped rider with a faster clock', async () => {
    const lapped = await byPlate(2, '603');
    expect(lapped.is_lapped).toBe(true);
    expect(Number(lapped.laps_down)).toBe(1);
    expect(lapped.pct_back).toBeNull();
  });

  it('still computes percent back among the full-lap riders', async () => {
    expect(Number((await byPlate(2, '601')).pct_back)).toBe(0);
    expect(Number((await byPlate(2, '602')).pct_back)).toBeCloseTo(10, 1);
  });

  it('scopes the leading lap count to its own event', async () => {
    // The time trial's null laps must not travel: `category_laps` is a window
    // over one event and category, and a leak either way ruins both.
    expect(Number((await byPlate(2, '601')).category_laps)).toBe(3);
  });
});
