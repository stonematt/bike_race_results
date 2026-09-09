/**
 * The Season pulse is a presentation model over the protected reporting read.
 * It deliberately knows only starts, published category labels, and published
 * places; it does not recalculate standings or explain missing result rows.
 */

export type SeasonPulseInput = {
  rounds: readonly { id: number; ordinal: number; name: string }[];
  riders: readonly { id: number; name: string; category: string | null }[];
  results: readonly {
    riderId: number;
    roundOrdinal: number;
    status: 'finished' | 'dnf';
    place: string;
  }[];
};

export type PulseMark =
  { state: 'no-result' } | { state: 'start'; lateFirstStart: boolean; podium: boolean };

export type SeasonPulse = {
  rounds: { id: number; ordinal: number; name: string; starts: number }[];
  groups: {
    label: string;
    riders: {
      id: number;
      name: string;
      /** Latest published category, retained for the compact roster header. */
      category: string | null;
      everyRace: boolean;
      marks: PulseMark[];
    }[];
  }[];
  legend: {
    state: 'start' | 'no-result' | 'every-race' | 'late-first' | 'podium';
    label: string;
  }[];
};

type Cohort = 'girls-hs' | 'girls-ms' | 'boys-hs' | 'boys-ms' | 'unknown';

const cohortDetails: Record<Cohort, { label: string; order: number }> = {
  'girls-ms': { label: 'Girls · Middle School', order: 0 },
  'girls-hs': { label: 'Girls · High School', order: 1 },
  'boys-ms': { label: 'Boys · Middle School', order: 2 },
  'boys-hs': { label: 'Boys · High School', order: 3 },
  unknown: { label: 'Category not recorded', order: 4 },
};

function cohortFor(category: string | null): Cohort {
  if (!category) return 'unknown';
  const gender = /girls/i.test(category) ? 'girls' : /boys/i.test(category) ? 'boys' : null;
  if (!gender) return 'unknown';
  const level = /middle school|\bms\d*/i.test(category)
    ? 'ms'
    : /high school|\bhs\d*|varsity/i.test(category)
      ? 'hs'
      : null;
  return level ? `${gender}-${level}` : 'unknown';
}

function isPodium(result: SeasonPulseInput['results'][number]): boolean {
  const place = result.place.trim();
  return (
    result.status === 'finished' && /^\d+$/.test(place) && Number(place) >= 1 && Number(place) <= 5
  );
}

/**
 * One start per stable rider identity per available Round. Multiple source rows
 * (for example duplicated Squad membership or a source anomaly) collapse to a
 * single start, retaining a valid top-five annotation when one is published.
 */
export function buildSeasonPulse(input: SeasonPulseInput): SeasonPulse {
  const rounds = [...input.rounds].sort((a, b) => a.ordinal - b.ordinal);
  const availableOrdinals = new Set(rounds.map((round) => round.ordinal));
  const byRiderAndRound = new Map<number, Map<number, SeasonPulseInput['results']>>();

  for (const result of input.results) {
    if (!availableOrdinals.has(result.roundOrdinal)) continue;
    const byRound = byRiderAndRound.get(result.riderId) ?? new Map();
    const prior = byRound.get(result.roundOrdinal);
    if (!prior || isPodium(result)) byRound.set(result.roundOrdinal, result);
    byRiderAndRound.set(result.riderId, byRound);
  }

  const startsByRound = new Map<number, number>();
  for (const byRound of byRiderAndRound.values()) {
    for (const ordinal of byRound.keys()) {
      startsByRound.set(ordinal, (startsByRound.get(ordinal) ?? 0) + 1);
    }
  }

  const groupRows = new Map<Cohort, SeasonPulse['groups'][number]['riders']>();
  for (const rider of input.riders) {
    const byRound = byRiderAndRound.get(rider.id) ?? new Map();
    const firstStart = [...byRound.keys()].sort((a, b) => a - b)[0];
    const everyRace = rounds.length > 1 && rounds.every((round) => byRound.has(round.ordinal));
    const marks = rounds.map((round): PulseMark => {
      const result = byRound.get(round.ordinal);
      if (!result) return { state: 'no-result' };
      return {
        state: 'start',
        lateFirstStart: firstStart === round.ordinal && round.ordinal !== rounds[0]?.ordinal,
        podium: isPodium(result),
      };
    });
    const cohort = cohortFor(rider.category);
    const group = groupRows.get(cohort) ?? [];
    group.push({ id: rider.id, name: rider.name, category: rider.category, everyRace, marks });
    groupRows.set(cohort, group);
  }

  const groups = [...groupRows.entries()]
    .sort(([a], [b]) => cohortDetails[a].order - cohortDetails[b].order)
    .map(([cohort, riders]) => ({
      label: cohortDetails[cohort].label,
      riders: [...riders].sort(
        (a, b) =>
          categoryRank(a.category ?? '') - categoryRank(b.category ?? '') ||
          a.name.localeCompare(b.name),
      ),
    }));
  const allMarks = groups.flatMap((group) => group.riders.flatMap((rider) => rider.marks));
  const legend: SeasonPulse['legend'] = [];
  if (allMarks.some((mark) => mark.state === 'start'))
    legend.push({ state: 'start', label: 'Recorded start' });
  if (allMarks.some((mark) => mark.state === 'no-result'))
    legend.push({ state: 'no-result', label: 'No result recorded' });
  if (groups.some((group) => group.riders.some((rider) => rider.everyRace)))
    legend.push({ state: 'every-race', label: 'Started every available race' });
  if (allMarks.some((mark) => mark.state === 'start' && mark.lateFirstStart))
    legend.push({ state: 'late-first', label: 'First recorded start this season' });
  if (allMarks.some((mark) => mark.state === 'start' && mark.podium))
    legend.push({ state: 'podium', label: 'Finished in the published top five' });

  return {
    rounds: rounds.map((round) => ({ ...round, starts: startsByRound.get(round.ordinal) ?? 0 })),
    groups,
    legend,
  };
}
import { categoryRank } from './category-order.ts';
