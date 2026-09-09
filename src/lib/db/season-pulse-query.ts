import { sql } from 'drizzle-orm';
import type { SeasonPulseInput } from '../season-pulse.ts';
import type { Database } from './index.ts';

export type SeasonPulseDatabase = Pick<Database, 'execute'>;

/**
 * The complete, currently available season for one authenticated Club.
 * `v_rider_result` keeps identity, category, conference and published-result
 * semantics in the normalized reporting seam. This query intentionally has no
 * checkpoint: Season is a frame, and the wall shows every available race in it.
 */
export async function loadSeasonPulseInput(
  db: SeasonPulseDatabase,
  input: { seasonId: number; clubId: number },
): Promise<SeasonPulseInput | null> {
  const [seasonResult, roundsResult, rosterResult] = await Promise.all([
    db.execute(sql`select id from season where id = ${input.seasonId} limit 1`),
    db.execute(sql`
      select r.id, r.ordinal, r.name
        from round r
       where r.season_id = ${input.seasonId}
         and exists (
           select 1 from v_race_result rr
            where rr.season_id = ${input.seasonId} and rr.round_ordinal = r.ordinal
         )
       order by r.ordinal`),
    db.execute(sql`
      select r.id as rider_id, r.display_name as rider_name,
             rr.round_ordinal, rr.source_event_id, rr.category, rr.status, rr.place
        from club_member cm
        join rider r on r.id = cm.rider_id
        left join v_rider_result rr
          on rr.rider_id = r.id and rr.season_id = cm.season_id
       where cm.club_id = ${input.clubId} and cm.season_id = ${input.seasonId}
       order by r.display_name, rr.round_ordinal, rr.source_event_id`),
  ]);
  if (seasonResult.rows.length === 0) return null;

  const rounds = (roundsResult.rows as Record<string, unknown>[]).map((row) => ({
    id: Number(row.id),
    ordinal: Number(row.ordinal),
    name: String(row.name),
  }));
  const availableOrdinals = new Set(rounds.map((round) => round.ordinal));
  const byRider = new Map<
    number,
    { id: number; name: string; category: string | null; latest: number }
  >();
  const results: Array<SeasonPulseInput['results'][number]> = [];
  for (const row of rosterResult.rows as Record<string, unknown>[]) {
    const id = Number(row.rider_id);
    const ordinal = row.round_ordinal === null ? null : Number(row.round_ordinal);
    const entry = byRider.get(id) ?? {
      id,
      name: String(row.rider_name),
      category: null,
      latest: -1,
    };
    if (ordinal !== null && availableOrdinals.has(ordinal)) {
      results.push({
        riderId: id,
        roundOrdinal: ordinal,
        status: row.status === 'dnf' ? 'dnf' : 'finished',
        place: String(row.place),
      });
      if (ordinal >= entry.latest) {
        entry.latest = ordinal;
        entry.category = row.category === null ? null : String(row.category);
      }
    }
    byRider.set(id, entry);
  }
  return { rounds, riders: [...byRider.values()].map(({ latest: _, ...rider }) => rider), results };
}

export type SeasonEvidenceRow = {
  riderId: number | null;
  name: string;
  roundOrdinal: number;
  sourceEventId: string;
  eventName: string;
  category: string;
  conference: string | null;
  place: number | null;
  status: string;
  laps: number | null;
  categoryLaps: number | null;
};
export type SeasonRankField = {
  sourceEventId: string;
  eventName: string;
  roundOrdinal: number;
  category: string;
  conference: string | null;
  finishers: SeasonEvidenceRow[];
  clubRiders: SeasonEvidenceRow[];
};
function evidenceRow(row: Record<string, unknown>): SeasonEvidenceRow {
  const place = String(row.place ?? '').trim();
  return {
    riderId: row.rider_id == null ? null : Number(row.rider_id),
    name: String(row.rider_name ?? row.display_name ?? ''),
    roundOrdinal: Number(row.round_ordinal),
    sourceEventId: String(row.source_event_id),
    eventName: String(row.event_name),
    category: String(row.category),
    conference: row.conference == null ? null : String(row.conference),
    place: /^\d+$/.test(place) && Number(place) > 0 ? Number(place) : null,
    status: String(row.status),
    laps: row.laps == null ? null : Number(row.laps),
    categoryLaps: row.category_laps == null ? null : Number(row.category_laps),
  };
}

/** Read evidence only after the route resolves Club authority. Pick a field
 * from that Club's own results, then retain its complete published peer set. */
export async function loadSeasonWallContext(
  db: SeasonPulseDatabase,
  input: { seasonId: number; clubId: number },
): Promise<{ clubResults: SeasonEvidenceRow[]; field: SeasonRankField | null }> {
  const result = await db.execute(sql`
    select rr.*,r.display_name as rider_name from v_rider_result rr
    join rider r on r.id=rr.rider_id
    where rr.season_id=${input.seasonId} and exists (
      select 1 from club_member cm where cm.club_id=${input.clubId}
      and cm.season_id=rr.season_id and cm.rider_id=rr.rider_id)
    order by rr.round_ordinal desc,rr.source_event_id,rr.category,rr.conference,r.display_name`);
  const clubResults = (result.rows as Record<string, unknown>[]).map(evidenceRow);
  const latest = clubResults[0]?.roundOrdinal;
  if (latest === undefined) return { clubResults, field: null };
  const groups = new Map<string, SeasonEvidenceRow[]>();
  for (const row of clubResults.filter((r) => r.roundOrdinal === latest)) {
    const key = JSON.stringify([row.sourceEventId, row.category, row.conference]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const selected = [...groups.values()].sort(
    (a, b) =>
      Number(b.length >= 2) - Number(a.length >= 2) ||
      Number(/girls/i.test(b[0]!.category)) - Number(/girls/i.test(a[0]!.category)),
  )[0]!;
  const seed = selected[0]!;
  const peers = await db.execute(sql`select * from v_race_result where season_id=${input.seasonId}
    and source_event_id=${seed.sourceEventId} and category=${seed.category}
    and conference is not distinct from ${seed.conference}`);
  const finishers = (peers.rows as Record<string, unknown>[])
    .map(evidenceRow)
    .filter((r) => r.status === 'finished' && r.place !== null)
    .sort((a, b) => a.place! - b.place!);
  return {
    clubResults,
    field: {
      sourceEventId: seed.sourceEventId,
      eventName: seed.eventName,
      roundOrdinal: latest,
      category: seed.category,
      conference: seed.conference,
      finishers,
      clubRiders: selected,
    },
  };
}
