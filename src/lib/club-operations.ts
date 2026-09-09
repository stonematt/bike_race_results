import { sql } from 'drizzle-orm';
import type { Database } from './db/index.ts';
import { AccessDenied, requireClubRole, type AccessDatabase } from './authz/access.ts';
import { slugify } from './slug.ts';

export class SquadOperationError extends Error {}

export type CreateSquadInput = {
  actorId: string;
  clubId: number;
  seasonId: number;
  name: string;
};

/** Actor identity comes from the authenticated request, never a form field. */
export async function createSquad(
  db: Database,
  input: CreateSquadInput,
): Promise<{ id: number; slug: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from club where id = ${input.clubId} for update`);
    await requireClubRole(tx, input.actorId, input.clubId, ['coach', 'admin']);
    const name = input.name.trim();
    const slug = slugify(name);
    if (!slug || name.length > 80)
      throw new SquadOperationError('Use a squad name between 1 and 80 characters.');
    const season = await tx.execute(sql`select id from season where id = ${input.seasonId}`);
    if (season.rows.length !== 1) throw new SquadOperationError('Season unavailable.');
    const result = await tx.execute(sql`
      insert into squad (club_id, season_id, name, slug, created_by_user_id)
      values (${input.clubId}, ${input.seasonId}, ${name}, ${slug}, ${input.actorId})
      returning id`);
    const id = Number(result.rows[0]?.id);
    await tx.execute(
      sql`insert into squad_coach (squad_id, user_id) values (${id}, ${input.actorId})`,
    );
    await tx.execute(sql`
      insert into club_audit_event (club_id, actor_user_id, action, squad_id)
      values (${input.clubId}, ${input.actorId}, 'squad.created', ${id})`);
    return { id, slug };
  });
}

export async function renameSquad(
  db: Database,
  input: SquadActor & { name: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    await requireManagedSquad(tx, input);
    const name = input.name.trim();
    if (!slugify(name) || name.length > 80)
      throw new SquadOperationError('Use a squad name between 1 and 80 characters.');
    await tx.execute(sql`update squad set name = ${name} where id = ${input.squadId}`);
    await tx.execute(sql`insert into club_audit_event (club_id, actor_user_id, action, squad_id)
      values (${input.clubId}, ${input.actorId}, 'squad.renamed', ${input.squadId})`);
  });
}

type SquadActor = { actorId: string; clubId: number; seasonId: number; squadId: number };

async function requireManagedSquad(
  db: AccessDatabase,
  input: SquadActor,
): Promise<{ seasonId: number }> {
  await db.execute(sql`select id from club where id = ${input.clubId} for update`);
  const membership = await requireClubRole(db, input.actorId, input.clubId, ['coach', 'admin']);
  const result = await db.execute(sql`
    select s.season_id, s.created_by_user_id, s.archived_at,
      exists (select 1 from squad_coach sc where sc.squad_id = s.id and sc.user_id = ${input.actorId}) as assigned
    from squad s where s.id = ${input.squadId} and s.club_id = ${input.clubId} and s.season_id = ${input.seasonId}`);
  const squad = result.rows[0];
  if (
    !squad ||
    (membership.role !== 'admin' &&
      squad.created_by_user_id !== input.actorId &&
      squad.assigned !== true)
  ) {
    throw new AccessDenied();
  }
  if (squad.archived_at !== null) throw new SquadOperationError('Archived squads are read-only.');
  return { seasonId: Number(squad.season_id) };
}

export async function archiveSquad(db: Database, input: SquadActor): Promise<void> {
  await db.transaction(async (tx) => {
    await requireManagedSquad(tx, input);
    await tx.execute(
      sql`update squad set archived_at = now(), archived_by_user_id = ${input.actorId} where id = ${input.squadId}`,
    );
    await tx.execute(sql`delete from user_squad_preference where squad_id = ${input.squadId}`);
    await tx.execute(sql`insert into club_audit_event (club_id, actor_user_id, action, squad_id)
      values (${input.clubId}, ${input.actorId}, 'squad.archived', ${input.squadId})`);
  });
}

export async function setSquadRiders(
  db: Database,
  input: SquadActor & { riderIds: number[] },
): Promise<void> {
  await db.transaction(async (tx) => {
    const squad = await requireManagedSquad(tx, input);
    const ids = [...new Set(input.riderIds)];
    if (ids.some((id) => !Number.isSafeInteger(id) || id < 1))
      throw new SquadOperationError('Choose riders from this club’s season roster.');
    if (ids.length > 0) {
      const eligible = await tx.execute(sql`select rider_id from club_member
        where club_id = ${input.clubId} and season_id = ${squad.seasonId}
          and rider_id in (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )})`);
      if (eligible.rows.length !== ids.length)
        throw new SquadOperationError('Choose riders from this club’s season roster.');
    }
    await tx.execute(sql`delete from squad_member where squad_id = ${input.squadId}`);
    for (const riderId of ids) {
      await tx.execute(
        sql`insert into squad_member (squad_id, rider_id) values (${input.squadId}, ${riderId})`,
      );
    }
    await tx.execute(sql`insert into club_audit_event (club_id, actor_user_id, action, squad_id)
      values (${input.clubId}, ${input.actorId}, 'squad.riders-updated', ${input.squadId})`);
  });
}

export async function setPreferredSquad(
  db: Database,
  input: { actorId: string; clubId: number; seasonId: number; squadId: number | null },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from club where id = ${input.clubId} for update`);
    await requireClubRole(tx, input.actorId, input.clubId, ['member', 'coach', 'admin']);
    if (input.squadId === null) {
      await tx.execute(
        sql`delete from user_squad_preference where user_id = ${input.actorId} and club_id = ${input.clubId} and season_id = ${input.seasonId}`,
      );
      return;
    }
    const squad = await tx.execute(sql`select id from squad where id = ${input.squadId}
      and club_id = ${input.clubId} and season_id = ${input.seasonId} and archived_at is null`);
    if (squad.rows.length !== 1)
      throw new SquadOperationError('Choose an active squad from this club and season.');
    await tx.execute(sql`insert into user_squad_preference (user_id, club_id, season_id, squad_id)
      values (${input.actorId}, ${input.clubId}, ${input.seasonId}, ${input.squadId})
      on conflict (user_id, club_id, season_id) do update set squad_id = excluded.squad_id, updated_at = now()`);
  });
}

export async function setSquadAccounts(
  db: Database,
  input: SquadActor & { userIds: string[] },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from club where id = ${input.clubId} for update`);
    await requireClubRole(tx, input.actorId, input.clubId, ['admin']);
    await requireManagedSquad(tx, input);
    const ids = [...new Set(input.userIds)];
    if (ids.length > 0) {
      const eligible =
        await tx.execute(sql`select user_id from club_membership where club_id = ${input.clubId}
        and revoked_at is null and user_id in (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})`);
      if (eligible.rows.length !== ids.length)
        throw new SquadOperationError('Choose active club accounts.');
    }
    await tx.execute(sql`delete from squad_coach where squad_id = ${input.squadId}`);
    for (const userId of ids) {
      await tx.execute(
        sql`insert into squad_coach (squad_id, user_id) values (${input.squadId}, ${userId})`,
      );
    }
    await tx.execute(sql`insert into club_audit_event (club_id, actor_user_id, action, squad_id)
      values (${input.clubId}, ${input.actorId}, 'squad.accounts-updated', ${input.squadId})`);
  });
}
