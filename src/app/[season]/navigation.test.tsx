import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestDb } from '@/lib/db/testing.ts';
import * as schema from '@/lib/db/schema.ts';
const current = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('@/auth.ts', () => ({ auth: async () => ({ user: { id: 'reader' } }) }));
vi.mock('@/app/db.ts', () => ({ appDb: () => current.db }));
import { renderRoster } from './roster-view.tsx';
import CategoryPage from './round/[ordinal]/category/[riderId]/page.tsx';
let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  db = await createTestDb();
  current.db = db;
  await db.insert(schema.users).values({ id: 'reader', email: 'reader@example.test' });
  await db.insert(schema.season).values({ id: 1, year: 2055 });
  await db.insert(schema.club).values({ id: 1, name: 'Synthetic Club' });
  await db.insert(schema.clubMembership).values({ clubId: 1, userId: 'reader', role: 'member' });
  await db.insert(schema.squad).values([
    {
      id: 1,
      clubId: 1,
      seasonId: 1,
      name: 'Alpha',
      slug: 'alpha',
      archivedAt: new Date('2055-01-01'),
    },
    { id: 2, clubId: 1, seasonId: 1, name: 'Cedar', slug: 'cedar' },
    { id: 3, clubId: 1, seasonId: 1, name: 'Summit', slug: 'summit' },
  ]);
});
afterEach(async () => {
  await db.$client.close();
});

it('omits archived assigned squads from roster choices while their direct URL remains readable', async () => {
  await db.insert(schema.squadCoach).values({ squadId: 1, userId: 'reader' });
  const markup = renderToStaticMarkup(await renderRoster({ seasonSegment: '2055' }));
  expect(markup).not.toContain('href="/2055/squad/alpha"');
  expect(markup).toContain('href="/2055/squad/cedar"');
  const archived = renderToStaticMarkup(
    await renderRoster({ seasonSegment: '2055', squadSlug: 'alpha' }),
  );
  expect(archived).toContain('Archived squad');
});

it('offers active club squads to an unassigned member', async () => {
  const markup = renderToStaticMarkup(await renderRoster({ seasonSegment: '2055' }));
  expect(markup).toContain('href="/2055/squad/cedar"');
  expect(markup).toContain('href="/2055/squad/summit"');
  expect(markup).not.toContain('href="/2055/squad/alpha"');
});

async function categoryEvidence() {
  await db.insert(schema.round).values({ id: 1, seasonId: 1, ordinal: 1, name: 'Race 1' });
  await db
    .insert(schema.event)
    .values({ id: 1, roundId: 1, sourceEventId: 'synthetic-event', name: 'Race 1' });
  await db.insert(schema.rider).values([
    { id: 1, displayName: '«ANCHOR»' },
    { id: 2, displayName: '«PEER»' },
  ]);
  await db.insert(schema.riderPlate).values([
    { riderId: 1, seasonId: 1, plate: 'A' },
    { riderId: 2, seasonId: 1, plate: 'B' },
  ]);
  await db.insert(schema.individualResult).values([
    {
      eventId: 1,
      plate: 'A',
      displayName: 'ANCHOR',
      scoringTeam: 'Synthetic School',
      categoryRaw: 'HS2 Boys',
      place: '1',
      status: 'finished',
      timeRaw: '20:00',
      timeSeconds: '1200',
      laps: 2,
    },
    {
      eventId: 1,
      plate: 'B',
      displayName: 'PEER',
      scoringTeam: 'Synthetic School',
      categoryRaw: 'HS2 Boys',
      place: '2',
      status: 'finished',
      timeRaw: '21:00',
      timeSeconds: '1260',
      laps: 2,
    },
  ]);
}
async function categoryMarkup() {
  return renderToStaticMarkup(
    await CategoryPage({
      params: Promise.resolve({ season: '2055', ordinal: '1', riderId: '1' }),
      searchParams: Promise.resolve({ through: '1' }),
    }),
  );
}
it('uses the saved nonalphabetical squad for category highlighting', async () => {
  await categoryEvidence();
  await db.insert(schema.squadCoach).values([
    { squadId: 2, userId: 'reader' },
    { squadId: 3, userId: 'reader' },
  ]);
  await db.insert(schema.squadMember).values({ squadId: 3, riderId: 2 });
  await db
    .insert(schema.userSquadPreference)
    .values({ userId: 'reader', clubId: 1, seasonId: 1, squadId: 3 });
  expect(await categoryMarkup()).toMatch(/>Squad<\/span>/);
});

it.each(['multiple', 'archived'] as const)(
  'does not manufacture category squad highlights from %s assignments',
  async (state) => {
    await categoryEvidence();
    const squadIds = state === 'multiple' ? [2, 3] : [1];
    await db
      .insert(schema.squadCoach)
      .values(squadIds.map((squadId) => ({ squadId, userId: 'reader' })));
    await db
      .insert(schema.squadMember)
      .values({ squadId: state === 'multiple' ? 2 : 1, riderId: 2 });
    expect(await categoryMarkup()).not.toMatch(/>Squad<\/span>/);
  },
);
