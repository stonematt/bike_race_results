import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { requireClubContext } from '@/app/club-context.ts';
import { loadStoryCandidate } from '@/lib/editorial-evidence.ts';
import { loadStoryWorkspace, type StorySurface } from '@/lib/editorial-stories.ts';
import { checkpointFromSearch } from '@/lib/reporting-navigation.ts';
import { StoriesWorkspace } from './StoriesWorkspace.tsx';
import { saveStory } from './actions.ts';
import { resolveSeasonByYear } from '../query.ts';

export const dynamic = 'force-dynamic';

function eventIdFromSearch(value: string | string[] | undefined): number | undefined | null {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const eventId = Number(value);
  return Number.isSafeInteger(eventId) && eventId > 0 ? eventId : null;
}

function surfaceFromSearch(value: string | string[] | undefined): StorySurface | null {
  if (value === undefined || value === '') return 'season-dispatch';
  if (value === 'season-dispatch' || value === 'race-review') return value;
  return null;
}

/** Coach/admin selection is re-scoped to the active club before every read. */
export default async function StoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string }>;
  searchParams: Promise<{
    through?: string | string[];
    event?: string | string[];
    surface?: string | string[];
  }>;
}) {
  const { season: year } = await params;
  const db = appDb();
  const season = await resolveSeasonByYear(db, year);
  if (season === null) notFound();

  const session = await auth();
  const context = await requireClubContext(db, session?.user?.id);
  if (context.role === 'member') redirect('/access-unavailable');

  const workspace = await loadStoryWorkspace(db, {
    actorId: context.userId,
    clubId: context.clubId,
    seasonId: season.id,
  });
  if (workspace === null) notFound();

  const query = await searchParams;
  const checkpointOrdinal = checkpointFromSearch(query.through);
  const eventId = eventIdFromSearch(query.event);
  const surface = surfaceFromSearch(query.surface);
  if (checkpointOrdinal === null || eventId === null || surface === null) notFound();

  const preview =
    checkpointOrdinal === undefined || eventId === undefined
      ? undefined
      : await loadStoryCandidate(db, {
          actorId: context.userId,
          clubId: context.clubId,
          seasonId: season.id,
          checkpointOrdinal,
          eventId,
        });

  return (
    <StoriesWorkspace
      year={season.year}
      clubName={context.clubName}
      role={context.role}
      workspace={workspace}
      selection={{ checkpointOrdinal, eventId, surface }}
      preview={preview}
      saveDraft={saveStory.bind(null, String(season.year), context.clubId)}
    />
  );
}
