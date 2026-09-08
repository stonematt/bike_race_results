import { ReviewedObservation } from './ReviewedObservation.tsx';
import type { PublishedStory } from '@/lib/editorial-publication.ts';
import Link from 'next/link';
import { FieldStrip } from './FieldStrip.tsx';
import type { RaceCategories } from '../lib/db/editorial-query.ts';
import { eventAnchorId } from '../lib/reporting-navigation.ts';
import type { RaceResultRow } from './race-detail.ts';

export type RaceReviewProps = {
  /** One published Event. Round pages render every Event without combining their fields. */
  review: RaceCategories;
  /** The included Round boundary carried into each rider's season history. */
  through: number;
  /** Only split Rounds need an Event heading above their distinct fields. */
  showEventHeading?: boolean;
  story?: PublishedStory | null;
};

function riderHref(year: number, riderId: number, through: number, sourceEventId: string): string {
  return `/${year}/rider/${riderId}?through=${through}&event=${encodeURIComponent(sourceEventId)}`;
}

function fieldLabel(category: RaceCategories['categories'][number]): string {
  return `${category.key.category}${
    category.key.conference === null ? '' : ` · ${category.key.conference}`
  }`;
}

function resultState(result: RaceResultRow): string {
  if (result.status === 'dnf') return 'DNF';
  if (result.lapsDown !== null && result.lapsDown > 0) {
    return `−${result.lapsDown} lap${result.lapsDown === 1 ? '' : 's'}`;
  }
  return 'Finished';
}

function publishedTotal(result: RaceResultRow): string {
  return result.timeRaw.trim() === '' ? 'Not published' : result.timeRaw;
}

function percentBack(result: RaceResultRow): string {
  return result.pctBack === null ? 'Comparison unavailable' : `${result.pctBack}%`;
}

function callout(result: RaceResultRow, fieldSize: number): string {
  if (result.status === 'dnf') return 'DNF · time comparison unavailable';
  if (fieldSize === 1) return `place ${result.place} · no field spread to compare`;
  if (result.lapsDown !== null && result.lapsDown > 0) {
    return `place ${result.place} · −${result.lapsDown} lap${result.lapsDown === 1 ? '' : 's'} · comparison unavailable`;
  }
  if (result.pctBack === null) return `place ${result.place} · comparison unavailable`;
  return `place ${result.place} · ${result.pctBack}% back`;
}

/**
 * One Event's categories, each drawn once against its complete published field.
 * `marks[].ours` comes from the reporting query's Club membership resolution;
 * this component only places the supplied evidence and links the current rider
 * identities that accompany it.
 */
export function RaceReview({ review, through, showEventHeading = false, story }: RaceReviewProps) {
  const { race } = review;

  return (
    <section id={eventAnchorId(race.sourceEventId)} className="scroll-mt-6">
      {showEventHeading ? (
        <header className="border-fg border-b-2 pb-3">
          <h2 className="font-display text-3xl tracking-wide uppercase">{race.name}</h2>
        </header>
      ) : null}

      {story ? <ReviewedObservation story={story} /> : null}

      <nav aria-label="Choose a field" className={showEventHeading ? 'mt-4' : 'mt-2'}>
        <ul className="flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-sm font-bold">
          {review.categories.map((category, index) => (
            <li key={`${category.key.category}-${category.key.conference ?? 'league'}`}>
              <a
                href={`#field-${race.eventId}-${index}`}
                className="text-fg hover:text-accent underline underline-offset-4"
              >
                {fieldLabel(category)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {review.categories.map((category, index) => {
        const label = fieldLabel(category);
        const riders = category.clubRiders;

        return (
          <section
            id={`field-${race.eventId}-${index}`}
            key={`${category.key.category}-${category.key.conference ?? 'league'}`}
            className="scroll-mt-6 mt-8"
          >
            <h2 className="font-display text-2xl tracking-wide uppercase">{label}</h2>
            <p className="text-muted mt-1 text-sm">
              {riders.length} club rider{riders.length === 1 ? '' : 's'} recorded in this{' '}
              {category.fieldSize}-rider field.
            </p>
            <div className="mt-4">
              <FieldStrip
                marks={category.marks}
                outside={category.outside}
                caption={`${category.fieldSize} rider${category.fieldSize === 1 ? '' : 's'} · percent back from winner`}
              />
            </div>
            {category.marks.length > 1 ? (
              <p className="text-muted mt-2 text-sm">
                Orange marks are club riders. Navy marks are other field riders.
              </p>
            ) : null}

            {riders.length > 0 ? (
              <>
                <ul className="mt-4 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-sm">
                  {riders.map((rider) => (
                    <li key={rider.riderId}>
                      <Link
                        href={riderHref(
                          race.seasonYear,
                          rider.riderId,
                          through,
                          race.sourceEventId,
                        )}
                        className="text-fg hover:text-accent font-bold underline underline-offset-4"
                      >
                        {rider.name}
                      </Link>{' '}
                      <span className="text-muted">· {callout(rider.row, category.fieldSize)}</span>
                    </li>
                  ))}
                </ul>

                <details className="border-border mt-4 border-t pt-3 text-sm">
                  <summary className="text-fg hover:text-accent cursor-pointer font-bold underline underline-offset-4">
                    View published result details
                  </summary>
                  <div className="overflow-x-auto">
                    <table className="mt-3 w-full text-left text-sm">
                      <thead className="text-muted border-border border-b text-xs">
                        <tr>
                          <th className="pb-2 pr-3 font-bold">Rider</th>
                          <th className="pb-2 pr-3 font-bold">Place</th>
                          <th className="pb-2 pr-3 font-bold">Published total</th>
                          <th className="pb-2 pr-3 font-bold">Percent back</th>
                          <th className="pb-2 font-bold">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {riders.map((rider) => (
                          <tr key={rider.riderId} className="border-border border-b last:border-0">
                            <td className="py-2 pr-3 font-semibold">{rider.name}</td>
                            <td className="py-2 pr-3 tabular-nums">{rider.row.place}</td>
                            <td className="py-2 pr-3 tabular-nums">{publishedTotal(rider.row)}</td>
                            <td className="py-2 pr-3 tabular-nums">{percentBack(rider.row)}</td>
                            <td className="py-2">{resultState(rider.row)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            ) : null}
          </section>
        );
      })}
    </section>
  );
}
