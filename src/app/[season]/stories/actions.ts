'use server';

import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { requireClubContext } from '@/app/club-context.ts';
import { AccessDenied } from '@/lib/authz/access.ts';
import {
  createStory,
  loadStory,
  publishStory,
  rejectStoryReview,
  reviseStory,
  reviewStory,
  StoryOperationError,
  type StorySurface,
} from '@/lib/editorial-stories.ts';
import { revalidatePath } from 'next/cache';
import { resolveSeasonByYear } from '../query.ts';
import type { OperationState } from '@/components/OperationsForm.tsx';

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== 'string' || value === '')
    throw new StoryOperationError('Story selection is invalid.');
  return value;
}

function formInteger(data: FormData, name: string, minimum: number): number {
  const value = formText(data, name);
  if (!/^\d+$/.test(value)) throw new StoryOperationError('Story selection is invalid.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new StoryOperationError('Story selection is invalid.');
  }
  return parsed;
}

function formSurface(data: FormData): StorySurface {
  const value = formText(data, 'surface');
  if (value === 'season-dispatch' || value === 'race-review') return value;
  throw new StoryOperationError('Story selection is invalid.');
}

/**
 * Request-time club context is re-read before any Story command. The displayed
 * club is a stale-tab guard, never an authority value supplied by the form.
 */
export async function saveStory(
  year: string,
  displayedClubId: number,
  _state: OperationState,
  data: FormData,
): Promise<OperationState> {
  try {
    const db = appDb();
    const session = await auth();
    const context = await requireClubContext(db, session?.user?.id);
    if (context.clubId !== displayedClubId) {
      return { error: 'Your club selection changed. Reload this page before saving.' };
    }
    const season = await resolveSeasonByYear(db, year);
    if (season === null) return { error: 'This season is unavailable.' };
    const operation = data.get('operation');
    // Detail actions carry only a story id. Re-read it through the protected
    // story seam so a stale season tab cannot alter a story from another year.
    const storyForSeason = async (): Promise<OperationState | undefined> => {
      const story = await loadStory(db, {
        actorId: context.userId,
        clubId: context.clubId,
        storyId: formInteger(data, 'storyId', 1),
      });
      if (story === null || story.seasonId !== season.id) {
        return { error: 'This story is unavailable in the selected season.' };
      }
      return undefined;
    };
    if (operation === 'create') {
      await createStory(db, {
        actorId: context.userId,
        clubId: context.clubId,
        seasonId: season.id,
        checkpointOrdinal: formInteger(data, 'checkpointOrdinal', 0),
        eventId: formInteger(data, 'eventId', 1),
        surface: formSurface(data),
        expectedEvidence: formText(data, 'expectedEvidence'),
      });
      revalidatePath(`/${season.year}/stories`);
      return { message: 'Draft saved.' };
    }
    if (operation === 'review') {
      const error = await storyForSeason();
      if (error) return error;
      await reviewStory(db, {
        actorId: context.userId,
        clubId: context.clubId,
        storyId: formInteger(data, 'storyId', 1),
        expectedRevision: formInteger(data, 'expectedRevision', 1),
        expectedEvidence: formText(data, 'expectedEvidence'),
      });
      revalidatePath(`/${season.year}/stories`);
      return { message: 'Evidence approved.' };
    }
    if (operation === 'revise') {
      const error = await storyForSeason();
      if (error) return error;
      await reviseStory(db, {
        actorId: context.userId,
        clubId: context.clubId,
        storyId: formInteger(data, 'storyId', 1),
        expectedRevision: formInteger(data, 'expectedRevision', 1),
        seasonId: season.id,
        checkpointOrdinal: formInteger(data, 'checkpointOrdinal', 0),
        eventId: formInteger(data, 'eventId', 1),
        surface: formSurface(data),
        expectedEvidence: formText(data, 'expectedEvidence'),
      });
      revalidatePath(`/${season.year}/stories`);
      return { message: 'Draft revised.' };
    }
    if (operation === 'publish') {
      const error = await storyForSeason();
      if (error) return error;
      await publishStory(db, {
        actorId: context.userId,
        clubId: context.clubId,
        storyId: formInteger(data, 'storyId', 1),
        expectedRevision: formInteger(data, 'expectedRevision', 1),
        expectedEvidence: formText(data, 'expectedEvidence'),
      });
      revalidatePath(`/${season.year}/stories`);
      return { message: 'Story published.' };
    }
    if (operation === 'reject') {
      const error = await storyForSeason();
      if (error) return error;
      await rejectStoryReview(db, {
        actorId: context.userId,
        clubId: context.clubId,
        storyId: formInteger(data, 'storyId', 1),
        expectedRevision: formInteger(data, 'expectedRevision', 1),
      });
      revalidatePath(`/${season.year}/stories`);
      return { message: 'Returned to draft.' };
    }
    return { error: 'Choose a supported story action.' };
  } catch (error) {
    if (error instanceof AccessDenied) {
      return { error: 'Your access changed. Reload this page to see your current choices.' };
    }
    if (error instanceof StoryOperationError) return { error: error.message };
    throw error;
  }
}
