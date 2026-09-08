/**
 * Checkpoint-bounded reporting reads for the editorial season dispatch.
 *
 * The caller resolves authentication and Club scope before this module runs.
 * These reads never infer a Club from a user id, and a Start is counted from
 * the Club's season roster rather than by summing its overlapping Squads.
 */

import { sql } from 'drizzle-orm';
import type { SquadRef, SeasonRef } from '../../app/[season]/query.ts';
import type { RaceHeader } from '../../app/races/[eventId]/query.ts';
import { parseTimeSeconds } from '../ingest/decode.ts';
import { categoryRank } from '../category-order.ts';
import { compareByPlace, outsideFor, type RaceResultRow } from '../../components/race-detail.ts';
import type { FieldMark, OutsideMark } from '../../components/field-strip.ts';
import type { CategoryFieldScope } from '../category.ts';
import type { Database } from './index.ts';

export type AnyDatabase = Pick<Database, 'execute'>;

export type Checkpoint = { kind: 'through'; ordinal: number } | { kind: 'none' };

export type ResultAvailability = 'after-checkpoint' | 'unpublished' | 'partial' | 'published';

export type DispatchRound = {
  round: { id: number; ordinal: number; name: string };
  events: { sourceEventId: string; name: string; conference: string | null }[];
  availability: ResultAvailability;
  /** Null means results are not available at this checkpoint; zero is published fact. */
  clubStarts: number | null;
  /** Null when results are not available at this checkpoint. */
  firstRecordedStarts: number | null;
};

export type SeasonDispatch = {
  season: SeasonRef;
  checkpoint: Checkpoint;
  schedule: { kind: 'unavailable' } | { kind: 'available'; rounds: DispatchRound[] };
  personalSquad: SquadRef | null;
  availableSquads: SquadRef[];
};

export type SeasonDispatchInput = {
  seasonId: number;
  /** Auth-resolved. This query never substitutes a Club from `userId`. */
  clubId: number;
  /** Used only to find this caller's already-authorized Squad entries. */
  userId: string | null;
  /** Omit to use the latest Round that has published results in this Season. */
  checkpoint?: Checkpoint;
};

/** The source contest boundary. Conference stays part of a combined Event key. */
export type RaceCategoryKey = {
  eventId: number;
  category: string;
  conference: string | null;
};

export type ClubRaceRider = { riderId: number; name: string; row: RaceResultRow };

export type RaceCategory = {
  key: RaceCategoryKey;
  scope: CategoryFieldScope;
  fieldSize: number;
  marks: FieldMark[];
  outside: OutsideMark[];
  clubRiders: ClubRaceRider[];
};

export type RaceCategories = { race: RaceHeader; categories: RaceCategory[] };

export type RaceCategoriesInput = {
  sourceEventId: string;
  /** Auth-resolved. This query never substitutes a Club from a user id. */
  clubId: number;
};

export type RiderSeasonInput = {
  seasonId: number;
  /** Auth-resolved. The Rider must be on this Club's roster for this Season. */
  clubId: number;
  riderId: number;
  checkpoint?: Checkpoint;
  /** An included Rider result to show in detail; invalid selections return null. */
  selectedSourceEventId?: string;
};

export type RiderMeasurement =
  | { kind: 'none' }
  | { kind: 'one'; label: string; value: string; seconds: number | null }
  | { kind: 'many'; values: { label: string; value: string; seconds: number | null }[] };

export type RiderEventResult = {
  race: RaceHeader;
  result: RaceResultRow;
  /** Source-published total, including `DNF` when that is what the source says. */
  officialTotal: string;
  measured: RiderMeasurement;
};

export type RiderRound = {
  round: { id: number; ordinal: number; name: string };
  /** One Round may contain distinct conference Events; preserve every result. */
  results: RiderEventResult[];
};

export type RiderNeighbor = {
  plate: string;
  place: string;
  pctBack: number;
  /** Difference in the view-derived percent-back values, rounded to 0.1 points. */
  gapPctPoints: number;
};

export type RiderNeighbors = {
  gapBasis: 'derived-percent-back-percentage-points';
  ahead: RiderNeighbor[];
  behind: RiderNeighbor[];
};

export type RiderSelectedResult = RiderEventResult & { neighbors: RiderNeighbors };

export type RiderSeason = {
  rider: { id: number; name: string };
  checkpoint: Checkpoint;
  rounds: RiderRound[];
  /** Null when no included Event was selected. */
  selected: RiderSelectedResult | null;
};

type Row = Record<string, unknown>;
const rowsOf = (result: { rows: unknown[] }): Row[] => result.rows as Row[];
const str = (value: unknown): string => String(value ?? '');
const num = (value: unknown): number => Number(value);
const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);
const numericPublishedPlace = (place: string): number | null => {
  const trimmed = place.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
};

function raceResultRow(row: Row): RaceResultRow {
  const publishedSplits = (['lap1', 'lap2', 'lap3', 'lap4'] as const)
    .map((key) => row[key])
    .filter((value): value is string => typeof value === 'string' && value !== '-' && value !== '');
  return {
    plate: str(row.plate),
    category: str(row.category),
    conference: strOrNull(row.conference),
    place: str(row.place),
    status: row.status === 'dnf' ? 'dnf' : 'finished',
    timeRaw: str(row.time_raw),
    points: row.points === null || row.points === undefined ? null : num(row.points),
    lapsDown: row.laps_down === null || row.laps_down === undefined ? null : num(row.laps_down),
    pctBack: row.pct_back === null || row.pct_back === undefined ? null : num(row.pct_back),
    fieldSize: num(row.field_size),
    fieldTopPct:
      row.field_top_pct === null || row.field_top_pct === undefined ? null : num(row.field_top_pct),
    scored: row.scored === true,
    ptsLeader: row.pts_leader === true,
    grade: row.grade === null || row.grade === undefined ? null : num(row.grade),
    lapSplits: publishedSplits,
    lapSeconds: publishedSplits.map((split) => parseTimeSeconds(split) ?? 0),
  };
}

function riderMeasurement(row: Row): RiderMeasurement {
  const values = (['lap1', 'lap2', 'lap3', 'lap4'] as const).flatMap((key, index) => {
    const value = row[key];
    if (typeof value !== 'string' || value === '' || value === '-') return [];
    return [{ label: `Lap ${index + 1}`, value, seconds: parseTimeSeconds(value) }];
  });
  if (values.length === 0) return { kind: 'none' };
  if (values.length === 1) {
    const value = values[0]!;
    return { kind: 'one', ...value };
  }
  return { kind: 'many', values };
}

/**
 * Adapt one `v_rider_result` row for an editorial read model.
 *
 * The input must retain the reporting-view columns including `lap1` through
 * `lap4`; this preserves the source's original lap slots for every caller.
 */
export function riderEventResultFromViewRow(row: Record<string, unknown>): RiderEventResult {
  const result = raceResultRow(row);
  return {
    race: {
      eventId: num(row.event_id),
      sourceEventId: str(row.source_event_id),
      name: str(row.event_name),
      seasonYear: num(row.season_year),
      roundOrdinal: num(row.round_ordinal),
    },
    result,
    officialTotal: result.timeRaw,
    measured: riderMeasurement(row),
  };
}

async function loadPersonalSquads(
  db: AnyDatabase,
  clubId: number,
  seasonId: number,
  userId: string | null,
): Promise<SquadRef[]> {
  if (userId === null) return [];

  const result = await db.execute(sql`
    select s.id, s.name, s.slug from squad s
      join squad_coach sc on sc.squad_id = s.id
     where s.club_id = ${clubId} and s.season_id = ${seasonId} and sc.user_id = ${userId}
     order by s.name`);
  return rowsOf(result).map((row) => ({
    id: num(row.id),
    name: str(row.name),
    slug: str(row.slug),
  }));
}

/**
 * Read the Season schedule and Club Starts through one explicit checkpoint.
 *
 * `v_rider_result` already resolves a result row to its season-bounded Rider.
 * The query deliberately joins `club_member`, never `squad_member`, then
 * selects distinct `(rider, round)`: a Rider in two Squads is still one person
 * who started that Round.
 */
export async function loadSeasonDispatch(
  db: AnyDatabase,
  input: SeasonDispatchInput,
): Promise<SeasonDispatch | null> {
  const seasonResult = await db.execute(
    sql`select id, year from season where id = ${input.seasonId} limit 1`,
  );
  const seasonRow = rowsOf(seasonResult)[0];
  if (!seasonRow) return null;
  const season = { id: num(seasonRow.id), year: num(seasonRow.year) };

  const roundsResult = await db.execute(sql`
    select id, ordinal, name from round
     where season_id = ${input.seasonId}
     order by ordinal`);
  const rounds = rowsOf(roundsResult).map((row) => ({
    id: num(row.id),
    ordinal: num(row.ordinal),
    name: str(row.name),
  }));
  const explicitCheckpoint = input.checkpoint;
  if (
    explicitCheckpoint?.kind === 'through' &&
    (!Number.isFinite(explicitCheckpoint.ordinal) ||
      !Number.isInteger(explicitCheckpoint.ordinal) ||
      explicitCheckpoint.ordinal < 0 ||
      !rounds.some((round) => round.ordinal === explicitCheckpoint.ordinal))
  ) {
    return null;
  }
  const personalSquads = await loadPersonalSquads(db, input.clubId, input.seasonId, input.userId);

  const [eventsResult, publishedResult] = await Promise.all([
    db.execute(sql`
      select e.round_id, e.source_event_id, e.name, e.conference
        from event e
        join round r on r.id = e.round_id
       where r.season_id = ${input.seasonId}
       order by e.source_event_id`),
    db.execute(sql`
      select distinct source_event_id, round_ordinal from v_race_result
       where season_id = ${input.seasonId}`),
  ]);
  const publishedEventsByRound = new Map<number, Set<string>>();
  for (const row of rowsOf(publishedResult)) {
    const ordinal = num(row.round_ordinal);
    const sourceEventIds = publishedEventsByRound.get(ordinal) ?? new Set<string>();
    sourceEventIds.add(str(row.source_event_id));
    publishedEventsByRound.set(ordinal, sourceEventIds);
  }
  const publishedOrdinals = new Set(publishedEventsByRound.keys());
  const checkpoint =
    input.checkpoint ??
    (publishedOrdinals.size === 0
      ? { kind: 'none' as const }
      : { kind: 'through' as const, ordinal: Math.max(...publishedOrdinals) });
  const hasExplicitNoCheckpoint = input.checkpoint?.kind === 'none';

  if (rounds.length === 0) {
    return {
      season,
      checkpoint,
      schedule: { kind: 'unavailable' },
      personalSquad: personalSquads[0] ?? null,
      availableSquads: personalSquads,
    };
  }

  const startsResult =
    checkpoint.kind === 'none'
      ? { rows: [] }
      : await db.execute(sql`
          select distinct rr.rider_id, rr.round_ordinal
            from v_rider_result rr
            join club_member cm
              on cm.rider_id = rr.rider_id
             and cm.club_id = ${input.clubId}
             and cm.season_id = ${input.seasonId}
           where rr.season_id = ${input.seasonId}
             and rr.round_ordinal <= ${checkpoint.ordinal}`);

  const eventsByRound = new Map<number, DispatchRound['events']>();
  for (const row of rowsOf(eventsResult)) {
    const roundId = num(row.round_id);
    const events = eventsByRound.get(roundId) ?? [];
    events.push({
      sourceEventId: str(row.source_event_id),
      name: str(row.name),
      conference: strOrNull(row.conference),
    });
    eventsByRound.set(roundId, events);
  }

  const startsByRound = new Map<number, Set<number>>();
  for (const row of rowsOf(startsResult)) {
    const ordinal = num(row.round_ordinal);
    const starts = startsByRound.get(ordinal) ?? new Set<number>();
    starts.add(num(row.rider_id));
    startsByRound.set(ordinal, starts);
  }
  const firstStartByRider = new Map<number, number>();
  for (const [ordinal, riders] of startsByRound) {
    for (const riderId of riders) {
      const prior = firstStartByRider.get(riderId);
      if (prior === undefined || ordinal < prior) firstStartByRider.set(riderId, ordinal);
    }
  }

  const dispatchRounds: DispatchRound[] = rounds.map((round) => {
    const afterCheckpoint =
      hasExplicitNoCheckpoint ||
      (checkpoint.kind === 'through' && round.ordinal > checkpoint.ordinal);
    if (afterCheckpoint) {
      return {
        round,
        events: eventsByRound.get(round.id) ?? [],
        availability: 'after-checkpoint',
        clubStarts: null,
        firstRecordedStarts: null,
      };
    }
    const events = eventsByRound.get(round.id) ?? [];
    const publishedEventIds = publishedEventsByRound.get(round.ordinal) ?? new Set<string>();
    if (publishedEventIds.size === 0) {
      return {
        round,
        events,
        availability: 'unpublished',
        clubStarts: null,
        firstRecordedStarts: null,
      };
    }
    if (events.some((event) => !publishedEventIds.has(event.sourceEventId))) {
      return {
        round,
        events,
        availability: 'partial',
        clubStarts: null,
        firstRecordedStarts: null,
      };
    }
    const starts = startsByRound.get(round.ordinal) ?? new Set<number>();
    const firstRecordedStarts = [...starts].filter(
      (riderId) => firstStartByRider.get(riderId) === round.ordinal,
    ).length;
    return {
      round,
      events,
      availability: 'published',
      clubStarts: starts.size,
      firstRecordedStarts,
    };
  });

  return {
    season,
    checkpoint,
    schedule: { kind: 'available', rounds: dispatchRounds },
    personalSquad: personalSquads[0] ?? null,
    availableSquads: personalSquads,
  };
}

/**
 * Read a rostered Rider's published Season history through one checkpoint.
 *
 * The selected Event is an explicit disambiguator for split Rounds. A caller
 * never gets a later or foreign result by falling back to another Event.
 */
export async function loadRiderSeason(
  db: AnyDatabase,
  input: RiderSeasonInput,
): Promise<RiderSeason | null> {
  const riderResult = await db.execute(sql`
    select r.id, r.display_name
      from rider r
      join club_member cm on cm.rider_id = r.id
     where r.id = ${input.riderId}
       and cm.club_id = ${input.clubId}
       and cm.season_id = ${input.seasonId}
     limit 1`);
  const rider = rowsOf(riderResult)[0];
  if (!rider) return null;

  const [roundsResult, publishedResult] = await Promise.all([
    db.execute(sql`
      select id, ordinal, name from round
       where season_id = ${input.seasonId}
       order by ordinal`),
    db.execute(sql`
      select distinct round_ordinal from v_race_result
       where season_id = ${input.seasonId}`),
  ]);
  const rounds = rowsOf(roundsResult).map((row) => ({
    id: num(row.id),
    ordinal: num(row.ordinal),
    name: str(row.name),
  }));
  const explicitThrough = input.checkpoint?.kind === 'through' ? input.checkpoint : null;
  if (
    explicitThrough !== null &&
    (!Number.isFinite(explicitThrough.ordinal) ||
      !Number.isInteger(explicitThrough.ordinal) ||
      explicitThrough.ordinal < 0 ||
      !rounds.some((round) => round.ordinal === explicitThrough.ordinal))
  ) {
    return null;
  }
  const publishedOrdinals = rowsOf(publishedResult).map((row) => num(row.round_ordinal));
  const checkpoint =
    input.checkpoint ??
    (publishedOrdinals.length === 0
      ? { kind: 'none' as const }
      : { kind: 'through' as const, ordinal: Math.max(...publishedOrdinals) });

  const historyResult =
    checkpoint.kind === 'none'
      ? { rows: [] }
      : await db.execute(sql`
          select rr.*, r.id as round_id, r.name as round_name
            from v_rider_result rr
            join round r
              on r.season_id = rr.season_id
             and r.ordinal = rr.round_ordinal
           where rr.rider_id = ${input.riderId}
             and rr.season_id = ${input.seasonId}
             and rr.round_ordinal <= ${checkpoint.ordinal}
           order by rr.round_ordinal, rr.source_event_id, rr.category, rr.conference nulls first, rr.place`);
  const resultRows = rowsOf(historyResult);
  const roundsById = new Map<number, RiderRound>();
  for (const raw of resultRows) {
    const roundId = num(raw.round_id);
    const existing = roundsById.get(roundId);
    const result = riderEventResultFromViewRow(raw);
    if (existing) {
      existing.results.push(result);
    } else {
      roundsById.set(roundId, {
        round: { id: roundId, ordinal: num(raw.round_ordinal), name: str(raw.round_name) },
        results: [result],
      });
    }
  }
  const history = [...roundsById.values()].sort((a, b) => a.round.ordinal - b.round.ordinal);

  const selectedBase =
    input.selectedSourceEventId === undefined
      ? null
      : (history
          .flatMap((round) => round.results)
          .find((result) => result.race.sourceEventId === input.selectedSourceEventId) ?? null);
  if (input.selectedSourceEventId !== undefined && selectedBase === null) return null;

  let neighbors: RiderNeighbors = {
    gapBasis: 'derived-percent-back-percentage-points',
    ahead: [],
    behind: [],
  };
  const selectedPlace =
    selectedBase === null ? null : numericPublishedPlace(selectedBase.result.place);
  const selectedPctBack = selectedBase?.result.pctBack ?? null;
  if (
    selectedBase !== null &&
    selectedBase.result.status === 'finished' &&
    selectedPlace !== null &&
    selectedPctBack !== null
  ) {
    const neighborsResult = await db.execute(sql`
      select plate, place, pct_back
        from v_race_result
       where event_id = ${selectedBase.race.eventId}
         and category = ${selectedBase.result.category}
         and conference is not distinct from ${selectedBase.result.conference}
         and status = 'finished'
         and pct_back is not null
         and place ~ '^[0-9]+$'`);
    const candidates = rowsOf(neighborsResult)
      .map((row) => ({
        plate: str(row.plate),
        place: str(row.place),
        placeNumber: numericPublishedPlace(str(row.place)),
        pctBack: num(row.pct_back),
      }))
      .filter(
        (row): row is { plate: string; place: string; placeNumber: number; pctBack: number } =>
          row.plate !== selectedBase.result.plate && row.placeNumber !== null,
      );
    const toNeighbor = (row: (typeof candidates)[number]): RiderNeighbor => ({
      plate: row.plate,
      place: row.place,
      pctBack: row.pctBack,
      gapPctPoints: Math.abs(row.pctBack - selectedPctBack),
    });
    neighbors = {
      gapBasis: 'derived-percent-back-percentage-points',
      ahead: candidates
        .filter((row) => row.placeNumber < selectedPlace)
        .sort((a, b) => b.placeNumber - a.placeNumber)
        .slice(0, 2)
        .map(toNeighbor),
      behind: candidates
        .filter((row) => row.placeNumber > selectedPlace)
        .sort((a, b) => a.placeNumber - b.placeNumber)
        .slice(0, 2)
        .map(toNeighbor),
    };
  }

  return {
    rider: { id: num(rider.id), name: str(rider.display_name) },
    checkpoint,
    rounds: history,
    selected:
      selectedBase === null
        ? null
        : {
            ...selectedBase,
            neighbors,
          },
  };
}

/**
 * The shared field for every Category contest at one Event.
 *
 * A Club rider is resolved by `club_member` at this Event's Season, never by
 * summing Squads. The league field remains complete; only the `ours` marks and
 * linked `clubRiders` are Club-scoped.
 */
export async function loadRaceCategories(
  db: AnyDatabase,
  input: RaceCategoriesInput,
): Promise<RaceCategories | null> {
  const result = await db.execute(sql`
    select rr.*, ident.rider_id, ident.rider_name,
           (cm.rider_id is not null) as is_club_rider
      from v_race_result rr
      left join v_rider_result ident
        on ident.event_id = rr.event_id and ident.plate = rr.plate
      left join club_member cm
        on cm.rider_id = ident.rider_id
       and cm.club_id = ${input.clubId}
       and cm.season_id = rr.season_id
     where rr.source_event_id = ${input.sourceEventId}
     order by rr.category, rr.conference nulls first, rr.place, rr.plate`);
  const rows = rowsOf(result);
  if (rows.length === 0) return null;

  const first = rows[0]!;
  const race: RaceHeader = {
    eventId: num(first.event_id),
    sourceEventId: str(first.source_event_id),
    name: str(first.event_name),
    seasonYear: num(first.season_year),
    roundOrdinal: num(first.round_ordinal),
  };
  type GroupEntry = { row: RaceResultRow; riderId: number | null; name: string | null };
  const groups = new Map<string, { key: RaceCategoryKey; entries: GroupEntry[] }>();
  for (const raw of rows) {
    const row = raceResultRow(raw);
    const key: RaceCategoryKey = {
      eventId: race.eventId,
      category: row.category,
      conference: row.conference,
    };
    const encoded = `${key.category}\u0000${key.conference ?? ''}`;
    const group = groups.get(encoded) ?? { key, entries: [] };
    group.entries.push({
      row,
      riderId: raw.is_club_rider === true ? num(raw.rider_id) : null,
      name: raw.is_club_rider === true ? str(raw.rider_name) : null,
    });
    groups.set(encoded, group);
  }

  const categories = [...groups.values()]
    .map(({ key, entries }): RaceCategory => {
      const ordered = [...entries].sort((a, b) => compareByPlace(a.row, b.row));
      const clubByRider = new Map<number, ClubRaceRider>();
      for (const entry of ordered) {
        if (entry.riderId !== null && entry.name !== null && !clubByRider.has(entry.riderId)) {
          clubByRider.set(entry.riderId, {
            riderId: entry.riderId,
            name: entry.name,
            row: entry.row,
          });
        }
      }
      return {
        key,
        scope: key.conference === null ? 'league' : 'conference',
        fieldSize: ordered.length,
        marks: ordered.map((entry) => ({
          pct: entry.row.pctBack,
          place: entry.row.place,
          ours: entry.riderId !== null,
          ...(entry.name === null ? {} : { label: entry.name }),
        })),
        outside: ordered.flatMap((entry): OutsideMark[] => {
          if (entry.name === null) return [];
          const mark = outsideFor(entry.row, entry.name);
          return mark === null ? [] : [mark];
        }),
        clubRiders: [...clubByRider.values()],
      };
    })
    .sort((a, b) => {
      const category = categoryRank(a.key.category) - categoryRank(b.key.category);
      if (category !== 0) return category;
      const conferenceA = a.key.conference ?? '';
      const conferenceB = b.key.conference ?? '';
      return conferenceA < conferenceB ? -1 : conferenceA > conferenceB ? 1 : 0;
    });

  return { race, categories };
}
