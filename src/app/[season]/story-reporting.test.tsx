import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestDb, type TestDatabase } from '@/lib/db/testing.ts';
import { bootstrapSafeDemo } from '@/lib/demo.ts';
import { createStory, reviewStory, publishStory } from '@/lib/editorial-stories.ts';
import { loadStoryCandidate } from '@/lib/editorial-evidence.ts';
import * as schema from '@/lib/db/schema.ts';

const current = vi.hoisted(() => ({ db: undefined as unknown, actorId: '' }));
vi.mock('@/auth.ts', () => ({ auth: async () => ({ user: { id: current.actorId } }) }));
vi.mock('@/app/db.ts', () => ({ appDb: () => current.db }));
import SeasonHomePage from './page.tsx';
import RoundPage from './round/[ordinal]/page.tsx';

let db: TestDatabase;
let adminId: string;
beforeEach(async () => {
  db = await createTestDb();
  adminId = (await bootstrapSafeDemo(db)).userId;
  current.db = db;
  current.actorId = 'reader';
  await db.insert(schema.users).values({ id: 'reader', email: 'reader@example.test' });
  await db.insert(schema.clubMembership).values({ userId: 'reader', clubId: 1, role: 'member' });
});
afterEach(async () => {
  await db.$client.close();
});

async function publish(surface: 'season-dispatch' | 'race-review') {
  const selection = { actorId: adminId, clubId: 1, seasonId: 2, checkpointOrdinal: 1, eventId: 2 };
  const evidence = await loadStoryCandidate(db, selection);
  if (evidence.kind !== 'available') throw new Error('Synthetic evidence unavailable');
  const { id } = await createStory(db, {
    ...selection,
    surface,
    expectedEvidence: evidence.candidate.fingerprint,
  });
  const approval = {
    actorId: adminId,
    clubId: 1,
    storyId: id,
    expectedRevision: 1,
    expectedEvidence: evidence.candidate.fingerprint,
  };
  await reviewStory(db, approval);
  await publishStory(db, approval);
}

it('a member reaches the reviewed season observation and its exact checkpointed source', async () => {
  await publish('season-dispatch');
  const markup = renderToStaticMarkup(
    await SeasonHomePage({
      params: Promise.resolve({ season: '2026' }),
      searchParams: Promise.resolve({ through: '1' }),
    }),
  );
  expect(markup).toContain('5 club riders recorded a start at Demo Race 1 — Old Oak (North).');
  expect(markup).toContain('href="/2026/round/1?through=1#event-demo-2026-round-1"');
});

it('a member finds the race publication beside its own Event while sibling results remain missing', async () => {
  await db.insert(schema.event).values({
    id: 3,
    roundId: 2,
    sourceEventId: 'demo-2026-south',
    name: 'Demo South Event',
    conference: 'South',
  });
  await publish('race-review');
  const markup = renderToStaticMarkup(
    await RoundPage({
      params: Promise.resolve({ season: '2026', ordinal: '1' }),
      searchParams: Promise.resolve({ through: '1' }),
    }),
  );
  expect(markup).toContain('5 club riders recorded a start at Demo Race 1 — Old Oak (North).');
  expect(markup).toContain('Results are available for 1 of 2 scheduled events.');
  expect(markup).toContain('href="/2026/round/1?through=1#event-demo-2026-round-1"');
  expect(markup).toContain('aria-label="Choose an Event"');
});

it('a member gets factual reporting after the approved roster evidence changes', async () => {
  await publish('season-dispatch');
  await db
    .delete(schema.clubMember)
    .where(
      and(
        eq(schema.clubMember.clubId, 1),
        eq(schema.clubMember.seasonId, 2),
        eq(schema.clubMember.riderId, 1),
      ),
    );
  const markup = renderToStaticMarkup(
    await SeasonHomePage({
      params: Promise.resolve({ season: '2026' }),
      searchParams: Promise.resolve({ through: '1' }),
    }),
  );
  expect(markup).not.toContain('5 club riders recorded a start at Demo Race 1 — Old Oak (North).');
  expect(markup).toContain('More from this weekend');
  expect(markup).toContain('4 club riders recorded a start at Race 1.');
});

it('a member keeps the race review question when stale evidence withholds its publication', async () => {
  await publish('race-review');
  await db
    .delete(schema.clubMember)
    .where(
      and(
        eq(schema.clubMember.clubId, 1),
        eq(schema.clubMember.seasonId, 2),
        eq(schema.clubMember.riderId, 1),
      ),
    );
  const markup = renderToStaticMarkup(
    await RoundPage({
      params: Promise.resolve({ season: '2026', ordinal: '1' }),
      searchParams: Promise.resolve({ through: '1' }),
    }),
  );
  expect(markup).not.toContain('5 club riders recorded a start at Demo Race 1 — Old Oak (North).');
  expect(markup).toContain('4 club riders recorded in this 5-rider field.');
  expect(markup.match(/What would you like to try at the next race\?/g)).toHaveLength(1);
});
