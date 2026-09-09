/**
 * Published Oregon League calendar facts belong in presentation metadata until
 * results create their normal Round rows. This keeps an announced weekend out
 * of every result-derived denominator and avoids a render-time network read.
 */
export type PublishedRibbonRound = {
  ordinal: number;
  label: string;
  date: string;
  conference: string;
};

type ResultRound = { id: number; ordinal: number; name: string; starts: number };

export type RibbonRound = {
  ordinal: number;
  label: string;
  href: string | null;
  starts?: number;
  date?: string;
  conference?: string;
};

export const OREGON_EVENT_WEEKENDS_URL = 'https://www.oregonmtb.org/eventweekends';

const OREGON_2026_EVENT_WEEKENDS: readonly PublishedRibbonRound[] = [
  {
    ordinal: 1,
    label: 'Old Oak Prologue',
    date: 'Aug 30',
    conference: 'North + South · same day',
  },
  {
    ordinal: 2,
    label: 'Magical Madras',
    date: 'Sep 12–13',
    conference: 'North Sep 12 · South Sep 13',
  },
  {
    ordinal: 3,
    label: 'Cascade Challenge',
    date: 'Sep 26–27',
    conference: 'South Sep 26 · North Sep 27',
  },
  {
    ordinal: 4,
    label: 'Newport Gnarnia',
    date: 'Oct 10–11',
    conference: 'North Oct 10 · South Oct 11',
  },
  {
    ordinal: 5,
    label: 'State Champs: Butte Scoot Boogie',
    date: 'Oct 25',
    conference: 'North + South · same day',
  },
] as const;

/**
 * The five Oregon weekends are intentionally calendar-only for 2026. Western
 * Regionals is a distinct November event, outside this Oregon ribbon. Other
 * seasons receive exactly the available result-backed rounds supplied by the
 * existing reporting query.
 */
export function ribbonRoundsForSeason(
  year: number,
  resultRounds: readonly ResultRound[],
): RibbonRound[] {
  if (year !== 2026)
    return resultRounds.map((round) => ({
      ordinal: round.ordinal,
      label: round.name,
      href: `/${year}/round/${round.ordinal}`,
      starts: round.starts,
    }));

  const byOrdinal = new Map(resultRounds.map((round) => [round.ordinal, round]));
  const scheduled = OREGON_2026_EVENT_WEEKENDS.map((weekend) => {
    const round = byOrdinal.get(weekend.ordinal);
    return {
      ...weekend,
      href: round ? `/${year}/round/${round.ordinal}` : null,
      ...(round ? { starts: round.starts } : {}),
    };
  });
  const extras = resultRounds
    .filter(
      (round) => !OREGON_2026_EVENT_WEEKENDS.some((weekend) => weekend.ordinal === round.ordinal),
    )
    .map((round) => ({
      ordinal: round.ordinal,
      label: round.name,
      href: `/${year}/round/${round.ordinal}`,
      starts: round.starts,
    }));
  return [...scheduled, ...extras].sort((a, b) => a.ordinal - b.ordinal);
}
