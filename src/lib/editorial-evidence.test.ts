import { eq } from 'drizzle-orm';
import { beforeEach, expect, it } from 'vitest';
import * as schema from './db/schema.ts';
import { createTestDb, type TestDatabase } from './db/testing.ts';
import { loadStoryCandidate } from './editorial-evidence.ts';

const input = { actorId: 'reader', clubId: 1, seasonId: 1, checkpointOrdinal: 2, eventId: 1 };
const payload = {
  list: { Fields: [], ListFooterText: '2 finishers' },
  DataFields: [
    'BIB',
    'ID',
    'RankOrStatusTT',
    'FIRSTNAME',
    'LASTNAME',
    'CLUB',
    'Start.TOD',
    'End.TOD',
    'TIME',
  ],
  data: {
    '#1_HS1 Boys - North': [
      ['A', '1', '1', 'RIDER', 'A', 'Test School', '', '', '20:00'],
      ['B', '2', 'DNF', 'RIDER', 'B', 'Test School', '', '', '21:00'],
    ],
  },
};
let db: TestDatabase;
beforeEach(async () => {
  db = await createTestDb();
  await db.insert(schema.season).values({ id: 1, year: 2025 });
  await db.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 2, name: 'Race 2' });
  await db.insert(schema.event).values({
    id: 1,
    roundId: 1,
    sourceEventId: 'test-north',
    name: 'Forest Loop',
    conference: 'North',
  });
  await db.insert(schema.club).values({ id: 1, name: 'Test Club' });
  await db.insert(schema.users).values({ id: 'reader', email: 'reader@example.invalid' });
  await db.insert(schema.clubMembership).values({ clubId: 1, userId: 'reader', role: 'member' });
  await db.insert(schema.rider).values([
    { id: 1, displayName: '«RIDER-A»' },
    { id: 2, displayName: '«RIDER-B»' },
  ]);
  await db.insert(schema.clubMember).values([
    { clubId: 1, seasonId: 1, riderId: 1 },
    { clubId: 1, seasonId: 1, riderId: 2 },
  ]);
  await db.insert(schema.riderPlate).values([
    { riderId: 1, seasonId: 1, plate: 'A' },
    { riderId: 2, seasonId: 1, plate: 'B' },
  ]);
  await db.insert(schema.individualResult).values([
    {
      eventId: 1,
      plate: 'A',
      displayName: 'RIDER A',
      scoringTeam: 'Test School',
      categoryRaw: 'HS1 Boys - North',
      place: '1',
      status: 'finished',
      timeRaw: '20:00',
    },
    {
      eventId: 1,
      plate: 'B',
      displayName: 'RIDER B',
      scoringTeam: 'Test School',
      categoryRaw: 'HS1 Boys - North',
      place: 'DNF',
      status: 'dnf',
      timeRaw: '21:00',
    },
  ]);
  await db.insert(schema.rawFetch).values({
    id: 1,
    season: 2025,
    eventId: 'test-north',
    listId: 'flat',
    listName: 'Results',
    url: 'https://example.invalid/list',
    httpStatus: 200,
    payload,
    contentHash: 'synthetic-source-hash',
  });
  await db
    .insert(schema.eventResultSource)
    .values({ eventId: 1, rawFetchId: 1, listId: 'flat', hidden: false });
});

it('offers two resolved current club riders at the exact Event, including a DNF', async () => {
  expect(await loadStoryCandidate(db, input)).toEqual({
    kind: 'available',
    candidate: {
      template: 'club-starts-at-event',
      clubId: 1,
      season: { id: 1, year: 2025 },
      checkpoint: { kind: 'through', ordinal: 2 },
      event: {
        id: 1,
        sourceEventId: 'test-north',
        name: 'Forest Loop',
        conference: 'North',
        round: { id: 1, ordinal: 2, name: 'Race 2' },
      },
      count: 2,
      source: {
        rawFetchId: 1,
        contentHash: 'synthetic-source-hash',
        listId: 'flat',
        hidden: false,
      },
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    },
  });
});

it('denies another account and immediately denies revoked membership', async () => {
  expect(await loadStoryCandidate(db, { ...input, actorId: 'outsider' })).toEqual({
    kind: 'unavailable',
    reason: 'access-denied',
  });
  await db.update(schema.clubMembership).set({ revokedAt: new Date() });
  expect(await loadStoryCandidate(db, input)).toEqual({
    kind: 'unavailable',
    reason: 'access-denied',
  });
});

it.each([undefined, null, -1, 1.5, NaN, Infinity, '2', 0, 1, 3, 999])(
  'requires an existing explicit checkpoint (%s)',
  async (checkpointOrdinal) => {
    expect(
      await loadStoryCandidate(db, { ...input, checkpointOrdinal: checkpointOrdinal as number }),
    ).toEqual({ kind: 'unavailable', reason: 'invalid-checkpoint' });
  },
);

it('rejects missing or foreign-season Events and Events after the checkpoint', async () => {
  expect(await loadStoryCandidate(db, { ...input, eventId: 999 })).toEqual({
    kind: 'unavailable',
    reason: 'missing-event',
  });
  expect(await loadStoryCandidate(db, { ...input, seasonId: 999 })).toEqual({
    kind: 'unavailable',
    reason: 'missing-season',
  });
  await db.insert(schema.season).values({ id: 2, year: 2026 });
  await db.insert(schema.round).values([
    { id: 2, seasonId: 2, ordinal: 2, name: 'Race 2' },
    { id: 3, seasonId: 1, ordinal: 1, name: 'Race 1' },
  ]);
  expect(await loadStoryCandidate(db, { ...input, seasonId: 2 })).toEqual({
    kind: 'unavailable',
    reason: 'season-mismatch',
  });
  expect(await loadStoryCandidate(db, { ...input, checkpointOrdinal: 1 })).toEqual({
    kind: 'unavailable',
    reason: 'after-checkpoint',
  });
});

it('withholds an Event without its normalized source binding', async () => {
  await db.delete(schema.eventResultSource);
  expect(await loadStoryCandidate(db, input)).toEqual({
    kind: 'unavailable',
    reason: 'missing-source',
  });
});

it.each([{ eventId: 'foreign-event' }, { season: 2026 }, { listId: 'other-list' }])(
  'rejects a source binding to the wrong archive scope (%j)',
  async (scope) => {
    await db.insert(schema.rawFetch).values({
      id: 2,
      season: 2025,
      eventId: 'test-north',
      listId: 'flat',
      listName: 'Results',
      url: 'https://example.invalid/list',
      httpStatus: 200,
      payload,
      contentHash: 'other-source',
      ...scope,
    });
    await db.update(schema.eventResultSource).set({ rawFetchId: 2 });
    expect(await loadStoryCandidate(db, input)).toEqual({
      kind: 'unavailable',
      reason: 'invalid-source',
    });
  },
);

it('withholds legacy normalized rows omitted by their newly bound correction', async () => {
  const correction = {
    ...payload,
    list: { Fields: [], ListFooterText: '1 finishers' },
    data: { '#1_HS1 Boys - North': [payload.data['#1_HS1 Boys - North'][0]] },
  };
  await db.insert(schema.rawFetch).values({
    id: 2,
    season: 2025,
    eventId: 'test-north',
    listId: 'flat',
    listName: 'Results',
    url: 'https://example.invalid/list',
    httpStatus: 200,
    payload: correction,
    contentHash: 'corrected-source',
  });
  await db.update(schema.eventResultSource).set({ rawFetchId: 2 });
  expect(await loadStoryCandidate(db, input)).toEqual({
    kind: 'unavailable',
    reason: 'inconsistent-coverage',
  });
});

it('withholds a zero-start narrative when all source identities are unresolved', async () => {
  await db.delete(schema.riderPlate);
  expect(await loadStoryCandidate(db, input)).toEqual({
    kind: 'unavailable',
    reason: 'zero-starts',
  });
});

it.each([
  { clubId: '1' },
  { eventId: NaN },
  { seasonId: 1.5 },
  { actorId: null },
  { eventId: 2147483648 },
])('rejects malformed public scope input (%j)', async (invalid) => {
  expect(await loadStoryCandidate(db, { ...input, ...invalid } as typeof input)).toEqual({
    kind: 'unavailable',
    reason: 'invalid-input',
  });
});

it('keeps a sole hidden selected list eligible despite an unpublished sibling conference', async () => {
  await db.update(schema.eventResultSource).set({ hidden: true });
  await db.insert(schema.event).values({
    id: 2,
    roundId: 1,
    sourceEventId: 'test-south',
    name: 'River Loop',
    conference: 'South',
  });
  expect(await loadStoryCandidate(db, input)).toMatchObject({
    kind: 'available',
    candidate: {
      count: 2,
      event: { sourceEventId: 'test-north', conference: 'North' },
      source: { hidden: true },
    },
  });
});

it('counts current-season resolved riders once across overlapping squads and ignores unresolved rows', async () => {
  await db.insert(schema.squad).values([
    { id: 1, clubId: 1, seasonId: 1, name: 'Cedar', slug: 'cedar' },
    { id: 2, clubId: 1, seasonId: 1, name: 'Summit', slug: 'summit' },
  ]);
  await db.insert(schema.squadMember).values([
    { squadId: 1, riderId: 1 },
    { squadId: 2, riderId: 1 },
    { squadId: 1, riderId: 2 },
  ]);
  expect(await loadStoryCandidate(db, input)).toMatchObject({
    kind: 'available',
    candidate: { count: 2 },
  });
  await db.delete(schema.riderPlate).where(eq(schema.riderPlate.riderId, 2));
  expect(await loadStoryCandidate(db, input)).toMatchObject({
    kind: 'available',
    candidate: { count: 1 },
  });
  await db.insert(schema.season).values({ id: 2, year: 2026 });
  await db.update(schema.clubMember).set({ seasonId: 2 }).where(eq(schema.clubMember.riderId, 1));
  expect(await loadStoryCandidate(db, input)).toEqual({
    kind: 'unavailable',
    reason: 'zero-starts',
  });
});

it('preserves the bound fingerprint when another raw revision is archived without normalization', async () => {
  const before = await loadStoryCandidate(db, input);
  await db.insert(schema.rawFetch).values({
    id: 2,
    season: 2025,
    eventId: 'test-north',
    listId: 'flat',
    listName: 'Results',
    url: 'https://example.invalid/list',
    httpStatus: 200,
    payload: { unavailable: true },
    contentHash: 'pending-correction',
  });
  expect(await loadStoryCandidate(db, input)).toEqual(before);
});

it.each([
  null,
  { ...payload, DataFields: ['BIB'] },
  { ...payload, list: { Fields: [], ListFooterText: 'Number of records: 3' } },
  { ...payload, data: { '#1_Unknown category': payload.data['#1_HS1 Boys - North'] } },
])(
  'does not expose cells or offer a story for an undecodable bound list (case %#)',
  async (invalidPayload) => {
    await db.insert(schema.rawFetch).values({
      id: 2,
      season: 2025,
      eventId: 'test-north',
      listId: 'flat',
      listName: 'Results',
      url: 'https://example.invalid/list',
      httpStatus: 200,
      payload: invalidPayload ?? 'invalid',
      contentHash: 'invalid-source-hash',
    });
    await db.update(schema.eventResultSource).set({ rawFetchId: 2 });
    expect(await loadStoryCandidate(db, input)).toEqual({
      kind: 'unavailable',
      reason: 'invalid-source',
    });
  },
);

it('rejects missing normalized plates and an equally sized but different normalized plate set', async () => {
  await db.delete(schema.individualResult).where(eq(schema.individualResult.plate, 'B'));
  expect(await loadStoryCandidate(db, input)).toEqual({
    kind: 'unavailable',
    reason: 'inconsistent-coverage',
  });
  await db.insert(schema.individualResult).values({
    eventId: 1,
    plate: 'C',
    displayName: 'RIDER C',
    scoringTeam: 'Test School',
    categoryRaw: 'HS1 Boys - North',
    place: '3',
    status: 'finished',
    timeRaw: '22:00',
  });
  expect(await loadStoryCandidate(db, input)).toEqual({
    kind: 'unavailable',
    reason: 'inconsistent-coverage',
  });
});

it('fingerprints every displayed Event, checkpoint, source and aggregate-count change', async () => {
  const fingerprint = async (selection = input) => {
    const result = await loadStoryCandidate(db, selection);
    expect(result.kind).toBe('available');
    if (result.kind !== 'available') throw new Error('Synthetic candidate unavailable');
    return result.candidate.fingerprint;
  };
  const baseline = await fingerprint();
  await db.update(schema.event).set({ name: 'Forest Loop Corrected' });
  expect(await fingerprint()).not.toBe(baseline);
  await db.update(schema.event).set({ name: 'Forest Loop', conference: null });
  expect(await fingerprint()).not.toBe(baseline);
  await db.update(schema.event).set({ conference: 'North' });
  await db.update(schema.round).set({ name: 'Race Two' });
  expect(await fingerprint()).not.toBe(baseline);
  await db.update(schema.round).set({ name: 'Race 2' });
  await db.insert(schema.round).values({ id: 2, seasonId: 1, ordinal: 3, name: 'Race 3' });
  expect(await fingerprint({ ...input, checkpointOrdinal: 3 })).not.toBe(baseline);
  await db.update(schema.eventResultSource).set({ hidden: true });
  expect(await fingerprint()).not.toBe(baseline);
  await db.update(schema.eventResultSource).set({ hidden: false });
  await db.delete(schema.clubMember).where(eq(schema.clubMember.riderId, 2));
  expect(await fingerprint()).not.toBe(baseline);
  await db.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 2 });
  expect(await fingerprint()).toBe(baseline);
  await db.insert(schema.rawFetch).values({
    id: 2,
    season: 2025,
    eventId: 'test-north',
    listId: 'other-list',
    listName: 'Results',
    url: 'https://example.invalid/list',
    httpStatus: 200,
    payload,
    contentHash: 'other-source-hash',
  });
  await db.update(schema.eventResultSource).set({ rawFetchId: 2, listId: 'other-list' });
  expect(await fingerprint()).not.toBe(baseline);
});

it.each(['member', 'coach', 'admin'] as const)(
  'allows active %s evidence reads only in their own club',
  async (role) => {
    await db.update(schema.clubMembership).set({ role });
    await db.insert(schema.club).values({ id: 2, name: 'Other Club' });
    expect(await loadStoryCandidate(db, input)).toMatchObject({
      kind: 'available',
      candidate: { count: 2 },
    });
    expect(await loadStoryCandidate(db, { ...input, clubId: 2 })).toEqual({
      kind: 'unavailable',
      reason: 'access-denied',
    });
  },
);

it('respects plate identity Round bounds and keeps an identity-free claim stable at the same count', async () => {
  const before = await loadStoryCandidate(db, input);
  await db.insert(schema.rider).values({ id: 3, displayName: '«RIDER-C»' });
  await db.insert(schema.clubMember).values({ clubId: 1, seasonId: 1, riderId: 3 });
  await db.update(schema.riderPlate).set({ riderId: 3 }).where(eq(schema.riderPlate.plate, 'B'));
  expect(await loadStoryCandidate(db, input)).toEqual(before);
  await db
    .update(schema.riderPlate)
    .set({ fromRoundOrdinal: 3 })
    .where(eq(schema.riderPlate.plate, 'B'));
  expect(await loadStoryCandidate(db, input)).toMatchObject({
    kind: 'available',
    candidate: { count: 1 },
  });
  await db
    .update(schema.riderPlate)
    .set({ fromRoundOrdinal: null, toRoundOrdinal: 1 })
    .where(eq(schema.riderPlate.plate, 'B'));
  expect(await loadStoryCandidate(db, input)).toMatchObject({
    kind: 'available',
    candidate: { count: 1 },
  });
  await db
    .update(schema.riderPlate)
    .set({ fromRoundOrdinal: 2, toRoundOrdinal: 2 })
    .where(eq(schema.riderPlate.plate, 'B'));
  expect(await loadStoryCandidate(db, input)).toEqual(before);
});
