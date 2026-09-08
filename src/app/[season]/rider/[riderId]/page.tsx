import { notFound } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { requireClubContext } from '@/app/club-context.ts';
import { RiderProfile } from '@/components/RiderProfile.tsx';
import { loadRiderSeason } from '@/lib/db/editorial-query.ts';
import { checkpointFromSearch } from '@/lib/reporting-navigation.ts';
import { resolveSeasonByYear } from '../../query.ts';

export const dynamic = 'force-dynamic';

export default async function RiderPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string; riderId: string }>;
  searchParams: Promise<{
    through?: string | string[];
    event?: string | string[];
    view?: string | string[];
  }>;
}) {
  const { season: seasonSegment, riderId: riderIdSegment } = await params;
  if (!/^\d+$/.test(riderIdSegment)) notFound();
  const riderId = Number(riderIdSegment);
  if (!Number.isSafeInteger(riderId)) notFound();

  const db = appDb();
  const season = await resolveSeasonByYear(db, seasonSegment);
  if (season === null) notFound();

  const session = await auth();
  const club = await requireClubContext(db, session?.user?.id);

  const { through: throughSearch, event: eventSearch, view: viewSearch } = await searchParams;
  const ordinal = checkpointFromSearch(throughSearch);
  if (
    ordinal === null ||
    (eventSearch !== undefined && typeof eventSearch !== 'string') ||
    (viewSearch !== undefined && viewSearch !== 'my-ride' && viewSearch !== 'field-context')
  )
    notFound();

  const profile = await loadRiderSeason(db, {
    seasonId: season.id,
    clubId: club.clubId,
    riderId,
    checkpoint: ordinal === undefined ? undefined : { kind: 'through', ordinal },
    selectedSourceEventId: eventSearch,
  });
  if (profile === null) notFound();

  return <RiderProfile profile={profile} year={season.year} view={viewSearch ?? 'my-ride'} />;
}
