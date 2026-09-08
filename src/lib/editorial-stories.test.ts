import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDb, type TestDatabase } from './db/testing.ts';
import * as schema from './db/schema.ts';
import { AccessDenied } from './authz/access.ts';
import { bootstrapSafeDemo } from './demo.ts';
import { loadStoryCandidate } from './editorial-evidence.ts';
import {
  createStory,
  loadStory,
  reviseStory,
  reviewStory,
  publishStory,
  rejectStoryReview,
  loadStoryWorkspace,
  StoryOperationError,
} from './editorial-stories.ts';

let db: TestDatabase;
let adminId: string;
beforeEach(async () => {
  db = await createTestDb();
  adminId = (await bootstrapSafeDemo(db)).userId;
  await db.insert(schema.users).values({ id: 'reader', email: 'reader@example.test' });
  await db.insert(schema.clubMembership).values({ clubId: 1, userId: 'reader', role: 'member' });
});
afterEach(async () => {
  await db?.$client.close();
});

it('denies drafting to a member even with a forged selection', async () => {
  await expect(
    createStory(db, {
      actorId: 'reader',
      clubId: 1,
      seasonId: 1,
      checkpointOrdinal: 1,
      eventId: 1,
      surface: 'season-dispatch',
      expectedEvidence: 'forged',
    }),
  ).rejects.toBeInstanceOf(AccessDenied);
});

it('persists a draft of the evidence the coach previewed', async () => {
  const selection = { actorId: adminId, clubId: 1, seasonId: 2, checkpointOrdinal: 1, eventId: 2 };
  const result = await loadStoryCandidate(db, selection);
  if (result.kind !== 'available') throw new Error('Synthetic candidate unavailable');
  const created = await createStory(db, {
    ...selection,
    surface: 'season-dispatch',
    expectedEvidence: result.candidate.fingerprint,
  });
  expect(await loadStory(db, { actorId: adminId, clubId: 1, storyId: created.id })).toMatchObject({
    id: created.id,
    state: 'draft',
    revision: 1,
    surface: 'season-dispatch',
    evidence: {
      kind: 'available',
      candidate: { count: 5, event: { sourceEventId: 'demo-2026-round-1' } },
    },
    reviewedRevision: null,
  });
});

async function preview() {
  const selection = { actorId: adminId, clubId: 1, seasonId: 2, checkpointOrdinal: 1, eventId: 2 };
  const evidence = await loadStoryCandidate(db, selection);
  if (evidence.kind !== 'available') throw new Error('Synthetic candidate unavailable');
  return {
    ...selection,
    surface: 'season-dispatch' as const,
    expectedEvidence: evidence.candidate.fingerprint,
  };
}

it('revises a draft selection into a new revision for explicit review', async () => {
  const selection = await preview();
  const draft = await createStory(db, selection);
  expect(
    await reviseStory(db, {
      ...selection,
      storyId: draft.id,
      expectedRevision: 1,
      surface: 'race-review',
    }),
  ).toEqual({ id: draft.id, revision: 2 });
  expect(await loadStory(db, { actorId: adminId, clubId: 1, storyId: draft.id })).toMatchObject({
    state: 'draft',
    revision: 2,
    surface: 'race-review',
    reviewedRevision: null,
    approvedCount: null,
    evidence: { kind: 'available', candidate: { count: 5 } },
  });
});

it('rejects an obsolete revision without overwriting the newer selection', async () => {
  const selection = await preview();
  const draft = await createStory(db, selection);
  await reviseStory(db, {
    ...selection,
    storyId: draft.id,
    expectedRevision: 1,
    surface: 'race-review',
  });
  await expect(
    reviseStory(db, { ...selection, storyId: draft.id, expectedRevision: 1 }),
  ).rejects.toBeInstanceOf(StoryOperationError);
  expect(await loadStory(db, { actorId: adminId, clubId: 1, storyId: draft.id })).toMatchObject({
    revision: 2,
    surface: 'race-review',
    state: 'draft',
  });
});

it('lets an admin explicitly review their own current draft and captures the derived count', async () => {
  const selection = await preview();
  const draft = await createStory(db, selection);
  expect(
    await reviewStory(db, {
      actorId: adminId,
      clubId: 1,
      storyId: draft.id,
      expectedRevision: 1,
      expectedEvidence: selection.expectedEvidence,
    }),
  ).toEqual({ id: draft.id, revision: 1 });
  expect(await loadStory(db, { actorId: adminId, clubId: 1, storyId: draft.id })).toMatchObject({
    state: 'reviewed',
    revision: 1,
    reviewedRevision: 1,
    approvedCount: 5,
    reviewedByUserId: adminId,
    reviewedAt: expect.any(Date),
  });
});

it('publishes the exact reviewed revision into its selected placement', async () => {
  const selection = await preview();
  const draft = await createStory(db, selection);
  const command = {
    actorId: adminId,
    clubId: 1,
    storyId: draft.id,
    expectedRevision: 1,
    expectedEvidence: selection.expectedEvidence,
  };
  await reviewStory(db, command);
  expect(await publishStory(db, command)).toEqual({ id: draft.id, revision: 1 });
  expect(await loadStory(db, command)).toMatchObject({
    state: 'published',
    revision: 1,
    reviewedRevision: 1,
    approvedCount: 5,
    publishedByUserId: adminId,
    publishedAt: expect.any(Date),
    surface: 'season-dispatch',
  });
});

it('withholds publication until the current revision has explicit admin approval', async () => {
  const selection = await preview();
  const draft = await createStory(db, selection);
  const command = {
    actorId: adminId,
    clubId: 1,
    storyId: draft.id,
    expectedRevision: 1,
    expectedEvidence: selection.expectedEvidence,
  };
  await expect(publishStory(db, command)).rejects.toBeInstanceOf(StoryOperationError);
  await reviewStory(db, command);
  await reviseStory(db, { ...selection, storyId: draft.id, expectedRevision: 1 });
  expect(await loadStory(db, command)).toMatchObject({
    revision: 2,
    state: 'draft',
    reviewedAt: null,
    reviewedByUserId: null,
    reviewedRevision: null,
    approvedCount: null,
  });
  await expect(publishStory(db, { ...command, expectedRevision: 2 })).rejects.toBeInstanceOf(
    StoryOperationError,
  );
  expect(await loadStory(db, command)).toMatchObject({
    revision: 2,
    state: 'draft',
    publishedAt: null,
  });
});

it('atomically supersedes the prior publication only in the replacement placement', async () => {
  const selection = await preview();
  const publish = async (surface: 'season-dispatch' | 'race-review') => {
    const draft = await createStory(db, { ...selection, surface });
    const command = {
      actorId: adminId,
      clubId: 1,
      storyId: draft.id,
      expectedRevision: 1,
      expectedEvidence: selection.expectedEvidence,
    };
    await reviewStory(db, command);
    await publishStory(db, command);
    return command;
  };
  const original = await publish('season-dispatch');
  const race = await publish('race-review');
  const replacement = await publish('season-dispatch');
  expect(await loadStory(db, original)).toMatchObject({
    state: 'superseded',
    supersededByStoryId: replacement.storyId,
    approvedCount: 5,
  });
  expect(await loadStory(db, race)).toMatchObject({
    state: 'published',
    supersededByStoryId: null,
  });
  expect(await loadStory(db, replacement)).toMatchObject({
    state: 'published',
    supersededByStoryId: null,
  });
});

it('lets an admin return a reviewed selection to draft without retaining approval', async () => {
  const selection = await preview();
  const draft = await createStory(db, selection);
  const command = {
    actorId: adminId,
    clubId: 1,
    storyId: draft.id,
    expectedRevision: 1,
    expectedEvidence: selection.expectedEvidence,
  };
  await reviewStory(db, command);
  await rejectStoryReview(db, command);
  expect(await loadStory(db, command)).toMatchObject({
    state: 'draft',
    revision: 1,
    reviewedAt: null,
    reviewedByUserId: null,
    reviewedRevision: null,
    approvedCount: null,
  });
  await expect(publishStory(db, command)).rejects.toBeInstanceOf(StoryOperationError);
});

it.each(['revise', 'review', 'reject-review'] as const)(
  'keeps published selections immutable against %s',
  async (action) => {
    const selection = await preview();
    const draft = await createStory(db, selection);
    const command = {
      actorId: adminId,
      clubId: 1,
      storyId: draft.id,
      expectedRevision: 1,
      expectedEvidence: selection.expectedEvidence,
    };
    await reviewStory(db, command);
    await publishStory(db, command);
    const mutation =
      action === 'revise'
        ? reviseStory(db, { ...selection, ...command })
        : action === 'review'
          ? reviewStory(db, command)
          : rejectStoryReview(db, command);
    await expect(mutation).rejects.toBeInstanceOf(StoryOperationError);
    expect(await loadStory(db, command)).toMatchObject({
      state: 'published',
      revision: 1,
      reviewedRevision: 1,
      approvedCount: 5,
    });
  },
);

it('reports a changed reviewed club count and refuses publication until refresh and review', async () => {
  const selection = await preview();
  const draft = await createStory(db, selection);
  const command = {
    actorId: adminId,
    clubId: 1,
    storyId: draft.id,
    expectedRevision: 1,
    expectedEvidence: selection.expectedEvidence,
  };
  await reviewStory(db, command);
  await db.delete(schema.clubMember).where(eq(schema.clubMember.riderId, 5));
  expect(await loadStory(db, command)).toMatchObject({
    state: 'reviewed',
    approvedCount: 5,
    validation: { kind: 'stale-evidence', reason: 'current-count' },
    evidence: { kind: 'available', candidate: { count: 4 } },
  });
  await expect(publishStory(db, command)).rejects.toBeInstanceOf(StoryOperationError);
  const refreshed = await preview();
  await expect(
    publishStory(db, { ...command, expectedEvidence: refreshed.expectedEvidence }),
  ).rejects.toBeInstanceOf(StoryOperationError);
  await reviseStory(db, { ...refreshed, storyId: draft.id, expectedRevision: 1 });
  await reviewStory(db, {
    ...command,
    expectedRevision: 2,
    expectedEvidence: refreshed.expectedEvidence,
  });
  await publishStory(db, {
    ...command,
    expectedRevision: 2,
    expectedEvidence: refreshed.expectedEvidence,
  });
  expect(await loadStory(db, command)).toMatchObject({
    state: 'published',
    approvedCount: 4,
    reviewedRevision: 2,
    validation: { kind: 'current' },
  });
});

it('lists season-scoped story states with exact Event choices and current evidence validation', async () => {
  const selection = await preview();
  const draft = await createStory(db, selection);
  expect(await loadStoryWorkspace(db, { actorId: adminId, clubId: 1, seasonId: 2 })).toEqual({
    season: { id: 2, year: 2026 },
    rounds: [
      {
        ordinal: 1,
        name: 'Race 1',
        events: [
          {
            id: 2,
            sourceEventId: 'demo-2026-round-1',
            name: 'Demo Race 1 — Old Oak',
            conference: 'North',
          },
        ],
      },
    ],
    stories: [
      {
        id: draft.id,
        state: 'draft',
        revision: 1,
        surface: 'season-dispatch',
        checkpointOrdinal: 1,
        event: {
          id: 2,
          sourceEventId: 'demo-2026-round-1',
          name: 'Demo Race 1 — Old Oak',
          conference: 'North',
          round: { ordinal: 1, name: 'Race 1' },
        },
        validation: { kind: 'current' },
      },
    ],
  });
  expect(await loadStoryWorkspace(db, { actorId: adminId, clubId: 1, seasonId: 1 })).toMatchObject({
    stories: [],
  });
  await expect(
    loadStoryWorkspace(db, { actorId: 'reader', clubId: 1, seasonId: 2 }),
  ).rejects.toBeInstanceOf(AccessDenied);
});

it.each([
  { surface: 'unknown' },
  { clubId: NaN },
  { actorId: null },
  { seasonId: NaN },
  { eventId: 2147483648 },
])('returns a domain correction for malformed creation input (case %#)', async (invalid) => {
  const selection = await preview();
  await expect(
    createStory(db, { ...selection, ...invalid } as typeof selection),
  ).rejects.toBeInstanceOf(StoryOperationError);
  expect(await loadStoryWorkspace(db, { actorId: adminId, clubId: 1, seasonId: 2 })).toMatchObject({
    stories: [],
  });
});

it.each([
  { storyId: '1' },
  { storyId: NaN },
  { clubId: NaN },
  { expectedRevision: '1' },
  { expectedRevision: -1 },
  { surface: 'invalid' },
])('rejects malformed revision commands without changing a draft (case %#)', async (invalid) => {
  const selection = await preview();
  const draft = await createStory(db, selection);
  const command = { ...selection, storyId: draft.id, expectedRevision: 1 };
  await expect(
    reviseStory(db, { ...command, ...invalid } as typeof command),
  ).rejects.toBeInstanceOf(StoryOperationError);
  expect(await loadStory(db, command)).toMatchObject({ state: 'draft', revision: 1 });
});

it('refuses approval when any captured source tuple disagrees with the current evidence', async () => {
  const selection = await preview();
  const draft = await createStory(db, selection);
  await db
    .update(schema.editorialStory)
    .set({ sourceListId: 'wrong-captured-list' })
    .where(eq(schema.editorialStory.id, draft.id));
  const command = {
    actorId: adminId,
    clubId: 1,
    storyId: draft.id,
    expectedRevision: 1,
    expectedEvidence: selection.expectedEvidence,
  };
  await expect(reviewStory(db, command)).rejects.toBeInstanceOf(StoryOperationError);
  expect(await loadStory(db, command)).toMatchObject({
    state: 'draft',
    reviewedRevision: null,
    validation: { kind: 'stale-evidence', reason: 'source' },
  });
});

it('allows coach drafting and revision but reserves review, rejection and publication for admins', async () => {
  await db.insert(schema.users).values({ id: 'coach', email: 'coach@example.test' });
  await db.insert(schema.clubMembership).values({ clubId: 1, userId: 'coach', role: 'coach' });
  const selection = { ...(await preview()), actorId: 'coach' };
  const draft = await createStory(db, selection);
  await reviseStory(db, { ...selection, storyId: draft.id, expectedRevision: 1 });
  const command = {
    actorId: 'coach',
    clubId: 1,
    storyId: draft.id,
    expectedRevision: 2,
    expectedEvidence: selection.expectedEvidence,
  };
  for (const operation of [reviewStory, rejectStoryReview, publishStory]) {
    await expect(operation(db, command)).rejects.toBeInstanceOf(AccessDenied);
  }
  await expect(
    reviseStory(db, { ...selection, ...command, actorId: 'reader' }),
  ).rejects.toBeInstanceOf(AccessDenied);
  await expect(loadStory(db, { ...command, actorId: 'reader' })).rejects.toBeInstanceOf(
    AccessDenied,
  );
  expect(await loadStory(db, command)).toMatchObject({
    state: 'draft',
    revision: 2,
    reviewedRevision: null,
  });
});

it('rechecks revoked and cross-club authority at every command and management read', async () => {
  const selection = await preview();
  const draft = await createStory(db, selection);
  const command = { ...selection, storyId: draft.id, expectedRevision: 1 };
  await db.insert(schema.club).values({ id: 2, name: 'Other Club' });
  await expect(loadStory(db, { ...command, clubId: 2 })).rejects.toBeInstanceOf(AccessDenied);
  await expect(loadStoryWorkspace(db, { ...selection, clubId: 2 })).rejects.toBeInstanceOf(
    AccessDenied,
  );
  await db.insert(schema.clubMembership).values({ userId: adminId, clubId: 2, role: 'admin' });
  expect(await loadStory(db, { ...command, clubId: 2 })).toBeNull();
  for (const operation of [reviseStory, reviewStory, rejectStoryReview, publishStory]) {
    await expect(operation(db, { ...command, clubId: 2 })).rejects.toBeInstanceOf(
      StoryOperationError,
    );
  }
  expect(await loadStoryWorkspace(db, { ...selection, clubId: 2 })).toMatchObject({ stories: [] });
  await db.update(schema.clubMembership).set({ revokedAt: new Date() });
  for (const operation of [
    createStory,
    reviseStory,
    reviewStory,
    rejectStoryReview,
    publishStory,
  ]) {
    await expect(operation(db, command)).rejects.toBeInstanceOf(AccessDenied);
  }
  await expect(loadStory(db, command)).rejects.toBeInstanceOf(AccessDenied);
  await expect(loadStoryWorkspace(db, selection)).rejects.toBeInstanceOf(AccessDenied);
});

it('refuses a changed preview on create, revise, review and publish without partial state changes', async () => {
  const selection = await preview();
  const draft = await createStory(db, selection);
  const command = { ...selection, storyId: draft.id, expectedRevision: 1 };
  for (const operation of [createStory, reviseStory, reviewStory]) {
    await expect(operation(db, { ...command, expectedEvidence: 'forged' })).rejects.toBeInstanceOf(
      StoryOperationError,
    );
  }
  expect(await loadStory(db, command)).toMatchObject({ state: 'draft', revision: 1 });
  await reviewStory(db, command);
  await expect(publishStory(db, { ...command, expectedEvidence: 'forged' })).rejects.toBeInstanceOf(
    StoryOperationError,
  );
  expect(await loadStory(db, command)).toMatchObject({
    state: 'reviewed',
    revision: 1,
    publishedAt: null,
  });
});

it('requires refreshing changed Event labels before reviewing the new preview', async () => {
  const selection = await preview();
  const draft = await createStory(db, selection);
  const command = { ...selection, storyId: draft.id, expectedRevision: 1 };
  await db
    .update(schema.event)
    .set({ name: 'Corrected source Event' })
    .where(eq(schema.event.id, 2));
  const fresh = await preview();
  await expect(
    reviewStory(db, { ...command, expectedEvidence: fresh.expectedEvidence }),
  ).rejects.toBeInstanceOf(StoryOperationError);
  expect(await loadStory(db, command)).toMatchObject({
    state: 'draft',
    validation: { kind: 'stale-evidence', reason: 'displayed-evidence' },
  });
});

it.each(['source', 'coverage', 'scope'] as const)(
  'reports stale %s evidence in management without modifying a publication',
  async (reason) => {
    const selection = await preview();
    const draft = await createStory(db, selection);
    const command = { ...selection, storyId: draft.id, expectedRevision: 1 };
    await reviewStory(db, command);
    await publishStory(db, command);
    if (reason === 'source') await db.update(schema.eventResultSource).set({ hidden: true });
    if (reason === 'coverage')
      await db.delete(schema.individualResult).where(eq(schema.individualResult.plate, 'D1'));
    if (reason === 'scope')
      await db.update(schema.round).set({ ordinal: 2 }).where(eq(schema.round.id, 2));
    expect(await loadStory(db, command)).toMatchObject({
      state: 'published',
      approvedCount: 5,
      validation: { kind: 'stale-evidence', reason },
    });
    expect(await loadStoryWorkspace(db, selection)).toMatchObject({
      stories: [
        { id: draft.id, state: 'published', validation: { kind: 'stale-evidence', reason } },
      ],
    });
  },
);

it('keeps the previous publication when replacement approval becomes stale', async () => {
  const selection = await preview();
  const original = await createStory(db, selection);
  const command = { ...selection, storyId: original.id, expectedRevision: 1 };
  await reviewStory(db, command);
  await publishStory(db, command);
  const next = await createStory(db, selection);
  await reviewStory(db, { ...command, storyId: next.id });
  await expect(
    publishStory(db, { ...command, storyId: next.id, expectedRevision: 2 }),
  ).rejects.toBeInstanceOf(StoryOperationError);
  expect(await loadStory(db, command)).toMatchObject({
    state: 'published',
    supersededByStoryId: null,
  });
  expect(await loadStory(db, { ...command, storyId: next.id })).toMatchObject({
    state: 'reviewed',
    publishedAt: null,
  });
});

it('keeps superseded history immutable and requires a new draft to republish it', async () => {
  const selection = await preview();
  const original = await createStory(db, selection);
  const command = { ...selection, storyId: original.id, expectedRevision: 1 };
  await reviewStory(db, command);
  await publishStory(db, command);
  const next = await createStory(db, selection);
  await reviewStory(db, { ...command, storyId: next.id });
  await publishStory(db, { ...command, storyId: next.id });
  for (const operation of [reviseStory, reviewStory, rejectStoryReview, publishStory]) {
    await expect(operation(db, command)).rejects.toBeInstanceOf(StoryOperationError);
  }
  expect(await loadStory(db, command)).toMatchObject({
    state: 'superseded',
    supersededByStoryId: next.id,
  });
});

it('isolates replacement by checkpoint and by exact Event on the race-review surface', async () => {
  await db.insert(schema.round).values({ id: 3, seasonId: 2, ordinal: 2, name: 'Race 2' });
  await db.insert(schema.event).values({
    id: 3,
    roundId: 2,
    sourceEventId: 'demo-sibling',
    name: 'Synthetic sibling Event',
    conference: 'South',
  });
  const rows = await db
    .select()
    .from(schema.individualResult)
    .where(eq(schema.individualResult.eventId, 2));
  await db.insert(schema.individualResult).values(rows.map((row) => ({ ...row, eventId: 3 })));
  const [source] = await db.select().from(schema.rawFetch);
  if (!source) throw new Error('Synthetic source absent');
  const [copied] = await db
    .insert(schema.rawFetch)
    .values({
      season: 2026,
      eventId: 'demo-sibling',
      listId: source.listId,
      listName: source.listName,
      url: 'https://example.invalid/list',
      httpStatus: 200,
      payload: source.payload,
      contentHash: source.contentHash,
    })
    .returning({ id: schema.rawFetch.id });
  if (!copied || !source.listId) throw new Error('Synthetic binding absent');
  await db
    .insert(schema.eventResultSource)
    .values({ eventId: 3, rawFetchId: copied.id, listId: source.listId, hidden: false });
  const publish = async (eventId: number, checkpointOrdinal: number) => {
    const input = { actorId: adminId, clubId: 1, seasonId: 2, eventId, checkpointOrdinal };
    const evidence = await loadStoryCandidate(db, input);
    if (evidence.kind !== 'available') throw new Error('Synthetic candidate unavailable');
    const selection = {
      ...input,
      surface: 'race-review' as const,
      expectedEvidence: evidence.candidate.fingerprint,
    };
    const draft = await createStory(db, selection);
    const command = { ...selection, storyId: draft.id, expectedRevision: 1 };
    await reviewStory(db, command);
    await publishStory(db, command);
    return command;
  };
  const original = await publish(2, 1);
  const laterCheckpoint = await publish(2, 2);
  const sibling = await publish(3, 1);
  const replacement = await publish(2, 1);
  expect(await loadStory(db, original)).toMatchObject({
    state: 'superseded',
    supersededByStoryId: replacement.storyId,
  });
  expect(await loadStory(db, laterCheckpoint)).toMatchObject({ state: 'published' });
  expect(await loadStory(db, sibling)).toMatchObject({ state: 'published' });
  expect(await loadStory(db, replacement)).toMatchObject({ state: 'published' });
});
