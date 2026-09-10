import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '@/lib/db/schema.ts';
import { createTestDb } from '@/lib/db/testing.ts';

/**
 * The sign-in page now hands an authenticated visitor straight to the root, and
 * the root hands the session to this helper. That makes these four outcomes the
 * far side of the redirect: whatever `/signin` stops doing, a revoked member
 * still lands on the unavailable notice and a multi-club member still chooses.
 * Pinned here so a routing change on either end cannot quietly widen access.
 */

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const { requireClubContext } = await import('./club-context.ts');

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(schema.club).values([
    { id: 1, name: 'Cedar Club', slug: 'cedar' },
    { id: 2, name: 'Summit Club', slug: 'summit' },
  ]);
  await db.insert(schema.users).values({ id: 'member', email: 'member@example.test' });
});

afterEach(async () => {
  await db.$client.close();
});

it('sends a request carrying no user id back to sign-in', async () => {
  await expect(requireClubContext(db, undefined)).rejects.toThrow('redirect:/signin');
});

it('releases the sole active membership', async () => {
  await db.insert(schema.clubMembership).values({ clubId: 1, userId: 'member', role: 'coach' });
  await expect(requireClubContext(db, 'member')).resolves.toMatchObject({
    clubId: 1,
    role: 'coach',
  });
});

it('sends a revoked member to the unavailable notice rather than into a club', async () => {
  await db.insert(schema.clubMembership).values({ clubId: 1, userId: 'member', role: 'coach' });
  await db
    .update(schema.clubMembership)
    .set({ revokedAt: new Date('2026-09-08T00:00:00.000Z') })
    .where(eq(schema.clubMembership.userId, 'member'));

  await expect(requireClubContext(db, 'member')).rejects.toThrow('redirect:/access-unavailable');
});

it('sends a member of several clubs to the club choice', async () => {
  await db.insert(schema.clubMembership).values([
    { clubId: 1, userId: 'member', role: 'coach' },
    { clubId: 2, userId: 'member', role: 'member' },
  ]);

  await expect(requireClubContext(db, 'member')).rejects.toThrow('redirect:/clubs');
});
