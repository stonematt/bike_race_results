/**
 * Club-managed, constrained story selections; no free prose or athlete records.
 *
 * Mutations lock Club → re-read active authority → lock Story, then validate a
 * single candidate snapshot before writing approval/publication and audit data.
 * The Club lock serializes membership changes and competing publications. It
 * does not lock ingestion: a later correction makes the next read stale.
 * Management reads use a read-only repeatable-read snapshot across story rows
 * and candidate validation. Disposable Postgres must verify concurrent behavior;
 * sequential migrated-PGlite tests establish only the public state transitions.
 */
import type { Database } from './db/index.ts';
import { and, asc, desc, eq } from 'drizzle-orm';
import { requireClubRole } from './authz/access.ts';
import {
  loadStoryCandidate,
  type StoryCandidateInput,
  type StoryCandidateResult,
} from './editorial-evidence.ts';
import { club, clubAuditEvent, editorialStory, season, round, event } from './db/schema.ts';

export type StorySurface = 'season-dispatch' | 'race-review';
export type CreateStoryInput = StoryCandidateInput & {
  surface: StorySurface;
  expectedEvidence: string;
};
export class StoryOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryOperationError';
  }
}

function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;
}
function validateActorScope(input: { actorId: string; clubId: number }) {
  if (typeof input.actorId !== 'string' || input.actorId.trim() === '' || !positiveId(input.clubId))
    throw new StoryOperationError('Story scope is invalid.');
}
function validateSelection(input: CreateStoryInput) {
  if (
    !positiveId(input.seasonId) ||
    !positiveId(input.eventId) ||
    !Number.isInteger(input.checkpointOrdinal) ||
    input.checkpointOrdinal < 0 ||
    input.checkpointOrdinal > 2147483647 ||
    (input.surface !== 'season-dispatch' && input.surface !== 'race-review')
  )
    throw new StoryOperationError('Story selection is invalid.');
}

export async function createStory(db: Database, input: CreateStoryInput): Promise<{ id: number }> {
  validateActorScope(input);
  return db.transaction(async (tx) => {
    await tx.select({ id: club.id }).from(club).where(eq(club.id, input.clubId)).for('update');
    await requireClubRole(tx, input.actorId, input.clubId, ['coach', 'admin']);
    validateSelection(input);
    const evidence = await loadStoryCandidate(tx, input);
    if (
      evidence.kind !== 'available' ||
      evidence.candidate.fingerprint !== input.expectedEvidence
    ) {
      throw new StoryOperationError(
        'Evidence changed or is unavailable. Preview the selection again.',
      );
    }
    const candidate = evidence.candidate;
    const [created] = await tx
      .insert(editorialStory)
      .values({
        clubId: input.clubId,
        seasonId: input.seasonId,
        checkpointOrdinal: input.checkpointOrdinal,
        eventId: input.eventId,
        surface: input.surface,
        sourceRawFetchId: candidate.source.rawFetchId,
        sourceContentHash: candidate.source.contentHash,
        sourceListId: candidate.source.listId,
        sourceHidden: candidate.source.hidden,
        evidenceFingerprint: candidate.fingerprint,
        createdByUserId: input.actorId,
        updatedByUserId: input.actorId,
      })
      .returning({ id: editorialStory.id });
    if (!created) throw new StoryOperationError('Story could not be created.');
    await tx.insert(clubAuditEvent).values({
      clubId: input.clubId,
      actorUserId: input.actorId,
      action: 'story-created',
      storyId: created.id,
    });
    return created;
  });
}

export async function loadStory(
  db: Database,
  input: { actorId: string; clubId: number; storyId: number },
) {
  validateActorScope(input);
  if (!positiveId(input.storyId)) throw new StoryOperationError('Story scope is invalid.');
  // Story metadata and its current evidence share a repeatable-read snapshot.
  // A correction may commit afterward; the next request checks again.
  return db.transaction(
    async (tx) => {
      await requireClubRole(tx, input.actorId, input.clubId, ['coach', 'admin']);
      const [story] = await tx
        .select()
        .from(editorialStory)
        .where(and(eq(editorialStory.id, input.storyId), eq(editorialStory.clubId, input.clubId)));
      if (!story) return null;
      const evidence = await loadStoryCandidate(tx, {
        actorId: input.actorId,
        clubId: input.clubId,
        seasonId: story.seasonId,
        eventId: story.eventId,
        checkpointOrdinal: story.checkpointOrdinal,
      });
      return { ...story, evidence, validation: validateEvidence(story, evidence) };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

export type ReviseStoryInput = CreateStoryInput & { storyId: number; expectedRevision: number };

export async function reviseStory(
  db: Database,
  input: ReviseStoryInput,
): Promise<{ id: number; revision: number }> {
  validateActorScope(input);
  if (!positiveId(input.storyId) || !positiveId(input.expectedRevision))
    throw new StoryOperationError('Story revision is invalid.');
  return db.transaction(async (tx) => {
    await tx.select({ id: club.id }).from(club).where(eq(club.id, input.clubId)).for('update');
    await requireClubRole(tx, input.actorId, input.clubId, ['coach', 'admin']);
    validateSelection(input);
    const [story] = await tx
      .select()
      .from(editorialStory)
      .where(and(eq(editorialStory.id, input.storyId), eq(editorialStory.clubId, input.clubId)))
      .for('update');
    if (!story) throw new StoryOperationError('Story is unavailable.');
    if (story.revision !== input.expectedRevision)
      throw new StoryOperationError('Story changed. Reload and review the current revision.');
    if (story.state === 'published' || story.state === 'superseded')
      throw new StoryOperationError('Published selections are immutable. Create a new draft.');
    const evidence = await loadStoryCandidate(tx, input);
    if (
      evidence.kind !== 'available' ||
      evidence.candidate.fingerprint !== input.expectedEvidence
    ) {
      throw new StoryOperationError(
        'Evidence changed or is unavailable. Preview the selection again.',
      );
    }
    const candidate = evidence.candidate;
    const revision = story.revision + 1;
    await tx
      .update(editorialStory)
      .set({
        seasonId: input.seasonId,
        checkpointOrdinal: input.checkpointOrdinal,
        eventId: input.eventId,
        surface: input.surface,
        sourceRawFetchId: candidate.source.rawFetchId,
        sourceContentHash: candidate.source.contentHash,
        sourceListId: candidate.source.listId,
        sourceHidden: candidate.source.hidden,
        evidenceFingerprint: candidate.fingerprint,
        revision,
        state: 'draft',
        reviewedRevision: null,
        approvedCount: null,
        reviewedByUserId: null,
        reviewedAt: null,
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
      })
      .where(eq(editorialStory.id, story.id));
    await tx.insert(clubAuditEvent).values({
      clubId: input.clubId,
      actorUserId: input.actorId,
      action: 'story-revised',
      storyId: story.id,
    });
    return { id: story.id, revision };
  });
}

export type StoryRevisionInput = {
  actorId: string;
  clubId: number;
  storyId: number;
  expectedRevision: number;
};
export type ReviewStoryInput = StoryRevisionInput & { expectedEvidence: string };

export async function reviewStory(
  db: Database,
  input: ReviewStoryInput,
): Promise<{ id: number; revision: number }> {
  validateActorScope(input);
  if (!positiveId(input.storyId) || !positiveId(input.expectedRevision))
    throw new StoryOperationError('Story revision is invalid.');
  return db.transaction(async (tx) => {
    await tx.select({ id: club.id }).from(club).where(eq(club.id, input.clubId)).for('update');
    await requireClubRole(tx, input.actorId, input.clubId, ['admin']);
    const [story] = await tx
      .select()
      .from(editorialStory)
      .where(and(eq(editorialStory.id, input.storyId), eq(editorialStory.clubId, input.clubId)))
      .for('update');
    if (!story) throw new StoryOperationError('Story is unavailable.');
    if (story.revision !== input.expectedRevision)
      throw new StoryOperationError('Story changed. Reload and review the current revision.');
    if (story.state === 'published' || story.state === 'superseded')
      throw new StoryOperationError('Published selections are immutable. Create a new draft.');
    const evidence = await loadStoryCandidate(tx, {
      actorId: input.actorId,
      clubId: input.clubId,
      seasonId: story.seasonId,
      checkpointOrdinal: story.checkpointOrdinal,
      eventId: story.eventId,
    });
    if (
      evidence.kind !== 'available' ||
      evidence.candidate.fingerprint !== input.expectedEvidence ||
      validateEvidence(story, evidence).kind !== 'current'
    ) {
      throw new StoryOperationError(
        'Evidence changed or is unavailable. Preview the selection again.',
      );
    }
    const now = new Date();
    await tx
      .update(editorialStory)
      .set({
        state: 'reviewed',
        reviewedRevision: story.revision,
        approvedCount: evidence.candidate.count,
        reviewedByUserId: input.actorId,
        reviewedAt: now,
        updatedByUserId: input.actorId,
        updatedAt: now,
      })
      .where(eq(editorialStory.id, story.id));
    await tx.insert(clubAuditEvent).values({
      clubId: input.clubId,
      actorUserId: input.actorId,
      action: 'story-reviewed',
      storyId: story.id,
    });
    return { id: story.id, revision: story.revision };
  });
}

export type PublishStoryInput = ReviewStoryInput;
export async function publishStory(
  db: Database,
  input: PublishStoryInput,
): Promise<{ id: number; revision: number }> {
  validateActorScope(input);
  if (!positiveId(input.storyId) || !positiveId(input.expectedRevision))
    throw new StoryOperationError('Story revision is invalid.');
  return db.transaction(async (tx) => {
    await tx.select({ id: club.id }).from(club).where(eq(club.id, input.clubId)).for('update');
    await requireClubRole(tx, input.actorId, input.clubId, ['admin']);
    const [story] = await tx
      .select()
      .from(editorialStory)
      .where(and(eq(editorialStory.id, input.storyId), eq(editorialStory.clubId, input.clubId)))
      .for('update');
    if (!story) throw new StoryOperationError('Story is unavailable.');
    if (story.revision !== input.expectedRevision)
      throw new StoryOperationError('Story changed. Reload and review the current revision.');
    if (story.state === 'published' || story.state === 'superseded')
      throw new StoryOperationError('Published selections are immutable. Create a new draft.');
    const evidence = await loadStoryCandidate(tx, {
      actorId: input.actorId,
      clubId: input.clubId,
      seasonId: story.seasonId,
      checkpointOrdinal: story.checkpointOrdinal,
      eventId: story.eventId,
    });
    if (
      evidence.kind !== 'available' ||
      evidence.candidate.fingerprint !== input.expectedEvidence ||
      validateEvidence(story, evidence).kind !== 'current'
    ) {
      throw new StoryOperationError(
        'Evidence changed or is unavailable. Preview the selection again.',
      );
    }
    if (
      story.state !== 'reviewed' ||
      story.reviewedRevision !== story.revision ||
      story.approvedCount !== evidence.candidate.count ||
      story.reviewedAt === null ||
      story.reviewedByUserId === null
    ) {
      throw new StoryOperationError('Review the current draft before publishing.');
    }
    const now = new Date();
    await tx
      .update(editorialStory)
      .set({
        state: 'superseded',
        supersededByStoryId: story.id,
        updatedByUserId: input.actorId,
        updatedAt: now,
      })
      .where(
        and(
          eq(editorialStory.clubId, story.clubId),
          eq(editorialStory.seasonId, story.seasonId),
          eq(editorialStory.checkpointOrdinal, story.checkpointOrdinal),
          eq(editorialStory.surface, story.surface),
          eq(editorialStory.state, 'published'),
          story.surface === 'race-review' ? eq(editorialStory.eventId, story.eventId) : undefined,
        ),
      );
    await tx
      .update(editorialStory)
      .set({
        state: 'published',
        publishedByUserId: input.actorId,
        publishedAt: now,
        updatedByUserId: input.actorId,
        updatedAt: now,
      })
      .where(eq(editorialStory.id, story.id));
    await tx.insert(clubAuditEvent).values({
      clubId: input.clubId,
      actorUserId: input.actorId,
      action: 'story-published',
      storyId: story.id,
    });
    return { id: story.id, revision: story.revision };
  });
}

export async function rejectStoryReview(
  db: Database,
  input: StoryRevisionInput,
): Promise<{ id: number; revision: number }> {
  validateActorScope(input);
  if (!positiveId(input.storyId) || !positiveId(input.expectedRevision))
    throw new StoryOperationError('Story revision is invalid.');
  return db.transaction(async (tx) => {
    await tx.select({ id: club.id }).from(club).where(eq(club.id, input.clubId)).for('update');
    await requireClubRole(tx, input.actorId, input.clubId, ['admin']);
    const [story] = await tx
      .select()
      .from(editorialStory)
      .where(and(eq(editorialStory.id, input.storyId), eq(editorialStory.clubId, input.clubId)))
      .for('update');
    if (!story) throw new StoryOperationError('Story is unavailable.');
    if (story.revision !== input.expectedRevision)
      throw new StoryOperationError('Story changed. Reload and review the current revision.');
    if (story.state === 'published' || story.state === 'superseded')
      throw new StoryOperationError('Published selections are immutable. Create a new draft.');
    await tx
      .update(editorialStory)
      .set({
        state: 'draft',
        reviewedAt: null,
        reviewedByUserId: null,
        reviewedRevision: null,
        approvedCount: null,
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
      })
      .where(eq(editorialStory.id, story.id));
    await tx.insert(clubAuditEvent).values({
      clubId: input.clubId,
      actorUserId: input.actorId,
      action: 'story-review-rejected',
      storyId: story.id,
    });
    return { id: story.id, revision: story.revision };
  });
}

export type StoryEvidenceValidation =
  | { kind: 'current' }
  | {
      kind: 'stale-evidence';
      reason: 'source' | 'current-count' | 'scope' | 'coverage' | 'displayed-evidence';
    };

function validateEvidence(
  story: typeof editorialStory.$inferSelect,
  evidence: StoryCandidateResult,
): StoryEvidenceValidation {
  if (evidence.kind !== 'available') {
    const reason =
      evidence.reason === 'missing-source'
        ? 'source'
        : evidence.reason === 'zero-starts'
          ? 'current-count'
          : evidence.reason === 'inconsistent-coverage' || evidence.reason === 'invalid-source'
            ? 'coverage'
            : 'scope';
    return { kind: 'stale-evidence', reason };
  }
  const candidate = evidence.candidate;
  if (
    story.sourceRawFetchId !== candidate.source.rawFetchId ||
    story.sourceContentHash !== candidate.source.contentHash ||
    story.sourceListId !== candidate.source.listId ||
    story.sourceHidden !== candidate.source.hidden
  )
    return { kind: 'stale-evidence', reason: 'source' };
  if (story.approvedCount !== null && story.approvedCount !== candidate.count)
    return { kind: 'stale-evidence', reason: 'current-count' };
  if (story.evidenceFingerprint !== candidate.fingerprint)
    return { kind: 'stale-evidence', reason: 'displayed-evidence' };
  return { kind: 'current' };
}

export type StoryWorkspaceInput = { actorId: string; clubId: number; seasonId: number };
export type StoryWorkspaceEvent = {
  id: number;
  sourceEventId: string;
  name: string;
  conference: string | null;
};
export type StoryWorkspace = {
  season: { id: number; year: number };
  rounds: { ordinal: number; name: string; events: StoryWorkspaceEvent[] }[];
  stories: {
    id: number;
    state: (typeof editorialStory.$inferSelect)['state'];
    revision: number;
    surface: StorySurface;
    checkpointOrdinal: number;
    event: StoryWorkspaceEvent & { round: { ordinal: number; name: string } };
    validation: StoryEvidenceValidation;
  }[];
};

/** Management summaries and source checks share one read-only snapshot. */
export async function loadStoryWorkspace(
  db: Database,
  input: StoryWorkspaceInput,
): Promise<StoryWorkspace | null> {
  validateActorScope(input);
  if (!positiveId(input.seasonId)) throw new StoryOperationError('Story scope is invalid.');
  return db.transaction(
    async (tx) => {
      await requireClubRole(tx, input.actorId, input.clubId, ['coach', 'admin']);
      const [selectedSeason] = await tx
        .select({ id: season.id, year: season.year })
        .from(season)
        .where(eq(season.id, input.seasonId));
      if (!selectedSeason) return null;
      const rounds = await tx
        .select()
        .from(round)
        .where(eq(round.seasonId, input.seasonId))
        .orderBy(asc(round.ordinal));
      const events = await tx
        .select({ event })
        .from(event)
        .innerJoin(round, eq(round.id, event.roundId))
        .where(eq(round.seasonId, input.seasonId))
        .orderBy(asc(event.sourceEventId));
      const stored = await tx
        .select({ story: editorialStory, event, round })
        .from(editorialStory)
        .innerJoin(event, eq(event.id, editorialStory.eventId))
        .innerJoin(round, eq(round.id, event.roundId))
        .where(
          and(eq(editorialStory.clubId, input.clubId), eq(editorialStory.seasonId, input.seasonId)),
        )
        .orderBy(desc(editorialStory.updatedAt), desc(editorialStory.id));
      const stories: StoryWorkspace['stories'] = [];
      for (const item of stored) {
        const evidence = await loadStoryCandidate(tx, {
          actorId: input.actorId,
          clubId: input.clubId,
          seasonId: item.story.seasonId,
          checkpointOrdinal: item.story.checkpointOrdinal,
          eventId: item.story.eventId,
        });
        stories.push({
          id: item.story.id,
          state: item.story.state,
          revision: item.story.revision,
          surface: item.story.surface,
          checkpointOrdinal: item.story.checkpointOrdinal,
          event: {
            id: item.event.id,
            sourceEventId: item.event.sourceEventId,
            name: item.event.name,
            conference: item.event.conference,
            round: { ordinal: item.round.ordinal, name: item.round.name },
          },
          validation: validateEvidence(item.story, evidence),
        });
      }
      return {
        season: selectedSeason,
        rounds: rounds.map((item) => ({
          ordinal: item.ordinal,
          name: item.name,
          events: events
            .filter((entry) => entry.event.roundId === item.id)
            .map(({ event: race }) => ({
              id: race.id,
              sourceEventId: race.sourceEventId,
              name: race.name,
              conference: race.conference,
            })),
        })),
        stories,
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
