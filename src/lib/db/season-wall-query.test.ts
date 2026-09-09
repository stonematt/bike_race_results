import { afterEach, beforeEach, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb, type TestDatabase } from './testing.ts';
import { bootstrapSafeDemo } from '../demo.ts';
import { loadSeasonWallContext, loadSeasonPulseInput } from './season-pulse-query.ts';
let db: TestDatabase;
beforeEach(async () => {
  db = await createTestDb();
  await bootstrapSafeDemo(db);
});
afterEach(async () => {
  await db.$client.close();
});
it('reads club-scoped evidence and excludes an unrelated later source event', async () => {
  await db.execute(
    sql`insert into event(id,round_id,source_event_id,name,conference) values(900,2,'zz-unrelated','Unrelated','South')`,
  );
  await db.execute(
    sql`insert into individual_result(event_id,plate,display_name,scoring_team,category_raw,category_level,conference,place,status,time_raw) values(900,'OTHER','«RIDER-OTHER»','Other Club','HS2 Boys South','HS2 Boys','South','1','finished','1:00')`,
  );
  const wall = await loadSeasonWallContext(db, { seasonId: 2, clubId: 1 });
  expect(wall.clubResults).toHaveLength(5);
  expect(wall.field?.sourceEventId).toBe('demo-2026-round-1');
  expect(wall.field?.finishers).toHaveLength(5);
  expect(wall.field?.clubRiders).toHaveLength(5);
  const empty = await loadSeasonWallContext(db, { seasonId: 999, clubId: 1 });
  expect(empty.clubResults).toEqual([]);
  expect(empty.field).toBeNull();
});

it('keeps published lapped finishers and excludes DNF from the rank denominator', async () => {
  await db.execute(
    sql`update individual_result set status='dnf',place='*' where event_id=2 and plate='D5'`,
  );
  await db.execute(sql`update individual_result set laps=1 where event_id=2 and plate='D4'`);
  const wall = await loadSeasonWallContext(db, { seasonId: 2, clubId: 1 });
  expect(wall.field?.finishers).toHaveLength(4);
  expect(wall.field?.finishers.map((r) => r.place)).toEqual([1, 2, 3, 4]);
  expect(wall.clubResults).toHaveLength(5);
  expect(wall.field?.clubRiders.find((r) => r.place === 4)?.laps).toBe(1);
});
it('uses latest category facts without multiplying riders across squad memberships', async () => {
  await db.execute(sql`insert into squad_member(squad_id,rider_id) values(3,1)`);
  await db.execute(sql`insert into round(id,season_id,ordinal,name) values(900,2,2,'Race 2')`);
  await db.execute(
    sql`insert into event(id,round_id,source_event_id,name,conference) values(900,900,'new-category','Race 2','North')`,
  );
  await db.execute(
    sql`insert into individual_result(event_id,plate,display_name,scoring_team,category_raw,category_level,conference,place,status,time_raw) values(900,'D1','«RIDER-A»','Demo Composite','HS3 Boys North','HS3 Boys','North','1','finished','1:00')`,
  );
  const pulse = await loadSeasonPulseInput(db, { seasonId: 2, clubId: 1 });
  expect(pulse?.riders).toHaveLength(5);
  expect(pulse?.riders.find((r) => r.id === 1)?.category).toBe('HS3 Boys');
  expect(pulse?.results.filter((r) => r.roundOrdinal === 1)).toHaveLength(5);
  expect(await loadSeasonPulseInput(db, { seasonId: 999, clubId: 1 })).toBeNull();
});
