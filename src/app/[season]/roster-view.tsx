import { notFound } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { requireClubContext } from '@/app/club-context.ts';
import { EditorialRoster } from '@/components/EditorialRoster.tsx';
import { loadEditorialRoster } from '@/lib/db/editorial-roster-query.ts';
import { checkpointFromSearch } from '@/lib/reporting-navigation.ts';
import { loadSquadNavigation } from '@/lib/db/editorial-query.ts';
import { resolveSeasonByYear, resolveSquadBySlug } from './query.ts';

/** Shared protected entry for Club and named Squad roster scopes. */
export async function renderRoster({
  seasonSegment,
  squadSlug,
  through,
}: {
  seasonSegment: string;
  squadSlug?: string;
  through?: string | string[];
}) {
  const db = appDb();
  const season = await resolveSeasonByYear(db, seasonSegment);
  if (season === null) notFound();
  const ordinal = checkpointFromSearch(through);
  if (ordinal === null) notFound();
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const club = await requireClubContext(db, userId);
  const squad =
    squadSlug === undefined
      ? null
      : await resolveSquadBySlug(db, season.id, squadSlug, club.clubId);
  if (squadSlug !== undefined && squad === null) notFound();
  const roster = await loadEditorialRoster(db, {
    seasonId: season.id,
    clubId: club.clubId,
    squadId: squad?.id,
    checkpoint: ordinal === undefined ? undefined : { kind: 'through', ordinal },
  });
  if (roster === null) notFound();
  const { availableSquads: squads } = await loadSquadNavigation(db, club.clubId, season.id, userId);
  return <EditorialRoster roster={roster} squads={squads} />;
}
