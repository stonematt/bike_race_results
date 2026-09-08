import { sql } from 'drizzle-orm';
import type { Database } from './db/index.ts';
import { requireClubRole, type ClubRole } from './authz/access.ts';

export type ManagedSquad = {
  id: number;
  name: string;
  slug: string;
  archived: boolean;
  canManage: boolean;
  riderIds: number[];
  accountIds: string[];
};
export type ClubOperations = {
  role: ClubRole;
  squads: ManagedSquad[];
  riders: { id: number; name: string }[];
  preferredSquadId: number | null;
  accounts: { id: string; name: string; email: string; role: ClubRole; revoked: boolean }[];
  invitations: {
    id: number;
    email: string;
    role: ClubRole;
    squadId: number | null;
    expiresAt: string;
    status: 'pending' | 'accepted' | 'revoked' | 'expired';
  }[];
};

export async function loadClubOperations(
  db: Database,
  input: { actorId: string; clubId: number; seasonId: number },
): Promise<ClubOperations> {
  const membership = await requireClubRole(db, input.actorId, input.clubId, [
    'member',
    'coach',
    'admin',
  ]);
  const squads = await db.execute(sql`
    select s.id, s.name, s.slug, s.archived_at, s.created_by_user_id,
      exists (select 1 from squad_coach sc where sc.squad_id = s.id and sc.user_id = ${input.actorId}) as assigned
    from squad s where s.club_id = ${input.clubId} and s.season_id = ${input.seasonId}
    order by s.archived_at nulls first, s.name, s.id`);
  const roster =
    await db.execute(sql`select r.id, r.display_name from rider r join club_member cm on cm.rider_id = r.id
    where cm.club_id = ${input.clubId} and cm.season_id = ${input.seasonId} order by r.display_name, r.id`);
  const riderAssignments =
    await db.execute(sql`select sm.squad_id, sm.rider_id from squad_member sm join squad s on s.id = sm.squad_id
    where s.club_id = ${input.clubId} and s.season_id = ${input.seasonId} order by sm.rider_id`);
  const accountAssignments =
    membership.role === 'admin'
      ? await db.execute(sql`select sc.squad_id, sc.user_id from squad_coach sc join squad s on s.id = sc.squad_id
    join club_membership m on m.user_id = sc.user_id and m.club_id = s.club_id and m.revoked_at is null
    where s.club_id = ${input.clubId} and s.season_id = ${input.seasonId} order by sc.user_id`)
      : { rows: [] };
  const preferences =
    await db.execute(sql`select p.squad_id from user_squad_preference p join squad s on s.id = p.squad_id
    where p.user_id = ${input.actorId} and p.club_id = ${input.clubId} and p.season_id = ${input.seasonId}
      and s.club_id = p.club_id and s.season_id = p.season_id and s.archived_at is null`);
  const accounts =
    membership.role === 'admin'
      ? await db.execute(sql`select u.id, u.name, u.email, m.role, m.revoked_at
    from club_membership m join "user" u on u.id = m.user_id where m.club_id = ${input.clubId} order by u.email`)
      : { rows: [] };
  const invitations =
    membership.role === 'admin'
      ? await db.execute(sql`select id, email_normalized, role, squad_id, expires_at,
    case when accepted_at is not null then 'accepted' when revoked_at is not null then 'revoked'
      when expires_at <= now() then 'expired' else 'pending' end as status
    from club_invitation where club_id = ${input.clubId} order by created_at desc, id desc`)
      : { rows: [] };
  return {
    role: membership.role,
    squads: squads.rows.map((s) => ({
      id: Number(s.id),
      name: String(s.name),
      slug: String(s.slug),
      archived: s.archived_at !== null,
      canManage:
        s.archived_at === null &&
        (membership.role === 'admin' ||
          (membership.role === 'coach' &&
            (s.created_by_user_id === input.actorId || s.assigned === true))),
      riderIds: riderAssignments.rows
        .filter((r) => Number(r.squad_id) === Number(s.id))
        .map((r) => Number(r.rider_id)),
      accountIds: accountAssignments.rows
        .filter((r) => Number(r.squad_id) === Number(s.id))
        .map((r) => String(r.user_id)),
    })),
    riders: roster.rows.map((r) => ({ id: Number(r.id), name: String(r.display_name) })),
    preferredSquadId: preferences.rows[0] ? Number(preferences.rows[0].squad_id) : null,
    accounts: accounts.rows.map((a) => ({
      id: String(a.id),
      name: a.name ? String(a.name) : '',
      email: String(a.email),
      role: a.role as ClubRole,
      revoked: a.revoked_at !== null,
    })),
    invitations: invitations.rows.map((i) => ({
      id: Number(i.id),
      email: String(i.email_normalized),
      role: i.role as ClubRole,
      squadId: i.squad_id === null ? null : Number(i.squad_id),
      expiresAt: new Date(String(i.expires_at)).toISOString(),
      status: i.status as ClubOperations['invitations'][number]['status'],
    })),
  };
}
