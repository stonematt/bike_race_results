import { afterEach, expect, it, vi } from 'vitest';
import { createTestDb } from '@/lib/db/testing.ts';
import { schema } from '@/lib/db/index.ts';
import { bootstrapSafeDemo } from '@/lib/demo.ts';
import { loadStoryCandidate } from '@/lib/editorial-evidence.ts';
import { loadStory, loadStoryWorkspace } from '@/lib/editorial-stories.ts';

const current = vi.hoisted(() => ({ db: undefined as unknown, userId: 'admin' }));
vi.mock('@/auth.ts', () => ({ auth: async () => ({ user: { id: current.userId } }) }));
vi.mock('@/app/db.ts', () => ({ appDb: () => current.db }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { saveStory } from './actions.ts';

let db: Awaited<ReturnType<typeof createTestDb>>;

async function onlyStory(actorId: string) {
  const workspace = await loadStoryWorkspace(db, { actorId, clubId: 1, seasonId: 2 });
  const [story] = workspace?.stories ?? [];
  if (!story) throw new Error('Story draft was not stored');
  const loaded = await loadStory(db, { actorId, clubId: 1, storyId: story.id });
  if (!loaded) throw new Error('Story draft was not stored');
  return loaded;
}

async function onlyStoryId(actorId: string): Promise<number> {
  return (await onlyStory(actorId)).id;
}

afterEach(async () => {
  await db?.$client.close();
  current.db = undefined;
  current.userId = 'admin';
});

it('rejects a stale story draft form after the selected club changes in another tab', async () => {
  db = await createTestDb();
  current.db = db;
  await db.insert(schema.users).values({ id: 'admin', email: 'admin@example.test' });
  await db.insert(schema.season).values({ id: 1, year: 2026 });
  const clubs = await db
    .insert(schema.club)
    .values([
      { name: 'Demo A', slug: 'demo-a' },
      { name: 'Demo B', slug: 'demo-b' },
    ])
    .returning();
  await db
    .insert(schema.clubMembership)
    .values(clubs.map((club) => ({ clubId: club.id, userId: 'admin', role: 'admin' as const })));
  await db.insert(schema.userClubPreference).values({ userId: 'admin', clubId: clubs[1]!.id });

  const form = new FormData();
  form.set('operation', 'create');
  form.set('checkpointOrdinal', '1');
  form.set('eventId', '2');
  form.set('surface', 'season-dispatch');
  form.set('expectedEvidence', 'forged');

  await expect(saveStory('2026', clubs[0]!.id, {}, form)).resolves.toEqual({
    error: 'Your club selection changed. Reload this page before saving.',
  });
  await expect(
    loadStoryWorkspace(db, { actorId: 'admin', clubId: clubs[1]!.id, seasonId: 1 }),
  ).resolves.toEqual(expect.objectContaining({ stories: [] }));
});

it('saves only the previewed server evidence as a draft', async () => {
  db = await createTestDb();
  current.db = db;
  const seeded = await bootstrapSafeDemo(db);
  current.userId = seeded.userId;
  const candidate = await loadStoryCandidate(db, {
    actorId: seeded.userId,
    clubId: 1,
    seasonId: 2,
    checkpointOrdinal: 1,
    eventId: 2,
  });
  if (candidate.kind !== 'available') throw new Error('Synthetic story candidate unavailable');

  const form = new FormData();
  form.set('operation', 'create');
  form.set('checkpointOrdinal', '1');
  form.set('eventId', '2');
  form.set('surface', 'season-dispatch');
  form.set('expectedEvidence', candidate.candidate.fingerprint);

  await expect(saveStory('2026', 1, {}, form)).resolves.toEqual({ message: 'Draft saved.' });
  const stored = await onlyStory(seeded.userId);
  await expect(
    loadStory(db, { actorId: seeded.userId, clubId: 1, storyId: stored.id }),
  ).resolves.toEqual(
    expect.objectContaining({ state: 'draft', surface: 'season-dispatch', eventId: 2 }),
  );
});

it('does not review a story from a stale season form', async () => {
  db = await createTestDb();
  current.db = db;
  const seeded = await bootstrapSafeDemo(db);
  current.userId = seeded.userId;
  const candidate = await loadStoryCandidate(db, {
    actorId: seeded.userId,
    clubId: 1,
    seasonId: 2,
    checkpointOrdinal: 1,
    eventId: 2,
  });
  if (candidate.kind !== 'available') throw new Error('Synthetic story candidate unavailable');

  const draft = new FormData();
  draft.set('operation', 'create');
  draft.set('checkpointOrdinal', '1');
  draft.set('eventId', '2');
  draft.set('surface', 'season-dispatch');
  draft.set('expectedEvidence', candidate.candidate.fingerprint);
  await saveStory('2026', 1, {}, draft);
  const storyId = await onlyStoryId(seeded.userId);

  const review = new FormData();
  review.set('operation', 'review');
  review.set('storyId', String(storyId));
  review.set('expectedRevision', '1');
  review.set('expectedEvidence', candidate.candidate.fingerprint);
  await expect(saveStory('2025', 1, {}, review)).resolves.toEqual({
    error: 'This story is unavailable in the selected season.',
  });
  await expect(loadStory(db, { actorId: seeded.userId, clubId: 1, storyId })).resolves.toEqual(
    expect.objectContaining({ state: 'draft', reviewedRevision: null }),
  );
});

it('requires an explicit admin evidence review for the current draft revision', async () => {
  db = await createTestDb();
  current.db = db;
  const seeded = await bootstrapSafeDemo(db);
  current.userId = seeded.userId;
  const candidate = await loadStoryCandidate(db, {
    actorId: seeded.userId,
    clubId: 1,
    seasonId: 2,
    checkpointOrdinal: 1,
    eventId: 2,
  });
  if (candidate.kind !== 'available') throw new Error('Synthetic story candidate unavailable');

  const draft = new FormData();
  draft.set('operation', 'create');
  draft.set('checkpointOrdinal', '1');
  draft.set('eventId', '2');
  draft.set('surface', 'season-dispatch');
  draft.set('expectedEvidence', candidate.candidate.fingerprint);
  await saveStory('2026', 1, {}, draft);
  const [stored] = await db.select().from(schema.editorialStory);
  if (!stored) throw new Error('Story draft was not stored');

  const review = new FormData();
  review.set('operation', 'review');
  review.set('storyId', String(stored.id));
  review.set('expectedRevision', String(stored.revision));
  review.set('expectedEvidence', candidate.candidate.fingerprint);

  await expect(saveStory('2026', 1, {}, review)).resolves.toEqual({
    message: 'Evidence approved.',
  });
  await expect(db.select().from(schema.editorialStory)).resolves.toEqual([
    expect.objectContaining({
      id: stored.id,
      state: 'reviewed',
      reviewedRevision: stored.revision,
    }),
  ]);
});

it('publishes only the reviewed revision with its displayed evidence', async () => {
  db = await createTestDb();
  current.db = db;
  const seeded = await bootstrapSafeDemo(db);
  current.userId = seeded.userId;
  const candidate = await loadStoryCandidate(db, {
    actorId: seeded.userId,
    clubId: 1,
    seasonId: 2,
    checkpointOrdinal: 1,
    eventId: 2,
  });
  if (candidate.kind !== 'available') throw new Error('Synthetic story candidate unavailable');

  const draft = new FormData();
  draft.set('operation', 'create');
  draft.set('checkpointOrdinal', '1');
  draft.set('eventId', '2');
  draft.set('surface', 'season-dispatch');
  draft.set('expectedEvidence', candidate.candidate.fingerprint);
  await saveStory('2026', 1, {}, draft);
  const [stored] = await db.select().from(schema.editorialStory);
  if (!stored) throw new Error('Story draft was not stored');

  const review = new FormData();
  review.set('operation', 'review');
  review.set('storyId', String(stored.id));
  review.set('expectedRevision', String(stored.revision));
  review.set('expectedEvidence', candidate.candidate.fingerprint);
  await saveStory('2026', 1, {}, review);

  const publish = new FormData();
  publish.set('operation', 'publish');
  publish.set('storyId', String(stored.id));
  publish.set('expectedRevision', String(stored.revision));
  publish.set('expectedEvidence', candidate.candidate.fingerprint);

  await expect(saveStory('2026', 1, {}, publish)).resolves.toEqual({
    message: 'Story published.',
  });
  await expect(db.select().from(schema.editorialStory)).resolves.toEqual([
    expect.objectContaining({ id: stored.id, state: 'published' }),
  ]);
});

it('returns a reviewed draft to the current authoring state on explicit rejection', async () => {
  db = await createTestDb();
  current.db = db;
  const seeded = await bootstrapSafeDemo(db);
  current.userId = seeded.userId;
  const candidate = await loadStoryCandidate(db, {
    actorId: seeded.userId,
    clubId: 1,
    seasonId: 2,
    checkpointOrdinal: 1,
    eventId: 2,
  });
  if (candidate.kind !== 'available') throw new Error('Synthetic story candidate unavailable');

  const draft = new FormData();
  draft.set('operation', 'create');
  draft.set('checkpointOrdinal', '1');
  draft.set('eventId', '2');
  draft.set('surface', 'season-dispatch');
  draft.set('expectedEvidence', candidate.candidate.fingerprint);
  await saveStory('2026', 1, {}, draft);
  const [stored] = await db.select().from(schema.editorialStory);
  if (!stored) throw new Error('Story draft was not stored');

  const review = new FormData();
  review.set('operation', 'review');
  review.set('storyId', String(stored.id));
  review.set('expectedRevision', String(stored.revision));
  review.set('expectedEvidence', candidate.candidate.fingerprint);
  await saveStory('2026', 1, {}, review);

  const reject = new FormData();
  reject.set('operation', 'reject');
  reject.set('storyId', String(stored.id));
  reject.set('expectedRevision', String(stored.revision));

  await expect(saveStory('2026', 1, {}, reject)).resolves.toEqual({
    message: 'Returned to draft.',
  });
  await expect(db.select().from(schema.editorialStory)).resolves.toEqual([
    expect.objectContaining({ id: stored.id, state: 'draft', reviewedRevision: null }),
  ]);
});

it('revises a draft against the newly previewed evidence and clears prior approval', async () => {
  db = await createTestDb();
  current.db = db;
  const seeded = await bootstrapSafeDemo(db);
  current.userId = seeded.userId;
  const candidate = await loadStoryCandidate(db, {
    actorId: seeded.userId,
    clubId: 1,
    seasonId: 2,
    checkpointOrdinal: 1,
    eventId: 2,
  });
  if (candidate.kind !== 'available') throw new Error('Synthetic story candidate unavailable');

  const draft = new FormData();
  draft.set('operation', 'create');
  draft.set('checkpointOrdinal', '1');
  draft.set('eventId', '2');
  draft.set('surface', 'season-dispatch');
  draft.set('expectedEvidence', candidate.candidate.fingerprint);
  await saveStory('2026', 1, {}, draft);
  const [stored] = await db.select().from(schema.editorialStory);
  if (!stored) throw new Error('Story draft was not stored');

  const revise = new FormData();
  revise.set('operation', 'revise');
  revise.set('storyId', String(stored.id));
  revise.set('expectedRevision', String(stored.revision));
  revise.set('checkpointOrdinal', '1');
  revise.set('eventId', '2');
  revise.set('surface', 'race-review');
  revise.set('expectedEvidence', candidate.candidate.fingerprint);

  await expect(saveStory('2026', 1, {}, revise)).resolves.toEqual({
    message: 'Draft revised.',
  });
  await expect(db.select().from(schema.editorialStory)).resolves.toEqual([
    expect.objectContaining({
      id: stored.id,
      state: 'draft',
      revision: stored.revision + 1,
      surface: 'race-review',
    }),
  ]);
});
