import { afterEach, expect, it } from 'vitest';
import { createTestDb } from './db/testing.ts';
import { schema } from './db/index.ts';
import { loadClubOperations } from './club-operations-query.ts';

let db: Awaited<ReturnType<typeof createTestDb>>;
afterEach(async () => {
  await db?.$client.close();
});

it('returns scoped management choices without exposing account administration to a member', async () => {
  db = await createTestDb();
  await db.insert(schema.users).values({ id: 'member', email: 'member@example.test' });
  const [club] = await db
    .insert(schema.club)
    .values({ name: 'Demo Club', slug: 'demo' })
    .returning();
  const [season] = await db.insert(schema.season).values({ year: 2025 }).returning();
  await db
    .insert(schema.clubMembership)
    .values({ clubId: club!.id, userId: 'member', role: 'member' });
  await db
    .insert(schema.squad)
    .values({ clubId: club!.id, seasonId: season!.id, name: 'Cedar', slug: 'cedar' });
  const result = await loadClubOperations(db, {
    actorId: 'member',
    clubId: club!.id,
    seasonId: season!.id,
  });
  expect(result.squads.map((s) => ({ name: s.name, canManage: s.canManage }))).toEqual([
    { name: 'Cedar', canManage: false },
  ]);
  expect(result.accounts).toEqual([]);
  expect(result.invitations).toEqual([]);
});

it('gives an admin current roster, account and invitation choices scoped to their club and season', async () => {
  db = await createTestDb();
  await db.insert(schema.users).values([
    { id: 'admin', email: 'admin@example.test' },
    { id: 'outside', email: 'outside@example.test' },
  ]);
  const clubs = await db
    .insert(schema.club)
    .values([
      { name: 'Demo A', slug: 'a' },
      { name: 'Demo B', slug: 'b' },
    ])
    .returning();
  const seasons = await db
    .insert(schema.season)
    .values([{ year: 2025 }, { year: 2026 }])
    .returning();
  const clubId = clubs[0]!.id;
  const seasonId = seasons[0]!.id;
  await db.insert(schema.clubMembership).values([
    { clubId, userId: 'admin', role: 'admin' },
    { clubId: clubs[1]!.id, userId: 'outside', role: 'admin' },
  ]);
  const [squad] = await db
    .insert(schema.squad)
    .values({ clubId, seasonId, name: 'Cedar', slug: 'cedar' })
    .returning();
  const [rider] = await db.insert(schema.rider).values({ displayName: 'Demo Rider' }).returning();
  await db.insert(schema.clubMember).values({ clubId, seasonId, riderId: rider!.id });
  await db.insert(schema.squadMember).values({ squadId: squad!.id, riderId: rider!.id });
  await db.insert(schema.squadCoach).values({ squadId: squad!.id, userId: 'admin' });
  await db
    .insert(schema.userSquadPreference)
    .values({ clubId, seasonId, squadId: squad!.id, userId: 'admin' });
  await db.insert(schema.clubInvitation).values({
    clubId,
    emailNormalized: 'invitee@example.test',
    role: 'member',
    tokenHash: 'synthetic-hash',
    expiresAt: new Date('2099-01-01'),
    createdByUserId: 'admin',
  });
  const result = await loadClubOperations(db, { actorId: 'admin', clubId, seasonId });
  expect(result.riders).toEqual([{ id: rider!.id, name: 'Demo Rider' }]);
  expect(result.squads[0]).toMatchObject({
    canManage: true,
    riderIds: [rider!.id],
    accountIds: ['admin'],
  });
  expect(result.preferredSquadId).toBe(squad!.id);
  expect(result.accounts.map((a) => a.email)).toEqual(['admin@example.test']);
  expect(result.invitations.map((i) => ({ email: i.email, status: i.status }))).toEqual([
    { email: 'invitee@example.test', status: 'pending' },
  ]);
  expect(JSON.stringify(result)).not.toContain('synthetic-hash');
});
