/**
 * Decoding the archive into a native PostgreSQL database.
 *
 * `bin/normalize.ts` is the only way results reach a hosted database: the
 * archive is filled on a laptop and decoded into whatever `DATABASE_URL` names.
 * Decoding writes one event per transaction and upserts inside it, so this is
 * the path where a driver difference would show up as half a race.
 *
 * The payloads here are the synthetic ones from `normalize.test.ts`, never the
 * corpus — this suite runs in public CI, where the real corpus must never be.
 *
 * Skips itself when no disposable cluster is offered.
 */

import { describe, expect, it } from 'vitest';
import * as schema from '../db/schema.ts';
import { postgresTracerUrl, withIsolatedPostgres } from '../db/testing.ts';
import { archive, CONFIG_LIST_NAME } from './raw.ts';
import { normalize } from './normalize.ts';

const PLACE_2025 =
  'if(if([TransgenderOption]="Redundancy";[RANK5];[RANK1])>0;if([STATUS]<2;if([TransgenderOption]="Redundancy";[RANK5];[RANK1]);[TimeOrStatus]);"*")';
const NAME_2025 = 'ucase([DisplayName]) & iif([RANK2]=1 AND [ShowPoints]=1;" (PTS LEADER)";"")';

const FLAT_FIELDS = [
  'BIB',
  'ID',
  PLACE_2025,
  NAME_2025,
  'CLUB',
  'DisplayPoints',
  'DisplayLapTime(1)',
  'TimeOrStatus',
];

const row = (plate: string, place: string) => [
  plate,
  '1',
  place,
  `«RIDER-${plate}»`,
  'Salem Composite',
  '500',
  '19:27',
  '39:37.12',
];

const configRecord = (eventId: string, payload: unknown) => ({
  season: 2025,
  eventId,
  listId: null,
  listName: CONFIG_LIST_NAME,
  url: 'https://example.invalid/config',
  httpStatus: 200,
  payload,
});

const listRecord = (eventId: string, listId: string, payload: unknown) => ({
  season: 2025,
  eventId,
  listId,
  listName: `list ${listId}`,
  url: 'https://example.invalid/list',
  httpStatus: 200,
  payload,
});

const config = (lists: { ID: string; Name: string }[]) => ({
  key: 'k',
  eventname: 'Race 2 - ORLeague Moore Fun - North',
  lists: lists.map((list) => ({ Mode: '', ...list })),
});

const listPayload = (dataFields: string[], data: unknown) => ({
  list: { ListName: 'x', ListFooterText: '', Fields: [] },
  DataFields: dataFields,
  data,
});

const ONE_EVENT = [
  configRecord('359478', config([{ ID: 'AAA111', Name: 'flat' }])),
  listRecord(
    '359478',
    'AAA111',
    listPayload(FLAT_FIELDS, { '#1_HS1 Boys - North': [row('101', '1'), row('102', '2')] }),
  ),
];

describe.skipIf(!postgresTracerUrl)('decoding into a native PostgreSQL database', () => {
  it('archives and decodes one synthetic event', async () => {
    await withIsolatedPostgres(async (runtime) => {
      await archive(runtime.db, ONE_EVENT);
      const result = await normalize(runtime.db);

      expect(result).toMatchObject({
        events: 1,
        lists: 1,
        decodedLists: 1,
        skipped: 0,
        rows: { individual_result: 2 },
      });
      expect(await runtime.db.select().from(schema.event)).toHaveLength(1);
      expect(await runtime.db.select().from(schema.individualResult)).toHaveLength(2);
    });
  });

  it('decodes the same archive twice without duplicating the event or its results', async () => {
    await withIsolatedPostgres(async (runtime) => {
      await archive(runtime.db, ONE_EVENT);
      await normalize(runtime.db);
      const second = await normalize(runtime.db);

      expect(second).toMatchObject({ events: 1, decodedLists: 1, skipped: 0 });
      expect(await runtime.db.select().from(schema.event)).toHaveLength(1);
      expect(await runtime.db.select().from(schema.individualResult)).toHaveLength(2);
    });
  });
});
