/**
 * Checkpoint-bounded Club and Squad roster reads for the editorial roster.
 */

import { sql } from 'drizzle-orm';
import type { SquadRef, SeasonRef } from '../../app/[season]/query.ts';
import type {
  AnyDatabase,
  Checkpoint,
  DispatchRound,
  RiderEventResult,
} from './editorial-query.ts';
import { loadSeasonDispatch, riderEventResultFromViewRow } from './editorial-query.ts';

export type EditorialRosterInput = {
  seasonId: number;
  /** Auth-resolved. The roster never substitutes a Club from a user id. */
  clubId: number;
  /** Optional exact Squad scope, constrained to this Club and Season. */
  squadId?: number;
  checkpoint?: Checkpoint;
};

export type EditorialRosterRider = {
  id: number;
  name: string;
  /** Latest included Event's category, or null when the Rider has no result. */
  category: string | null;
  results: RiderEventResult[];
};

export type EditorialRoster = {
  season: SeasonRef;
  checkpoint: Checkpoint;
  squad: SquadRef | null;
  rounds: DispatchRound[];
  riders: EditorialRosterRider[];
};

export async function loadEditorialRoster(
  db: AnyDatabase,
  input: EditorialRosterInput,
): Promise<EditorialRoster | null> {
  const dispatch = await loadSeasonDispatch(db, {
    seasonId: input.seasonId,
    clubId: input.clubId,
    userId: null,
    checkpoint: input.checkpoint,
  });
  if (dispatch === null) return null;

  let squad: SquadRef | null = null;
  if (input.squadId !== undefined) {
    const squadResult = await db.execute(sql`
      select id, name, slug from squad
       where id = ${input.squadId}
         and club_id = ${input.clubId}
         and season_id = ${input.seasonId}
       limit 1`);
    const row = squadResult.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    squad = { id: Number(row.id), name: String(row.name), slug: String(row.slug) };
  }

  const checkpointFilter =
    dispatch.checkpoint.kind === 'through'
      ? sql`and rr.round_ordinal <= ${dispatch.checkpoint.ordinal}`
      : sql`and false`;
  const squadJoin =
    squad === null
      ? sql``
      : sql`join squad_member sm on sm.rider_id = r.id and sm.squad_id = ${squad.id}`;
  const result = await db.execute(sql`
    select r.id as roster_rider_id, r.display_name as roster_rider_name, rr.*
      from club_member cm
      join rider r on r.id = cm.rider_id
      ${squadJoin}
      left join v_rider_result rr
        on rr.rider_id = r.id
       and rr.season_id = cm.season_id
       ${checkpointFilter}
     where cm.club_id = ${input.clubId}
       and cm.season_id = ${input.seasonId}
     order by r.display_name, rr.round_ordinal, rr.source_event_id, rr.category, rr.conference nulls first`);

  type RosterEntry = { id: number; name: string; results: RiderEventResult[] };
  const byRider = new Map<number, RosterEntry>();
  for (const row of result.rows as Record<string, unknown>[]) {
    const id = Number(row.roster_rider_id);
    const entry = byRider.get(id) ?? {
      id,
      name: String(row.roster_rider_name),
      results: [],
    };
    if (row.event_id !== null && row.event_id !== undefined) {
      entry.results.push(riderEventResultFromViewRow(row));
    }
    byRider.set(id, entry);
  }

  const riders = [...byRider.values()].map((entry) => {
    const latest = [...entry.results].sort(
      (a, b) =>
        b.race.roundOrdinal - a.race.roundOrdinal ||
        a.race.sourceEventId.localeCompare(b.race.sourceEventId),
    )[0];
    return {
      ...entry,
      // A split latest Round is made deterministic by source event id. Every
      // result remains above, so this compact qualifier never drops evidence.
      category: latest?.result.category ?? null,
    };
  });

  return {
    season: dispatch.season,
    checkpoint: dispatch.checkpoint,
    squad,
    rounds: dispatch.schedule.kind === 'available' ? dispatch.schedule.rounds : [],
    riders,
  };
}
