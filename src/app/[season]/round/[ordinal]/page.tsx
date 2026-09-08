import { loadPublishedStory } from '@/lib/editorial-publication.ts';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { requireClubContext } from '@/app/club-context.ts';
import { RaceReview } from '@/components/RaceReview.tsx';
import { loadRaceCategories } from '@/lib/db/editorial-query.ts';
import { checkpointFromSearch, eventAnchorId } from '@/lib/reporting-navigation.ts';
import { resolveSeasonByYear } from '../../query.ts';
import { listRoundEvents, resolveRound } from './query.ts';

export const dynamic = 'force-dynamic';

async function resolveThrough(
  db: ReturnType<typeof appDb>,
  seasonId: number,
  selectedOrdinal: number,
  searchValue: string | string[] | undefined,
): Promise<number | null> {
  const requested = checkpointFromSearch(searchValue);
  if (requested === null) return null;
  if (requested === undefined) return selectedOrdinal;

  const checkpoint = await resolveRound(db, seasonId, String(requested));
  if (checkpoint === null || checkpoint.ordinal < selectedOrdinal) return null;
  return checkpoint.ordinal;
}

/**
 * A Round remains the public review surface even when the league published one
 * Event per conference. Each Event keeps its own categories and field strips;
 * this page never combines their source fields.
 */
export default async function RoundPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string; ordinal: string }>;
  searchParams: Promise<{ through?: string | string[] }>;
}) {
  const { season: seasonSegment, ordinal: ordinalSegment } = await params;
  const db = appDb();
  const season = await resolveSeasonByYear(db, seasonSegment);
  if (season === null) notFound();

  const round = await resolveRound(db, season.id, ordinalSegment);
  if (round === null) notFound();

  const { through: throughSearch } = await searchParams;
  const through = await resolveThrough(db, season.id, round.ordinal, throughSearch);
  if (through === null) notFound();

  const session = await auth();
  const club = await requireClubContext(db, session?.user?.id);

  const events = await listRoundEvents(db, round.id);
  const reviews = await Promise.all(
    events.map(async (event) => {
      const review = await loadRaceCategories(db, {
        sourceEventId: event.sourceEventId,
        clubId: club.clubId,
      });
      const story =
        review === null
          ? null
          : await loadPublishedStory(db, {
              actorId: club.userId,
              clubId: club.clubId,
              seasonId: season.id,
              checkpointOrdinal: through,
              surface: 'race-review',
              eventId: review.race.eventId,
            });
      return { event, review, story };
    }),
  );
  const publishedReviews = reviews.flatMap(({ review }) => (review === null ? [] : [review]));
  const clubRiderIds = new Set(
    publishedReviews.flatMap((review) =>
      review.categories.flatMap((category) => category.clubRiders.map((rider) => rider.riderId)),
    ),
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <p className="text-muted text-sm">
        <Link
          href={`/${season.year}?through=${through}`}
          className="text-fg hover:text-accent underline"
        >
          {season.year} season
        </Link>
      </p>
      <h1 className="font-display mt-1 text-4xl tracking-wide uppercase">{round.name}</h1>
      {publishedReviews.length > 0 ? (
        <p className="text-muted mt-2 text-sm">
          {clubRiderIds.size} club rider{clubRiderIds.size === 1 ? '' : 's'} recorded a result at{' '}
          {round.name}.
        </p>
      ) : null}
      {events.length > 1 ? (
        <p className="text-muted mt-2 max-w-2xl text-sm">
          This round was published as separate conference events. Each field remains separate here.
        </p>
      ) : null}
      {publishedReviews.length > 0 && publishedReviews.length < events.length ? (
        <p className="text-muted mt-2 max-w-2xl text-sm">
          Results are available for {publishedReviews.length} of {events.length} scheduled events.
        </p>
      ) : null}

      {events.length > 1 ? (
        <nav aria-label="Choose an Event" className="mt-5">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold">
            {events.map((event) => (
              <li key={event.sourceEventId}>
                <a
                  href={'#' + eventAnchorId(event.sourceEventId)}
                  className="hover:text-accent inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  {event.name}
                  {event.conference ? ' · ' + event.conference : ''}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {reviews.length === 0 ? (
        <p className="text-muted mt-8 text-sm">No events are recorded for this round.</p>
      ) : (
        reviews.map(({ event, review, story }) =>
          review === null ? (
            <section
              key={event.sourceEventId}
              id={eventAnchorId(event.sourceEventId)}
              className="border-border mt-8 scroll-mt-6 border-t pt-4"
            >
              <h2 className="font-display text-2xl tracking-wide uppercase">{event.name}</h2>
              <p className="text-muted mt-2 text-sm">Results are not published for this event.</p>
            </section>
          ) : (
            <RaceReview
              key={event.sourceEventId}
              review={review}
              story={story}
              through={through}
              showEventHeading={events.length > 1}
            />
          ),
        )
      )}
    </main>
  );
}
