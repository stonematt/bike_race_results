import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from './db/testing.ts';
import { schema } from './db/index.ts';
import {
  createSquad,
  renameSquad,
  archiveSquad,
  setSquadRiders,
  setPreferredSquad,
  setSquadAccounts,
} from './club-operations.ts';
import { listCoachSquads, resolveSquadBySlug } from '../app/[season]/query.ts';

let db: Awaited<ReturnType<typeof createTestDb>>;
let clubId: number;
let seasonId: number;

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(schema.users).values({ id: 'coach-a', email: 'coach.a@example.test' });
  const clubs = await db
    .insert(schema.club)
    .values({ name: 'Demo Club A', slug: 'demo-a' })
    .returning();
  const seasons = await db.insert(schema.season).values({ year: 2025 }).returning();
  const club = clubs[0];
  const season = seasons[0];
  if (!club || !season) throw new Error('Synthetic setup failed');
  clubId = club.id;
  seasonId = season.id;
  await db.insert(schema.clubMembership).values({ clubId, userId: 'coach-a', role: 'coach' });
});

afterEach(async () => {
  await db?.$client.close();
});

describe('guarded squad operations', () => {
  it('lets an active coach create an addressable squad and become its assigned coach', async () => {
    const created = await createSquad(db, { actorId: 'coach-a', clubId, seasonId, name: 'Cedar' });
    expect(await resolveSquadBySlug(db, seasonId, created.slug, clubId)).toEqual({
      id: created.id,
      name: 'Cedar',
      slug: created.slug,
    });
    expect(await listCoachSquads(db, 'coach-a', seasonId, clubId)).toEqual([
      { id: created.id, name: 'Cedar', slug: created.slug },
    ]);
  });
});

it('preserves a squad address when its coach renames it', async () => {
  const created = await createSquad(db, { actorId: 'coach-a', clubId, seasonId, name: 'Cedar' });
  await renameSquad(db, {
    actorId: 'coach-a',
    clubId,
    seasonId,
    squadId: created.id,
    name: 'North',
  });
  expect(await resolveSquadBySlug(db, seasonId, 'cedar', clubId)).toEqual({
    id: created.id,
    name: 'North',
    slug: 'cedar',
  });
});

it('rejects unassigned coaches, members and revoked actors without changing the squad', async () => {
  const created = await createSquad(db, { actorId: 'coach-a', clubId, seasonId, name: 'Cedar' });
  await db.insert(schema.users).values([
    { id: 'other', email: 'other@example.test' },
    { id: 'member', email: 'member@example.test' },
  ]);
  await db.insert(schema.clubMembership).values([
    { clubId, userId: 'other', role: 'coach' },
    { clubId, userId: 'member', role: 'member' },
  ]);
  for (const actorId of ['other', 'member']) {
    await expect(
      renameSquad(db, { actorId, clubId, seasonId, squadId: created.id, name: 'Changed' }),
    ).rejects.toThrow('Active club membership required');
  }
  await db.execute(sql`update club_membership set revoked_at = now() where user_id = 'coach-a'`);
  await expect(
    renameSquad(db, { actorId: 'coach-a', clubId, seasonId, squadId: created.id, name: 'Changed' }),
  ).rejects.toThrow('Active club membership required');
  expect((await resolveSquadBySlug(db, seasonId, 'cedar', clubId))?.name).toBe('Cedar');
});

it('archives a squad without breaking its address and makes later edits read-only', async () => {
  const created = await createSquad(db, { actorId: 'coach-a', clubId, seasonId, name: 'Cedar' });
  await archiveSquad(db, { actorId: 'coach-a', clubId, seasonId, squadId: created.id });
  expect(await resolveSquadBySlug(db, seasonId, 'cedar', clubId)).toEqual({
    id: created.id,
    name: 'Cedar',
    slug: 'cedar',
  });
  await expect(
    renameSquad(db, { actorId: 'coach-a', clubId, seasonId, squadId: created.id, name: 'Changed' }),
  ).rejects.toThrow('Archived squads are read-only');
});

it('edits current squad riders while preserving membership in another squad', async () => {
  const cedar = await createSquad(db, { actorId: 'coach-a', clubId, seasonId, name: 'Cedar' });
  const north = await createSquad(db, { actorId: 'coach-a', clubId, seasonId, name: 'North' });
  const riders = await db
    .insert(schema.rider)
    .values([{ displayName: 'Demo Rider A' }, { displayName: 'Demo Rider B' }])
    .returning();
  const ids = riders.map((r) => r.id);
  await db.insert(schema.clubMember).values(ids.map((riderId) => ({ clubId, seasonId, riderId })));
  await setSquadRiders(db, {
    actorId: 'coach-a',
    clubId,
    seasonId,
    squadId: north.id,
    riderIds: ids,
  });
  await setSquadRiders(db, {
    actorId: 'coach-a',
    clubId,
    seasonId,
    squadId: cedar.id,
    riderIds: [ids[0]!, ids[0]!],
  });
  expect(
    (await db.select().from(schema.squadMember)).map((r) => [r.squadId, r.riderId]).sort(),
  ).toEqual(
    [
      [north.id, ids[0]],
      [north.id, ids[1]],
      [cedar.id, ids[0]],
    ].sort(),
  );
  await setSquadRiders(db, {
    actorId: 'coach-a',
    clubId,
    seasonId,
    squadId: cedar.id,
    riderIds: [],
  });
  expect((await db.select().from(schema.squadMember)).map((r) => r.squadId)).toEqual([
    north.id,
    north.id,
  ]);
});

it('rejects riders outside the squad club and season without removing existing membership', async () => {
  const cedar = await createSquad(db, { actorId: 'coach-a', clubId, seasonId, name: 'Cedar' });
  const riders = await db
    .insert(schema.rider)
    .values([{ displayName: 'Demo Roster Rider' }, { displayName: 'Demo Outside Rider' }])
    .returning();
  const own = riders[0]!.id;
  const outside = riders[1]!.id;
  await db.insert(schema.clubMember).values({ clubId, seasonId, riderId: own });
  await setSquadRiders(db, {
    actorId: 'coach-a',
    clubId,
    seasonId,
    squadId: cedar.id,
    riderIds: [own],
  });
  await expect(
    setSquadRiders(db, {
      actorId: 'coach-a',
      clubId,
      seasonId,
      squadId: cedar.id,
      riderIds: [outside],
    }),
  ).rejects.toThrow('season roster');
  expect(await db.select().from(schema.squadMember)).toEqual([{ squadId: cedar.id, riderId: own }]);
});

it('stores a member’s navigation preference without granting a squad assignment and clears it on archive', async () => {
  const cedar = await createSquad(db, { actorId: 'coach-a', clubId, seasonId, name: 'Cedar' });
  await db.insert(schema.users).values({ id: 'member', email: 'member@example.test' });
  await db.insert(schema.clubMembership).values({ clubId, userId: 'member', role: 'member' });
  await setPreferredSquad(db, { actorId: 'member', clubId, seasonId, squadId: cedar.id });
  expect(
    (await db.select().from(schema.userSquadPreference)).map((r) => ({
      userId: r.userId,
      squadId: r.squadId,
    })),
  ).toEqual([{ userId: 'member', squadId: cedar.id }]);
  expect(await listCoachSquads(db, 'member', seasonId, clubId)).toEqual([]);
  await archiveSquad(db, { actorId: 'coach-a', clubId, seasonId, squadId: cedar.id });
  expect(await db.select().from(schema.userSquadPreference)).toEqual([]);
  await expect(
    setPreferredSquad(db, { actorId: 'member', clubId, seasonId, squadId: cedar.id }),
  ).rejects.toThrow('Choose an active squad');
});

it('lets only an admin assign active club accounts without changing their role', async () => {
  const cedar = await createSquad(db, { actorId: 'coach-a', clubId, seasonId, name: 'Cedar' });
  await db.insert(schema.users).values([
    { id: 'admin', email: 'admin@example.test' },
    { id: 'member', email: 'member@example.test' },
  ]);
  await db.insert(schema.clubMembership).values([
    { clubId, userId: 'admin', role: 'admin' },
    { clubId, userId: 'member', role: 'member' },
  ]);
  await expect(
    setSquadAccounts(db, {
      actorId: 'coach-a',
      clubId,
      seasonId,
      squadId: cedar.id,
      userIds: ['member'],
    }),
  ).rejects.toThrow('Active club membership required');
  await setSquadAccounts(db, {
    actorId: 'admin',
    clubId,
    seasonId,
    squadId: cedar.id,
    userIds: ['member'],
  });
  expect(await listCoachSquads(db, 'member', seasonId, clubId)).toEqual([
    { id: cedar.id, name: 'Cedar', slug: 'cedar' },
  ]);
  await expect(
    renameSquad(db, { actorId: 'member', clubId, seasonId, squadId: cedar.id, name: 'Changed' }),
  ).rejects.toThrow('Active club membership required');
  await expect(
    setSquadAccounts(db, {
      actorId: 'admin',
      clubId,
      seasonId,
      squadId: cedar.id,
      userIds: ['unknown'],
    }),
  ).rejects.toThrow('active club accounts');
  expect(await listCoachSquads(db, 'member', seasonId, clubId)).toHaveLength(1);
});

it('rejects forged club and season choices and leaves the saved preference intact', async () => {
  const cedar = await createSquad(db, { actorId: 'coach-a', clubId, seasonId, name: 'Cedar' });
  await setPreferredSquad(db, { actorId: 'coach-a', clubId, seasonId, squadId: cedar.id });
  const [otherClub] = await db
    .insert(schema.club)
    .values({ name: 'Demo Other', slug: 'other' })
    .returning();
  const [otherSeason] = await db.insert(schema.season).values({ year: 2026 }).returning();
  const [foreign] = await db
    .insert(schema.squad)
    .values({ clubId: otherClub!.id, seasonId, name: 'Other', slug: 'other' })
    .returning();
  await expect(
    renameSquad(db, {
      actorId: 'coach-a',
      clubId,
      seasonId,
      squadId: foreign!.id,
      name: 'Changed',
    }),
  ).rejects.toThrow('Active club membership required');
  await expect(
    createSquad(db, { actorId: 'coach-a', clubId: otherClub!.id, seasonId, name: 'Forged' }),
  ).rejects.toThrow('Active club membership required');
  await expect(
    setPreferredSquad(db, { actorId: 'coach-a', clubId, seasonId, squadId: foreign!.id }),
  ).rejects.toThrow('Choose an active squad');
  await expect(
    setPreferredSquad(db, {
      actorId: 'coach-a',
      clubId,
      seasonId: otherSeason!.id,
      squadId: cedar.id,
    }),
  ).rejects.toThrow('Choose an active squad');
  expect((await db.select().from(schema.userSquadPreference)).map((r) => r.squadId)).toEqual([
    cedar.id,
  ]);
  await setPreferredSquad(db, { actorId: 'coach-a', clubId, seasonId, squadId: null });
  expect(await db.select().from(schema.userSquadPreference)).toEqual([]);
});

it('lets the admin manage an unassigned legacy squad and rejects reuse of an archived address', async () => {
  await db.insert(schema.users).values({ id: 'admin', email: 'admin@example.test' });
  await db.insert(schema.clubMembership).values({ clubId, userId: 'admin', role: 'admin' });
  const [legacy] = await db
    .insert(schema.squad)
    .values({ clubId, seasonId, name: 'Cedar', slug: 'cedar' })
    .returning();
  await renameSquad(db, { actorId: 'admin', clubId, seasonId, squadId: legacy!.id, name: 'North' });
  await archiveSquad(db, { actorId: 'admin', clubId, seasonId, squadId: legacy!.id });
  await expect(
    createSquad(db, { actorId: 'coach-a', clubId, seasonId, name: 'Cedar' }),
  ).rejects.toThrow();
  expect(await resolveSquadBySlug(db, seasonId, 'cedar', clubId)).toEqual({
    id: legacy!.id,
    name: 'North',
    slug: 'cedar',
  });
});

it('rejects an otherwise manageable squad submitted from another displayed season', async () => {
  const cedar = await createSquad(db, { actorId: 'coach-a', clubId, seasonId, name: 'Cedar' });
  const [otherSeason] = await db.insert(schema.season).values({ year: 2026 }).returning();
  await expect(
    renameSquad(db, {
      actorId: 'coach-a',
      clubId,
      seasonId: otherSeason!.id,
      squadId: cedar.id,
      name: 'Changed',
    }),
  ).rejects.toThrow('Active club membership required');
  expect((await resolveSquadBySlug(db, seasonId, 'cedar', clubId))?.name).toBe('Cedar');
});
