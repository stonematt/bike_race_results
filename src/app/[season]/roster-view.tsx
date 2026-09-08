import { notFound } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { resolveClub } from '@/app/races/[eventId]/query.ts';
import { EditorialRoster } from '@/components/EditorialRoster.tsx';
import { loadEditorialRoster } from '@/lib/db/editorial-roster-query.ts';
import { checkpointFromSearch } from '@/lib/reporting-navigation.ts';
import { listCoachSquads, resolveSeasonByYear, resolveSquadBySlug } from './query.ts';

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
  const club = await resolveClub(db, userId);
  if (club === null) notFound();
  const squad =
    squadSlug === undefined ? null : await resolveSquadBySlug(db, season.id, squadSlug, club.id);
  if (squadSlug !== undefined && squad === null) notFound();
  const roster = await loadEditorialRoster(db, {
    seasonId: season.id,
    clubId: club.id,
    squadId: squad?.id,
    checkpoint: ordinal === undefined ? undefined : { kind: 'through', ordinal },
  });
  if (roster === null) notFound();
  const squads = userId === null ? [] : await listCoachSquads(db, userId, season.id, club.id);
  return <EditorialRoster roster={roster} squads={squads} />;
}
