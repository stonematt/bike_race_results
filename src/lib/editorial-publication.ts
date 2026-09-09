import { and, eq } from 'drizzle-orm';
import { editorialStory } from './db/schema.ts';
import { requireClubRole } from './authz/access.ts';
import type { Database } from './db/index.ts';
import { loadStoryCandidate, type StoryCandidate } from './editorial-evidence.ts';

export type PublishedStoryInput = {
  actorId: string;
  clubId: number;
  seasonId: number;
  checkpointOrdinal: number;
  surface: 'season-dispatch' | 'race-review';
  eventId?: number;
};
export type PublishedStory = {
  id: number;
  surface: 'season-dispatch' | 'race-review';
  candidate: StoryCandidate;
};
export async function loadPublishedStory(
  db: Database,
  input: PublishedStoryInput,
): Promise<PublishedStory | null> {
  return db.transaction(
    async (tx) => {
      await requireClubRole(tx, input.actorId, input.clubId, ['member', 'coach', 'admin']);
      const [story] = await tx
        .select()
        .from(editorialStory)
        .where(
          and(
            eq(editorialStory.clubId, input.clubId),
            eq(editorialStory.seasonId, input.seasonId),
            eq(editorialStory.checkpointOrdinal, input.checkpointOrdinal),
            eq(editorialStory.surface, input.surface),
            eq(editorialStory.state, 'published'),
            input.surface === 'race-review'
              ? eq(editorialStory.eventId, input.eventId ?? -1)
              : undefined,
          ),
        );
      if (
        !story ||
        story.reviewedRevision !== story.revision ||
        story.reviewedAt === null ||
        story.reviewedByUserId === null ||
        story.publishedAt === null ||
        story.publishedByUserId === null
      )
        return null;
      const evidence = await loadStoryCandidate(tx, {
        actorId: input.actorId,
        clubId: input.clubId,
        seasonId: input.seasonId,
        checkpointOrdinal: input.checkpointOrdinal,
        eventId: story.eventId,
      });
      if (
        evidence.kind !== 'available' ||
        evidence.candidate.count !== story.approvedCount ||
        evidence.candidate.fingerprint !== story.evidenceFingerprint
      )
        return null;
      const { source } = evidence.candidate;
      if (
        source.rawFetchId !== story.sourceRawFetchId ||
        source.contentHash !== story.sourceContentHash ||
        source.listId !== story.sourceListId ||
        source.hidden !== story.sourceHidden
      )
        return null;
      return { id: story.id, surface: story.surface, candidate: evidence.candidate };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
