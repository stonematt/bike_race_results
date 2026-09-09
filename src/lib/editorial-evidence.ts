import { createHash } from 'node:crypto';
import { decodeIndividualFlat } from './ingest/decode.ts';
import { assignFamily, INDIVIDUAL_FLAT } from './ingest/families.ts';
import { dataDepth, readListLayout, type ListPayload } from './ingest/rows.ts';
import { sql } from 'drizzle-orm';
import type { AnyDatabase } from './db/editorial-query.ts';

export type StoryCandidateInput = {
  actorId: string;
  clubId: number;
  seasonId: number;
  checkpointOrdinal: number;
  eventId: number;
};

export type StoryCandidate = {
  template: 'club-starts-at-event';
  clubId: number;
  season: { id: number; year: number };
  checkpoint: { kind: 'through'; ordinal: number };
  event: {
    id: number;
    sourceEventId: string;
    name: string;
    conference: string | null;
    round: { id: number; ordinal: number; name: string };
  };
  count: number;
  source: { rawFetchId: number; contentHash: string; listId: string; hidden: boolean };
  fingerprint: string;
};

export type StoryCandidateResult =
  | { kind: 'available'; candidate: StoryCandidate }
  | {
      kind: 'unavailable';
      reason:
        | 'missing-event'
        | 'access-denied'
        | 'invalid-checkpoint'
        | 'missing-season'
        | 'season-mismatch'
        | 'after-checkpoint'
        | 'missing-source'
        | 'invalid-source'
        | 'inconsistent-coverage'
        | 'zero-starts'
        | 'invalid-input';
    };

/**
 * Auth-scoped evidence for the identity-free club-starts-at-event template.
 *
 * Membership, calendar scope, resolved count, complete normalized plate set
 * and bound raw list are read in one SQL statement. The decoder works only on
 * that snapshot: a later archive or normalization cannot mix count and source.
 * Raw cells and plate identities never leave this server-side query.
 *
 * Fingerprints cover the entire displayed evidence object, including current
 * roster count and Event labels. They express evidence equality, not authority
 * or proof that normalization cannot commit immediately after this read.
 */
export async function loadStoryCandidate(
  db: AnyDatabase,
  input: StoryCandidateInput,
): Promise<StoryCandidateResult> {
  if (
    typeof input.actorId !== 'string' ||
    input.actorId.trim() === '' ||
    ![input.clubId, input.seasonId, input.eventId].every(
      (id) => Number.isInteger(id) && id > 0 && id <= 2147483647,
    )
  ) {
    return { kind: 'unavailable', reason: 'invalid-input' };
  }
  const checkpointValid =
    Number.isSafeInteger(input.checkpointOrdinal) &&
    input.checkpointOrdinal >= 0 &&
    input.checkpointOrdinal <= 2147483647;
  const result = await db.execute(sql`
    select authority.allowed,
           exists (select 1 from season where id = ${input.seasonId}) as season_exists,
           exists (select 1 from round cp where cp.season_id = ${input.seasonId}
             and cp.ordinal = ${checkpointValid ? input.checkpointOrdinal : null}) as checkpoint_exists, e.id, e.source_event_id, e.name, e.conference,
           r.id as round_id, r.ordinal, r.name as round_name,
           s.id as season_id, s.year,
           b.raw_fetch_id, b.list_id, b.hidden, f.content_hash,
           f.payload,
           array(select ir.plate from individual_result ir where ir.event_id = e.id order by ir.plate) as plates,
           f.event_id as raw_event_id, f.season as raw_season, f.list_id as raw_list_id,
           (select count(distinct rr.rider_id) from v_rider_result rr
             join club_member cm on cm.rider_id = rr.rider_id
              and cm.club_id = ${input.clubId} and cm.season_id = ${input.seasonId}
             where rr.event_id = e.id and rr.season_id = ${input.seasonId}) as starts
      from (select exists (select 1 from club_membership m
        where m.club_id = ${input.clubId} and m.user_id = ${input.actorId}
          and m.revoked_at is null and m.role in ('member', 'coach', 'admin')) as allowed) authority
      left join event e on e.id = ${input.eventId} and authority.allowed
      left join round r on r.id = e.round_id
      left join season s on s.id = r.season_id
      left join event_result_source b on b.event_id = e.id
      left join raw_fetch f on f.id = b.raw_fetch_id
     `);
  const row = result.rows[0];
  if (!row || row.allowed !== true) return { kind: 'unavailable', reason: 'access-denied' };
  if (row.season_exists !== true) return { kind: 'unavailable', reason: 'missing-season' };
  if (!checkpointValid || row.checkpoint_exists !== true)
    return { kind: 'unavailable', reason: 'invalid-checkpoint' };
  if (row.id === null) return { kind: 'unavailable', reason: 'missing-event' };
  if (Number(row.season_id) !== input.seasonId)
    return { kind: 'unavailable', reason: 'season-mismatch' };
  if (Number(row.ordinal) > input.checkpointOrdinal)
    return { kind: 'unavailable', reason: 'after-checkpoint' };
  if (row.raw_fetch_id === null || row.content_hash === null)
    return { kind: 'unavailable', reason: 'missing-source' };
  if (
    row.raw_event_id !== row.source_event_id ||
    Number(row.raw_season) !== Number(row.year) ||
    row.raw_list_id !== row.list_id
  )
    return { kind: 'unavailable', reason: 'invalid-source' };
  let sourcePlates: string[];
  try {
    if (row.payload === null || typeof row.payload !== 'object')
      return { kind: 'unavailable', reason: 'invalid-source' };
    const payload = row.payload as ListPayload;
    const where = 'story evidence selected list';
    const { family, variant } = assignFamily(
      where,
      readListLayout(where, payload),
      dataDepth(payload.data),
    );
    if (family !== INDIVIDUAL_FLAT) return { kind: 'unavailable', reason: 'invalid-source' };
    sourcePlates = decodeIndividualFlat(where, variant, payload)
      .rows.map((result) => result.plate)
      .sort();
  } catch {
    // Decoder errors can contain source cells. Never return or log them.
    return { kind: 'unavailable', reason: 'invalid-source' };
  }
  const normalizedPlates = (row.plates as string[]).sort();
  if (
    sourcePlates.length !== normalizedPlates.length ||
    sourcePlates.some((plate, index) => plate !== normalizedPlates[index])
  )
    return { kind: 'unavailable', reason: 'inconsistent-coverage' };
  if (Number(row.starts) === 0) return { kind: 'unavailable', reason: 'zero-starts' };
  const evidence: Omit<StoryCandidate, 'fingerprint'> = {
    template: 'club-starts-at-event',
    clubId: input.clubId,
    season: { id: Number(row.season_id), year: Number(row.year) },
    checkpoint: { kind: 'through', ordinal: input.checkpointOrdinal },
    event: {
      id: Number(row.id),
      sourceEventId: String(row.source_event_id),
      name: String(row.name),
      conference: row.conference === null ? null : String(row.conference),
      round: {
        id: Number(row.round_id),
        ordinal: Number(row.ordinal),
        name: String(row.round_name),
      },
    },
    count: Number(row.starts),
    source: {
      rawFetchId: Number(row.raw_fetch_id),
      contentHash: String(row.content_hash),
      listId: String(row.list_id),
      hidden: row.hidden === true,
    },
  };
  return {
    kind: 'available',
    candidate: {
      ...evidence,
      fingerprint: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
    },
  };
}
