import { sql } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { normalizeEmail } from '../email-address.ts';

export type ClubRole = 'member' | 'coach' | 'admin';

export type ActiveMembership = {
  userId: string;
  clubId: number;
  clubName: string;
  role: ClubRole;
};

export type ClubSelection =
  | { kind: 'none' }
  | { kind: 'selected'; membership: ActiveMembership }
  | { kind: 'choose'; memberships: ActiveMembership[] };

export type AccessDatabase = Pick<Database, 'execute'>;

export class AccessDenied extends Error {
  constructor() {
    super('Active club membership required.');
    this.name = 'AccessDenied';
  }
}

type Row = Record<string, unknown>;

/** A `club_role` value read from the database, or a throw if it is not one. */
export function parseClubRole(value: unknown): ClubRole {
  if (value === 'member' || value === 'coach' || value === 'admin') return value;
  throw new Error('Database returned an invalid club role.');
}

/** A member may request a magic link; proof still happens in the provider. */
export async function canStartEmailSignIn(db: AccessDatabase, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const result = await db.execute(sql`
    select (
      exists (
        select 1
          from "user" u
          join club_membership m on m.user_id = u.id
         where lower(btrim(u.email)) = ${normalized}
           and m.revoked_at is null
      )
      or exists (
        select 1
          from club_invitation i
         where i.email_normalized = ${normalized}
           and i.expires_at > now()
           and i.accepted_at is null
           and i.revoked_at is null
      )
    ) as allowed`);
  return (result.rows[0] as Row | undefined)?.allowed === true;
}

export async function readActiveMemberships(
  db: AccessDatabase,
  userId: string,
): Promise<ActiveMembership[]> {
  const result = await db.execute(sql`
    select m.user_id, m.club_id, m.role, c.name as club_name
     from club_membership m
      join club c on c.id = m.club_id
     where m.user_id = ${userId}
       and m.revoked_at is null
     order by c.name, m.club_id`);

  return (result.rows as Row[]).map((row) => ({
    userId: String(row.user_id),
    clubId: Number(row.club_id),
    clubName: String(row.club_name),
    role: parseClubRole(row.role),
  }));
}

export async function resolveSelectedClub(
  db: AccessDatabase,
  userId: string,
): Promise<ClubSelection> {
  const memberships = await readActiveMemberships(db, userId);
  if (memberships.length === 0) return { kind: 'none' };
  if (memberships.length === 1) return { kind: 'selected', membership: memberships[0]! };

  const preference = await db.execute(sql`
    select club_id from user_club_preference where user_id = ${userId}`);
  const preferredClubId = Number((preference.rows[0] as Row | undefined)?.club_id);
  const preferred = memberships.find((membership) => membership.clubId === preferredClubId);
  if (preferred !== undefined) return { kind: 'selected', membership: preferred };

  return { kind: 'choose', memberships };
}

export async function requireClubRole(
  db: AccessDatabase,
  userId: string,
  clubId: number,
  allowedRoles: readonly ClubRole[],
): Promise<ActiveMembership> {
  const membership = (await readActiveMemberships(db, userId)).find(
    (candidate) => candidate.clubId === clubId,
  );
  if (membership === undefined || !allowedRoles.includes(membership.role)) {
    throw new AccessDenied();
  }
  return membership;
}

/**
 * Persist a navigation choice only after checking it is an active membership.
 * The row is a preference, never an authorization claim: every protected read
 * still calls `resolveSelectedClub` and re-reads active memberships.
 */
export async function selectClub(db: Database, userId: string, clubId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from club where id = ${clubId} for update`);
    await requireClubRole(tx, userId, clubId, ['member', 'coach', 'admin']);
    await tx.execute(sql`
      insert into user_club_preference (user_id, club_id)
      values (${userId}, ${clubId})
      on conflict (user_id) do update
        set club_id = excluded.club_id, updated_at = now()`);
  });
}
