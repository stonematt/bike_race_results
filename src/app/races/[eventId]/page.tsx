import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { requireClubContext } from '@/app/club-context.ts';
import { resolveSeasonByYear } from '@/app/[season]/query.ts';
import { resolveRound } from '@/app/[season]/round/[ordinal]/query.ts';
import { loadRaceCategories } from '@/lib/db/editorial-query.ts';
import { checkpointFromSearch, roundHref } from '@/lib/reporting-navigation.ts';

export const dynamic = 'force-dynamic';

/**
 * Historic Event URLs remain usable, but Race review lives at its Round so a
 * split conference weekend never hides its sibling Event. The fragment keeps
 * the originally selected source Event in view after the redirect.
 */
export default async function RacePage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ through?: string | string[] }>;
}) {
  const { eventId } = await params;
  const db = appDb();
  const session = await auth();
  const club = await requireClubContext(db, session?.user?.id);

  const review = await loadRaceCategories(db, { sourceEventId: eventId, clubId: club.clubId });
  if (review === null) notFound();

  const season = await resolveSeasonByYear(db, String(review.race.seasonYear));
  if (season === null) notFound();
  const selectedRound = await resolveRound(db, season.id, String(review.race.roundOrdinal));
  if (selectedRound === null) notFound();

  const { through: throughSearch } = await searchParams;
  const requested = checkpointFromSearch(throughSearch);
  if (requested === null) notFound();
  const through = requested ?? selectedRound.ordinal;
  const checkpoint = await resolveRound(db, season.id, String(through));
  if (checkpoint === null || checkpoint.ordinal < selectedRound.ordinal) notFound();

  redirect(
    roundHref(season.year, selectedRound.ordinal, checkpoint.ordinal, review.race.sourceEventId),
  );
}
