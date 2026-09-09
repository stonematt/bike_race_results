import { archive, CONFIG_LIST_NAME } from './ingest/raw.ts';
import { normalize } from './ingest/normalize.ts';
import { and, eq } from 'drizzle-orm';
import * as schema from './db/schema.ts';
import { createStory, reviewStory, publishStory } from './editorial-stories.ts';
import { loadStoryCandidate } from './editorial-evidence.ts';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { bootstrapSafeDemo } from './demo.ts';
import { createTestDb, type TestDatabase } from './db/testing.ts';
import { AccessDenied } from './authz/access.ts';
import { loadPublishedStory } from './editorial-publication.ts';

let db: TestDatabase;
let actorId: string;
beforeEach(async () => {
  db = await createTestDb();
  actorId = (await bootstrapSafeDemo(db)).userId;
});
afterEach(async () => {
  await db?.$client.close();
});

it('leaves the factual dispatch in place when no story has been published', async () => {
  expect(
    await loadPublishedStory(db, {
      actorId,
      clubId: 1,
      seasonId: 2,
      checkpointOrdinal: 1,
      surface: 'season-dispatch',
    }),
  ).toBeNull();
});

it('requires current club authority even when no publication exists', async () => {
  await expect(
    loadPublishedStory(db, {
      actorId,
      clubId: 99,
      seasonId: 2,
      checkpointOrdinal: 1,
      surface: 'season-dispatch',
    }),
  ).rejects.toBeInstanceOf(AccessDenied);
});

async function publishSelection(surface: 'season-dispatch' | 'race-review' = 'season-dispatch') {
  const selection = { actorId, clubId: 1, seasonId: 2, checkpointOrdinal: 1, eventId: 2 };
  const evidence = await loadStoryCandidate(db, selection);
  if (evidence.kind !== 'available') throw new Error('Synthetic evidence unavailable');
  const created = await createStory(db, {
    ...selection,
    surface,
    expectedEvidence: evidence.candidate.fingerprint,
  });
  const approval = {
    actorId,
    clubId: 1,
    storyId: created.id,
    expectedRevision: 1,
    expectedEvidence: evidence.candidate.fingerprint,
  };
  await reviewStory(db, approval);
  await publishStory(db, approval);
  return created;
}

it('returns only the current approved observation for its exact placement and checkpoint', async () => {
  const created = await publishSelection();
  expect(
    await loadPublishedStory(db, {
      actorId,
      clubId: 1,
      seasonId: 2,
      checkpointOrdinal: 1,
      surface: 'season-dispatch',
    }),
  ).toMatchObject({
    id: created.id,
    surface: 'season-dispatch',
    candidate: { count: 5, event: { id: 2, sourceEventId: 'demo-2026-round-1' } },
  });
});

it('withholds an approved claim when the current roster count changes without a source change', async () => {
  await publishSelection();
  await db
    .delete(schema.clubMember)
    .where(
      and(
        eq(schema.clubMember.clubId, 1),
        eq(schema.clubMember.seasonId, 2),
        eq(schema.clubMember.riderId, 1),
      ),
    );
  expect(
    await loadPublishedStory(db, {
      actorId,
      clubId: 1,
      seasonId: 2,
      checkpointOrdinal: 1,
      surface: 'season-dispatch',
    }),
  ).toBeNull();
});

it('keeps archive-only revisions inert but withholds a same-count observation after the binding moves', async () => {
  const created = await publishSelection();
  const [original] = await db.select().from(schema.rawFetch);
  const [correction] = await db
    .insert(schema.rawFetch)
    .values({
      season: original.season,
      eventId: original.eventId,
      listId: original.listId,
      listName: original.listName,
      url: original.url,
      httpStatus: 200,
      payload: original.payload,
      contentHash: 'synthetic-correction-revision',
    })
    .returning({ id: schema.rawFetch.id });
  const input = {
    actorId,
    clubId: 1,
    seasonId: 2,
    checkpointOrdinal: 1,
    surface: 'season-dispatch' as const,
  };
  expect(await loadPublishedStory(db, input)).toMatchObject({
    id: created.id,
    candidate: { count: 5 },
  });
  // Fixture models an atomic normalizer binding change with identical start rows.
  await db
    .update(schema.eventResultSource)
    .set({ rawFetchId: correction.id })
    .where(eq(schema.eventResultSource.eventId, 2));
  expect(await loadPublishedStory(db, input)).toBeNull();
});

it('never carries a publication into another surface, Event, season or checkpoint', async () => {
  await publishSelection('race-review');
  const base = {
    actorId,
    clubId: 1,
    seasonId: 2,
    checkpointOrdinal: 1,
    surface: 'race-review' as const,
    eventId: 2,
  };
  expect(await loadPublishedStory(db, base)).toMatchObject({ surface: 'race-review' });
  for (const input of [
    { ...base, surface: 'season-dispatch' as const },
    { ...base, eventId: 1 },
    { ...base, eventId: undefined },
    { ...base, seasonId: 1 },
    { ...base, checkpointOrdinal: 2 },
  ])
    expect(await loadPublishedStory(db, input)).toBeNull();
});

it('withholds an approved story after a real archived correction removes a starter through normalization', async () => {
  const [original] = await db.select().from(schema.rawFetch);
  await archive(db, [
    {
      season: 2026,
      eventId: original.eventId,
      listId: null,
      listName: CONFIG_LIST_NAME,
      url: 'https://example.invalid/config',
      httpStatus: 200,
      payload: {
        key: 'synthetic',
        eventname: 'Demo Race 1 - Old Oak - North',
        lists: [{ ID: original.listId, Name: original.listName, Mode: '' }],
      },
    },
  ]);
  await normalize(db);
  await publishSelection();
  const payload = structuredClone(original.payload) as {
    list: { ListFooterText: string };
    data: Record<string, string[][]>;
  };
  payload.data['#1_HS2 Boys - North'] = payload.data['#1_HS2 Boys - North'].slice(0, 4);
  payload.list.ListFooterText = '4 finishers';
  await archive(db, [
    {
      season: 2026,
      eventId: original.eventId,
      listId: original.listId,
      listName: original.listName,
      url: 'https://example.invalid/correction',
      httpStatus: 200,
      payload,
    },
  ]);
  const input = {
    actorId,
    clubId: 1,
    seasonId: 2,
    checkpointOrdinal: 1,
    surface: 'season-dispatch' as const,
  };
  expect(await loadPublishedStory(db, input)).toMatchObject({ candidate: { count: 5 } });
  await normalize(db);
  expect(await loadStoryCandidate(db, { ...input, eventId: 2 })).toMatchObject({
    kind: 'available',
    candidate: { count: 4 },
  });
  expect(await loadPublishedStory(db, input)).toBeNull();
});

it('withholds a publication whose stored source tuple no longer matches its approval fingerprint', async () => {
  const created = await publishSelection();
  await db
    .update(schema.editorialStory)
    .set({ sourceHidden: true })
    .where(eq(schema.editorialStory.id, created.id));
  expect(
    await loadPublishedStory(db, {
      actorId,
      clubId: 1,
      seasonId: 2,
      checkpointOrdinal: 1,
      surface: 'season-dispatch',
    }),
  ).toBeNull();
});

it('admits a current member and denies the same retained identity after revocation', async () => {
  await publishSelection();
  await db.insert(schema.users).values({ id: 'reader', email: 'reader@example.test' });
  await db.insert(schema.clubMembership).values({ userId: 'reader', clubId: 1, role: 'member' });
  const input = {
    actorId: 'reader',
    clubId: 1,
    seasonId: 2,
    checkpointOrdinal: 1,
    surface: 'season-dispatch' as const,
  };
  expect(await loadPublishedStory(db, input)).toMatchObject({ candidate: { count: 5 } });
  await db
    .update(schema.clubMembership)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.clubMembership.clubId, 1), eq(schema.clubMembership.userId, 'reader')));
  await expect(loadPublishedStory(db, input)).rejects.toBeInstanceOf(AccessDenied);
});

it('does not render a publication when its recorded approval belongs to another revision', async () => {
  const created = await publishSelection();
  await db
    .update(schema.editorialStory)
    .set({ revision: 2 })
    .where(eq(schema.editorialStory.id, created.id));
  expect(
    await loadPublishedStory(db, {
      actorId,
      clubId: 1,
      seasonId: 2,
      checkpointOrdinal: 1,
      surface: 'season-dispatch',
    }),
  ).toBeNull();
});
