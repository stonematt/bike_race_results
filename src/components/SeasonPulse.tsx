import Link from 'next/link';
import type { PulseMark, SeasonPulse as SeasonPulseModel } from '@/lib/season-pulse.ts';

function markLabel(mark: PulseMark): string {
  if (mark.state === 'no-result') return 'No result recorded';
  const annotations = [
    'Recorded start',
    ...(mark.lateFirstStart ? ['first recorded start this season'] : []),
    ...(mark.podium ? ['finished in the published top five'] : []),
  ];
  return annotations.join('; ');
}

function categoryAbbreviation(category: string | null): string {
  if (!category) return '—';
  const match = /^(MS\d|HS\d|Varsity)\b/i.exec(category);
  return match?.[1] ?? category;
}

function Mark({ mark, everyRace }: { mark: PulseMark; everyRace: boolean }) {
  if (mark.state === 'no-result') {
    return (
      <span className="pulse-mark pulse-mark-empty">
        <span className="sr-only">{markLabel(mark)}</span>
      </span>
    );
  }
  return (
    <span
      className={[
        'pulse-mark',
        'pulse-mark-start',
        everyRace ? 'pulse-mark-continuity' : '',
        mark.lateFirstStart ? 'pulse-mark-late' : '',
        mark.podium ? 'pulse-mark-podium' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={markLabel(mark)}
    >
      <span className="sr-only">{markLabel(mark)}</span>
    </span>
  );
}

export function SeasonPulse({
  seasonYear,
  pulse,
}: {
  seasonYear: number;
  pulse: SeasonPulseModel;
}) {
  const riders = pulse.groups.flatMap((group) => group.riders);
  const tableWidth = 90 + riders.length * 30;
  if (riders.length === 0 || pulse.rounds.length === 0) {
    return <p className="season-empty">There are no published season results to compare yet.</p>;
  }

  return (
    <section className="season-pulse" aria-labelledby="season-pulse-heading">
      <div className="season-pulse-heading">
        <div>
          <p className="eyebrow">The whole club, race by race</p>
          <h2 id="season-pulse-heading">The pulse</h2>
        </div>
        <p>Each mark is one recorded start. Open a race to read the published result context.</p>
      </div>
      <div
        className="season-pulse-scroll"
        tabIndex={0}
        aria-label="Season participation wall. Scroll horizontally to compare riders and races."
      >
        <p className="season-pulse-scroll-note">Scroll sideways to compare every rider.</p>
        <table style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}>
          <caption className="sr-only">
            Season participation wall. Rows are races and columns are rostered riders, grouped by
            their latest published category. A hollow mark means no result recorded.
          </caption>
          <colgroup>
            <col style={{ width: '90px' }} />
            {riders.map((rider) => (
              <col key={rider.id} style={{ width: '30px' }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="pulse-race-head" scope="col" rowSpan={2}>
                Race
              </th>
              {pulse.groups.map((group) => (
                <th key={group.label} scope="colgroup" colSpan={group.riders.length}>
                  {group.label}
                </th>
              ))}
            </tr>
            <tr>
              {riders.map((rider) => (
                <th key={rider.id} scope="col" className="pulse-rider-head">
                  <span className="pulse-rider-name">{rider.name}</span>
                  <abbr
                    className="pulse-rider-category"
                    title={rider.category ?? 'Category not recorded'}
                    aria-label={rider.category ?? 'Category not recorded'}
                  >
                    {categoryAbbreviation(rider.category)}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pulse.rounds.map((round, roundIndex) => (
              <tr key={round.id}>
                <th scope="row" className="pulse-race-head">
                  <Link
                    href={`/${seasonYear}/round/${round.ordinal}`}
                    aria-label={`${round.name}, ${round.starts} starts`}
                  >
                    {round.name}
                    <span>{round.starts} starts</span>
                    <span className="sr-only">{`, ${round.starts} starts`}</span>
                  </Link>
                </th>
                {riders.map((rider) => (
                  <td key={rider.id} className={rider.everyRace ? 'pulse-continuous' : undefined}>
                    <Mark mark={rider.marks[roundIndex]!} everyRace={rider.everyRace} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pulse.legend.length > 0 ? (
        <ul className="season-legend" aria-label="Season wall legend">
          {pulse.legend.map((item) => (
            <li key={item.label}>
              <span
                className={`legend-mark legend-${item.state.replace('no-result', 'empty')}`}
                aria-hidden="true"
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
