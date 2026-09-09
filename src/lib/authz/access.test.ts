import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '../db/schema.ts';
import { createTestDb } from '../db/testing.ts';
import {
  AccessDenied,
  canStartEmailSignIn,
  requireClubRole,
  resolveSelectedClub,
  selectClub,
} from './access.ts';

describe('requireClubRole', () => {
  it('denies a legacy coach in a single-club installation without an active membership', async () => {
    const db = await createTestDb();
    await db.insert(schema.club).values({ id: 1, name: 'Cedar Club', slug: 'cedar' });
    await db.insert(schema.users).values({ id: 'legacy-coach', email: 'legacy@example.test' });
    await db.insert(schema.coach).values({
      userId: 'legacy-coach',
      clubId: 1,
      displayName: 'Legacy coach',
    });

    await expect(requireClubRole(db, 'legacy-coach', 1, ['member'])).rejects.toBeInstanceOf(
      AccessDenied,
    );
  });

  it('denies a revoked member on the next access check', async () => {
    const db = await createTestDb();
    await db.insert(schema.club).values({ id: 1, name: 'Cedar Club', slug: 'cedar' });
    await db.insert(schema.users).values({ id: 'member', email: 'member@example.test' });
    await db.insert(schema.clubMembership).values({
      clubId: 1,
      userId: 'member',
      role: 'member',
    });

    await expect(requireClubRole(db, 'member', 1, ['member'])).resolves.toMatchObject({
      clubId: 1,
      role: 'member',
    });

    await db
      .update(schema.clubMembership)
      .set({ revokedAt: new Date('2026-09-08T00:00:00.000Z') })
      .where(eq(schema.clubMembership.userId, 'member'));

    await expect(requireClubRole(db, 'member', 1, ['member'])).rejects.toBeInstanceOf(AccessDenied);
  });

  it('selects a sole active membership without consulting legacy coach state', async () => {
    const db = await createTestDb();
    await db.insert(schema.club).values({ id: 1, name: 'Cedar Club', slug: 'cedar' });
    await db.insert(schema.users).values({ id: 'member', email: 'member@example.test' });
    await db.insert(schema.clubMembership).values({
      clubId: 1,
      userId: 'member',
      role: 'coach',
    });

    await expect(resolveSelectedClub(db, 'member')).resolves.toEqual({
      kind: 'selected',
      membership: {
        userId: 'member',
        clubId: 1,
        clubName: 'Cedar Club',
        role: 'coach',
      },
    });
  });

  it('uses a saved preference only when it names one of the user’s active memberships', async () => {
    const db = await createTestDb();
    await db.insert(schema.club).values([
      { id: 1, name: 'Cedar Club', slug: 'cedar' },
      { id: 2, name: 'Summit Club', slug: 'summit' },
    ]);
    await db.insert(schema.users).values({ id: 'member', email: 'member@example.test' });
    await db.insert(schema.clubMembership).values([
      { clubId: 1, userId: 'member', role: 'member' },
      { clubId: 2, userId: 'member', role: 'admin' },
    ]);
    await db.insert(schema.userClubPreference).values({ userId: 'member', clubId: 2 });

    await expect(resolveSelectedClub(db, 'member')).resolves.toEqual({
      kind: 'selected',
      membership: {
        userId: 'member',
        clubId: 2,
        clubName: 'Summit Club',
        role: 'admin',
      },
    });
  });

  it('saves an active member’s selected club and rejects a forged club choice', async () => {
    const db = await createTestDb();
    await db.insert(schema.club).values([
      { id: 1, name: 'Cedar Club', slug: 'cedar' },
      { id: 2, name: 'Summit Club', slug: 'summit' },
    ]);
    await db.insert(schema.users).values({ id: 'member', email: 'member@example.test' });
    await db.insert(schema.clubMembership).values({
      clubId: 1,
      userId: 'member',
      role: 'member',
    });

    await expect(selectClub(db, 'member', 2)).rejects.toBeInstanceOf(AccessDenied);
    await selectClub(db, 'member', 1);
    await expect(resolveSelectedClub(db, 'member')).resolves.toMatchObject({
      kind: 'selected',
      membership: { clubId: 1 },
    });
  });
});

describe('canStartEmailSignIn', () => {
  it('allows an active member’s normalized email and refuses an unrelated address', async () => {
    const db = await createTestDb();
    await db.insert(schema.club).values({ id: 1, name: 'Cedar Club', slug: 'cedar' });
    await db.insert(schema.users).values({ id: 'member', email: 'Member@Example.Test' });
    await db.insert(schema.clubMembership).values({
      clubId: 1,
      userId: 'member',
      role: 'member',
    });

    await expect(canStartEmailSignIn(db, ' member@example.test ')).resolves.toBe(true);
    await expect(canStartEmailSignIn(db, 'stranger@example.test')).resolves.toBe(false);
  });

  it('allows a live invitation email before it has an active membership', async () => {
    const db = await createTestDb();
    await db.insert(schema.club).values({ id: 1, name: 'Cedar Club', slug: 'cedar' });
    await db.insert(schema.users).values({ id: 'admin', email: 'admin@example.test' });
    await db.insert(schema.clubInvitation).values({
      clubId: 1,
      emailNormalized: 'invitee@example.test',
      role: 'member',
      tokenHash: 'synthetic-token-hash',
      expiresAt: new Date('2026-09-15T00:00:00.000Z'),
      createdByUserId: 'admin',
    });

    await expect(canStartEmailSignIn(db, 'INVITEE@example.test')).resolves.toBe(true);
  });
});
