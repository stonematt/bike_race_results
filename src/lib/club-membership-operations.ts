import { createHash, randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from './db/index.ts';
import { schema } from './db/index.ts';
import { AccessDenied, requireClubRole, type ClubRole } from './authz/access.ts';

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/u;
const BASIC_EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+$/u;

export type CreateClubInvitationInput = {
  actorId: string;
  clubId: number;
  email: string;
  role: ClubRole;
  squadId?: number;
};

export type InvitationReceipt = {
  id: number;
  /** Returned once for a later delivery boundary; never persisted. */
  token: string;
  expiresAt: Date;
};

/**
 * A deliberately non-specific rejection for missing, expired, consumed, or
 * malformed invitation state. Callers may show it without exposing token facts.
 * Authorization failures stay `AccessDenied` from `authz/access`.
 */
export class InvitationRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvitationRejected';
  }
}

function normalizedEmail(email: string): string {
  if (CONTROL_CHARACTER.test(email)) throw new InvitationRejected('Invitation email is invalid.');
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new InvitationRejected('Invitation email is required.');
  if (!BASIC_EMAIL_ADDRESS.test(normalized)) {
    throw new InvitationRejected('Invitation email is invalid.');
  }
  return normalized;
}

function validRole(role: string): role is ClubRole {
  return role === 'member' || role === 'coach' || role === 'admin';
}

/** Issues a single-use receipt; only the SHA-256 digest enters the database. */
export async function createClubInvitation(
  db: Database,
  input: CreateClubInvitationInput,
): Promise<InvitationReceipt> {
  const emailNormalized = normalizedEmail(input.email);
  if (!validRole(input.role)) throw new InvitationRejected('Invitation role is invalid.');

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);

  return db.transaction(async (tx) => {
    const club = await tx.execute(sql`select id from club where id = ${input.clubId} for update`);
    if (club.rows.length !== 1) throw new AccessDenied();
    await requireClubRole(tx, input.actorId, input.clubId, ['admin']);
    if (input.squadId !== undefined) {
      const squad = await tx.execute(sql`
        select id from squad
        where id = ${input.squadId}
          and club_id = ${input.clubId}
          and archived_at is null`);
      if (squad.rows.length !== 1) throw new InvitationRejected('Invitation squad is unavailable.');
    }

    const [invitation] = await tx
      .insert(schema.clubInvitation)
      .values({
        clubId: input.clubId,
        emailNormalized,
        role: input.role,
        squadId: input.squadId,
        tokenHash,
        expiresAt,
        createdByUserId: input.actorId,
      })
      .returning();
    if (!invitation) throw new InvitationRejected('Invitation could not be created.');
    await tx.execute(sql`
      insert into club_audit_event (club_id, actor_user_id, action, invitation_id)
      values (${input.clubId}, ${input.actorId}, 'invitation.created', ${invitation.id})`);

    return { id: invitation.id, token, expiresAt };
  });
}

export type RevokeClubInvitationInput = {
  actorId: string;
  clubId: number;
  invitationId: number;
};

/** Invalidates an unaccepted token; it never changes a membership. */
export async function revokeClubInvitation(
  db: Database,
  input: RevokeClubInvitationInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const club = await tx.execute(sql`select id from club where id = ${input.clubId} for update`);
    if (club.rows.length !== 1) throw new AccessDenied();
    await requireClubRole(tx, input.actorId, input.clubId, ['admin']);

    const locked = await tx.execute(sql`
      select id, accepted_at, revoked_at from club_invitation
      where id = ${input.invitationId} and club_id = ${input.clubId}
      for update`);
    const invitation = locked.rows[0] as Record<string, unknown> | undefined;
    if (!invitation || invitation.accepted_at !== null || invitation.revoked_at !== null) {
      throw new InvitationRejected('Invitation is unavailable.');
    }

    const now = new Date();
    await tx
      .update(schema.clubInvitation)
      .set({ revokedAt: now })
      .where(
        and(
          eq(schema.clubInvitation.id, input.invitationId),
          eq(schema.clubInvitation.clubId, input.clubId),
        ),
      );
    await tx.execute(sql`
      insert into club_audit_event (club_id, actor_user_id, action, invitation_id)
      values (${input.clubId}, ${input.actorId}, 'invitation.revoked', ${input.invitationId})`);
  });
}

export type ChangeClubMembershipRoleInput = {
  actorId: string;
  clubId: number;
  userId: string;
  role: ClubRole;
};

/** A requested existing-member operation cannot be completed safely. */
export class MembershipOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MembershipOperationError';
  }
}

/** Changes an already-active club membership; this command never creates one. */
export async function changeClubMembershipRole(
  db: Database,
  input: ChangeClubMembershipRoleInput,
): Promise<void> {
  if (!validRole(input.role)) throw new MembershipOperationError('Membership role is invalid.');

  await db.transaction(async (tx) => {
    const club = await tx.execute(sql`select id from club where id = ${input.clubId} for update`);
    if (club.rows.length !== 1) throw new AccessDenied();
    await requireClubRole(tx, input.actorId, input.clubId, ['admin']);

    const locked = await tx.execute(sql`
      select role, revoked_at from club_membership
      where club_id = ${input.clubId} and user_id = ${input.userId}
      for update`);
    const membership = locked.rows[0] as Record<string, unknown> | undefined;
    if (!membership || membership.revoked_at !== null) {
      throw new MembershipOperationError('Active club membership is required.');
    }
    if (membership.role === input.role) return;
    if (membership.role === 'admin' && input.role !== 'admin') {
      const activeAdmins = await tx.execute(sql`
        select count(*) as count from club_membership
        where club_id = ${input.clubId} and role = 'admin' and revoked_at is null`);
      if (Number((activeAdmins.rows[0] as Record<string, unknown> | undefined)?.count) <= 1) {
        throw new MembershipOperationError('A club must keep one active admin.');
      }
    }

    await tx
      .update(schema.clubMembership)
      .set({ role: input.role, updatedAt: new Date() })
      .where(
        and(
          eq(schema.clubMembership.clubId, input.clubId),
          eq(schema.clubMembership.userId, input.userId),
        ),
      );
    await tx.execute(sql`
      insert into club_audit_event (club_id, actor_user_id, action, subject_user_id)
      values (${input.clubId}, ${input.actorId}, 'membership.role-changed', ${input.userId})`);
  });
}

export type RevokeClubMembershipInput = {
  actorId: string;
  clubId: number;
  userId: string;
};

/** Revokes an already-active membership; it never creates or reactivates one. */
export async function revokeClubMembership(
  db: Database,
  input: RevokeClubMembershipInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const club = await tx.execute(sql`select id from club where id = ${input.clubId} for update`);
    if (club.rows.length !== 1) throw new AccessDenied();
    await requireClubRole(tx, input.actorId, input.clubId, ['admin']);

    const locked = await tx.execute(sql`
      select role, revoked_at from club_membership
      where club_id = ${input.clubId} and user_id = ${input.userId}
      for update`);
    const membership = locked.rows[0] as Record<string, unknown> | undefined;
    if (!membership || membership.revoked_at !== null) {
      throw new MembershipOperationError('Active club membership is required.');
    }
    if (membership.role === 'admin') {
      const activeAdmins = await tx.execute(sql`
        select count(*) as count from club_membership
        where club_id = ${input.clubId} and role = 'admin' and revoked_at is null`);
      if (Number((activeAdmins.rows[0] as Record<string, unknown> | undefined)?.count) <= 1) {
        throw new MembershipOperationError('A club must keep one active admin.');
      }
    }

    await tx
      .update(schema.clubMembership)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.clubMembership.clubId, input.clubId),
          eq(schema.clubMembership.userId, input.userId),
        ),
      );
    await tx.execute(sql`
      insert into club_audit_event (club_id, actor_user_id, action, subject_user_id)
      values (${input.clubId}, ${input.actorId}, 'membership.revoked', ${input.userId})`);
  });
}
