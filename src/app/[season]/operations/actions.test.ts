import { afterEach, expect, it, vi } from 'vitest';
import { createTestDb } from '@/lib/db/testing.ts';
import { schema } from '@/lib/db/index.ts';
const current = vi.hoisted(() => ({ db: undefined as unknown, userId: 'admin' }));
vi.mock('@/auth.ts', () => ({ auth: async () => ({ user: { id: current.userId } }) }));
vi.mock('@/app/db.ts', () => ({ appDb: () => current.db }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { saveOperation } from './actions.ts';
let db: Awaited<ReturnType<typeof createTestDb>>;
afterEach(async () => {
  await db?.$client.close();
});
it('rejects a stale form after the selected club changes in another tab', async () => {
  db = await createTestDb();
  current.db = db;
  await db.insert(schema.users).values({ id: 'admin', email: 'admin@example.test' });
  const clubs = await db
    .insert(schema.club)
    .values([
      { name: 'Demo A', slug: 'a' },
      { name: 'Demo B', slug: 'b' },
    ])
    .returning();
  await db.insert(schema.season).values({ year: 2025 });
  await db
    .insert(schema.clubMembership)
    .values(clubs.map((c) => ({ clubId: c.id, userId: 'admin', role: 'admin' as const })));
  await db.insert(schema.userClubPreference).values({ userId: 'admin', clubId: clubs[1]!.id });
  const data = new FormData();
  data.set('operation', 'create');
  data.set('name', 'Cedar');
  expect(await saveOperation('2025', clubs[0]!.id, {}, data)).toEqual({
    error: 'Your club selection changed. Reload this page before saving.',
  });
  expect(await db.select().from(schema.squad)).toEqual([]);
});

it('returns a useful last-admin correction without persisting a submitted demotion', async () => {
  db = await createTestDb();
  current.db = db;
  await db.insert(schema.users).values({ id: 'admin', email: 'admin@example.test' });
  const [club] = await db.insert(schema.club).values({ name: 'Demo A', slug: 'a' }).returning();
  await db.insert(schema.season).values({ year: 2025 });
  await db
    .insert(schema.clubMembership)
    .values({ clubId: club!.id, userId: 'admin', role: 'admin' });
  const data = new FormData();
  data.set('operation', 'member-role');
  data.set('userId', 'admin');
  data.set('role', 'member');
  expect(await saveOperation('2025', club!.id, {}, data)).toEqual({
    error: 'Assign another active admin first.',
  });
  expect((await db.select().from(schema.clubMembership))[0]?.role).toBe('admin');
});
