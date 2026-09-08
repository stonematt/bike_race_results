import { notFound } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { requireClubContext } from '@/app/club-context.ts';
import { SeasonDispatch } from '@/components/SeasonDispatch.tsx';
import { loadSeasonDispatch } from '@/lib/db/editorial-query.ts';
import { checkpointFromSearch } from '@/lib/reporting-navigation.ts';
import { resolveSeasonByYear } from './query.ts';

/**
 * The bare season route is the editorial dispatch. Authentication is resolved
 * per request and Club scope comes from the existing resolver before the
 * reporting query runs. The layout validates the segment; this defensive
 * lookup keeps the route safe when rendered outside that layout.
 */
export const dynamic = 'force-dynamic';

export default async function SeasonHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string }>;
  searchParams: Promise<{ through?: string | string[] }>;
}) {
  const { season: seasonSegment } = await params;
  const db = appDb();

  const season = await resolveSeasonByYear(db, seasonSegment);
  if (season === null) notFound();

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const club = await requireClubContext(db, userId);

  const { through } = await searchParams;
  const ordinal = checkpointFromSearch(through);
  if (ordinal === null) notFound();
  const dispatch = await loadSeasonDispatch(db, {
    seasonId: season.id,
    clubId: club.clubId,
    userId,
    checkpoint: ordinal === undefined ? undefined : { kind: 'through', ordinal },
  });
  if (dispatch === null) notFound();

  return <SeasonDispatch dispatch={dispatch} />;
}
