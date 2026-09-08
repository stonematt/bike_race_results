import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { requireClubContext } from '@/app/club-context.ts';
import { loadStoryCandidate } from '@/lib/editorial-evidence.ts';
import { loadStory, loadStoryWorkspace, type StorySurface } from '@/lib/editorial-stories.ts';
import { checkpointFromSearch } from '@/lib/reporting-navigation.ts';
import { StoryDetail } from './StoryDetail.tsx';
import { saveStory } from '../actions.ts';
import { resolveSeasonByYear } from '../../query.ts';

export const dynamic = 'force-dynamic';

function positiveId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function eventIdFromSearch(value: string | string[] | undefined): number | undefined | null {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') return null;
  return positiveId(value);
}

function surfaceFromSearch(value: string | string[] | undefined): StorySurface | undefined | null {
  if (value === undefined || value === '') return undefined;
  if (value === 'season-dispatch' || value === 'race-review') return value;
  return null;
}

/** Detail reads the selected story only after re-resolving active club authority. */
export default async function StoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string; storyId: string }>;
  searchParams: Promise<{
    through?: string | string[];
    event?: string | string[];
    surface?: string | string[];
  }>;
}) {
  const { season: year, storyId: storySegment } = await params;
  const storyId = positiveId(storySegment);
  if (storyId === null) notFound();
  const db = appDb();
  const season = await resolveSeasonByYear(db, year);
  if (season === null) notFound();

  const session = await auth();
  const context = await requireClubContext(db, session?.user?.id);
  if (context.role === 'member') redirect('/access-unavailable');

  const [story, workspace] = await Promise.all([
    loadStory(db, { actorId: context.userId, clubId: context.clubId, storyId }),
    loadStoryWorkspace(db, {
      actorId: context.userId,
      clubId: context.clubId,
      seasonId: season.id,
    }),
  ]);
  if (story === null || story.seasonId !== season.id || workspace === null) notFound();

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
  const replacement = workspace.stories.find(
    (candidate) =>
      candidate.state === 'published' &&
      candidate.id !== story.id &&
      candidate.surface === story.surface &&
      candidate.checkpointOrdinal === story.checkpointOrdinal &&
      (story.surface === 'season-dispatch' || candidate.event.id === story.eventId),
  );

  return (
    <StoryDetail
      year={season.year}
      clubName={context.clubName}
      role={context.role}
      story={story}
      rounds={workspace.rounds}
      selection={{ checkpointOrdinal, eventId, surface }}
      preview={preview}
      replacement={
        replacement
          ? {
              id: replacement.id,
              eventName: `${replacement.event.name}${replacement.event.conference ? ` (${replacement.event.conference})` : ''}`,
            }
          : undefined
      }
      action={saveStory.bind(null, String(season.year), context.clubId)}
    />
  );
}
