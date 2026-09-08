import Link from 'next/link';
import type { PublishedStory } from '@/lib/editorial-publication.ts';
import { roundHref } from '@/lib/reporting-navigation.ts';

/** Only the validated, identity-free publication read supplies this component. */
export function ReviewedObservation({ story }: { story: PublishedStory }) {
  const { candidate } = story;
  const { event, count } = candidate;
  const claim =
    count +
    ' club rider' +
    (count === 1 ? '' : 's') +
    ' recorded a start at ' +
    event.name +
    (event.conference === null ? '' : ' (' + event.conference + ')') +
    '.';
  return (
    <div className="max-w-2xl">
      <p className="mt-3 text-lg leading-relaxed font-semibold">{claim}</p>
      <p className="text-muted mt-2 text-sm leading-relaxed">
        Distinct identified riders on this club’s current season roster; includes published DNF
        results.
      </p>
      <p className="mt-3 text-sm">What would you like to try at the next race?</p>
      <Link
        href={roundHref(
          candidate.season.year,
          event.round.ordinal,
          candidate.checkpoint.ordinal,
          event.sourceEventId,
        )}
        className="hover:text-accent mt-3 inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4"
      >
        See {event.name} results
      </Link>
    </div>
  );
}
