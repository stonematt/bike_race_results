import Link from 'next/link';
import type { StoryCandidateResult } from '@/lib/editorial-evidence.ts';
import type { StorySurface } from '@/lib/editorial-stories.ts';
import { roundHref } from '@/lib/reporting-navigation.ts';
import { OperationsForm, type OperationAction } from '@/components/OperationsForm.tsx';
import type { StorySelection, StoryWorkspace } from '../StoriesWorkspace.tsx';

type StoryState = 'draft' | 'reviewed' | 'published' | 'superseded';
type StoryDetailData = {
  id: number;
  eventId: number;
  state: StoryState;
  revision: number;
  surface: StorySurface;
  checkpointOrdinal: number;
  validation: { kind: 'current' } | { kind: 'stale-evidence'; reason: string };
  evidence: StoryCandidateResult;
};

const fieldClass =
  'border-navy bg-surface mt-2 block w-full rounded border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-navy';
const linkClass = 'text-fg text-sm font-bold underline underline-offset-4 hover:text-accent';

function stateName(state: StoryState): string {
  return state[0]!.toUpperCase() + state.slice(1);
}

function surfaceName(surface: StorySurface): string {
  return surface === 'season-dispatch' ? 'Season weekend section' : 'This Event’s race review';
}

function staleCopy(reason: string): string {
  if (reason === 'source')
    return 'The selected source changed. Preview a current selection before drafting again.';
  if (reason === 'current-count')
    return 'The current roster count changed. Preview a current selection before drafting again.';
  if (reason === 'coverage')
    return 'Published source coverage is no longer ready. Choose another Event or checkpoint.';
  return 'This selection is no longer in the requested scope. Choose another Event or checkpoint.';
}

function unavailableCopy(reason: Exclude<StoryCandidateResult, { kind: 'available' }>['reason']) {
  if (reason === 'zero-starts') return 'No recorded club starts support this selection.';
  if (reason === 'after-checkpoint') return 'That Event is beyond the selected checkpoint.';
  if (reason === 'missing-source') return 'The selected source is unavailable.';
  if (reason === 'invalid-source') return 'The selected source no longer matches this Event.';
  if (reason === 'inconsistent-coverage') return 'Published source coverage is not ready.';
  return 'This selection is no longer available.';
}

function CandidateEvidence({
  candidate,
}: {
  candidate: Extract<StoryCandidateResult, { kind: 'available' }>['candidate'];
}) {
  const eventName = candidate.event.conference
    ? `${candidate.event.name} (${candidate.event.conference})`
    : candidate.event.name;
  return (
    <>
      <p className="mt-3 max-w-2xl text-lg font-semibold">
        {candidate.count} club {candidate.count === 1 ? 'rider' : 'riders'} recorded a start at{' '}
        {eventName}.
      </p>
      <p className="text-muted mt-2 max-w-2xl text-sm">
        Distinct identified riders on this club’s current season roster; includes published DNF
        results.
      </p>
      <p className="mt-3 text-sm">What would you like to try at the next race?</p>
      <dl className="mt-5 grid max-w-2xl gap-x-6 gap-y-3 border-border border-y py-4 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="font-bold">Checkpoint</dt>
        <dd>Through race {candidate.checkpoint.ordinal}</dd>
        <dt className="font-bold">Exact Event</dt>
        <dd>{eventName}</dd>
        <dt className="font-bold">Recorded club starts</dt>
        <dd>{candidate.count}</dd>
      </dl>
      <Link
        href={roundHref(
          candidate.season.year,
          candidate.event.round.ordinal,
          candidate.checkpoint.ordinal,
          candidate.event.sourceEventId,
        )}
        className={`${linkClass} mt-5 inline-flex min-h-11 items-center`}
      >
        See {candidate.event.name} results
      </Link>
      <details className="mt-5 max-w-2xl">
        <summary className="w-fit cursor-pointer text-sm font-bold underline underline-offset-4">
          Source evidence
        </summary>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="font-bold">Raw revision</dt>
          <dd>{candidate.source.rawFetchId}</dd>
          <dt className="font-bold">Selected list</dt>
          <dd>
            {candidate.source.listId}
            {candidate.source.hidden ? ' (hidden)' : ''}
          </dd>
          <dt className="font-bold">Source hash</dt>
          <dd className="break-all">{candidate.source.contentHash}</dd>
        </dl>
      </details>
    </>
  );
}

function hiddenRevision(story: StoryDetailData, evidence?: string) {
  return (
    <>
      <input type="hidden" name="storyId" value={story.id} />
      <input type="hidden" name="expectedRevision" value={story.revision} />
      {evidence ? <input type="hidden" name="expectedEvidence" value={evidence} /> : null}
    </>
  );
}

function RevisionForm({
  year,
  story,
  rounds,
  selection,
  preview,
  action,
  mode = 'revise',
}: {
  year: number;
  story: StoryDetailData;
  rounds: StoryWorkspace['rounds'];
  selection: StorySelection;
  preview?: StoryCandidateResult;
  action: OperationAction;
  mode?: 'revise' | 'create';
}) {
  const surface = selection.surface ?? story.surface;
  const candidate = preview?.kind === 'available' ? preview.candidate : undefined;
  const selectedEventId =
    selection.eventId ??
    (story.evidence.kind === 'available' ? story.evidence.candidate.event.id : story.eventId);
  return (
    <section className="border-border mt-9 border-t pt-5" aria-labelledby="revise-heading">
      <h2 id="revise-heading" className="font-display text-2xl tracking-wide uppercase">
        Revise selection
      </h2>
      <form
        action={`/${year}/stories/${story.id}`}
        method="get"
        className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-3 sm:items-end"
      >
        <div>
          <label htmlFor="through" className="text-sm font-bold">
            Through race
          </label>
          <select
            id="through"
            name="through"
            defaultValue={selection.checkpointOrdinal ?? story.checkpointOrdinal}
            required
            className={fieldClass}
          >
            {rounds.map((round) => (
              <option key={round.ordinal} value={round.ordinal}>
                {round.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="surface" className="text-sm font-bold">
            Placement
          </label>
          <select id="surface" name="surface" defaultValue={surface} className={fieldClass}>
            <option value="season-dispatch">Season weekend section</option>
            <option value="race-review">This Event’s race review</option>
          </select>
        </div>
        <div>
          <label htmlFor="event" className="text-sm font-bold">
            Event
          </label>
          <select
            id="event"
            name="event"
            defaultValue={selectedEventId}
            required
            className={fieldClass}
          >
            <option value="" disabled>
              Choose an Event
            </option>
            {rounds.flatMap((round) =>
              round.events.map((event) => (
                <option key={event.id} value={event.id}>
                  {round.name} · {event.name}
                  {event.conference ? ` (${event.conference})` : ''} · {event.sourceEventId}
                </option>
              )),
            )}
          </select>
        </div>
        <button
          type="submit"
          className="bg-navy hover:bg-fg cursor-pointer rounded px-4 py-2 text-sm font-bold text-white sm:col-span-3 sm:w-fit"
        >
          Preview revision
        </button>
      </form>
      {candidate ? (
        <section className="mt-6" aria-labelledby="revision-preview-heading">
          <h3
            id="revision-preview-heading"
            className="font-display text-xl tracking-wide uppercase"
          >
            Revision preview
          </h3>
          <CandidateEvidence candidate={candidate} />
          <OperationsForm
            action={action}
            submitLabel={mode === 'revise' ? 'Save revised draft' : 'Create refreshed draft'}
          >
            <input type="hidden" name="operation" value={mode} />
            {mode === 'revise' ? hiddenRevision(story) : null}
            <input type="hidden" name="checkpointOrdinal" value={candidate.checkpoint.ordinal} />
            <input type="hidden" name="eventId" value={candidate.event.id} />
            <input type="hidden" name="surface" value={surface} />
            <input type="hidden" name="expectedEvidence" value={candidate.fingerprint} />
          </OperationsForm>
        </section>
      ) : preview?.kind === 'unavailable' ? (
        <p role="status" className="mt-5 text-sm">
          {unavailableCopy(preview.reason)} Choose another Event or checkpoint.
        </p>
      ) : null}
    </section>
  );
}

/** Management detail keeps state transitions separate from the generated observation. */
export function StoryDetail({
  year,
  clubName,
  role,
  story,
  rounds,
  selection,
  preview,
  replacement,
  action,
}: {
  year: number;
  clubName: string;
  role: 'coach' | 'admin';
  story: StoryDetailData;
  rounds: StoryWorkspace['rounds'];
  selection: StorySelection;
  preview?: StoryCandidateResult;
  replacement?: { id: number; eventName: string };
  action: OperationAction;
}) {
  const currentCandidate =
    story.validation.kind === 'current' && story.evidence.kind === 'available'
      ? story.evidence.candidate
      : undefined;
  const revisionPreview = preview ?? story.evidence;
  const canEdit = story.state === 'draft' || story.state === 'reviewed';
  const reportingHref = currentCandidate
    ? story.surface === 'season-dispatch'
      ? `/${year}?through=${currentCandidate.checkpoint.ordinal}`
      : roundHref(
          year,
          currentCandidate.event.round.ordinal,
          currentCandidate.checkpoint.ordinal,
          currentCandidate.event.sourceEventId,
        )
    : undefined;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header>
        <Link href={`/${year}/stories?through=${story.checkpointOrdinal}`} className={linkClass}>
          Back to Stories
        </Link>
        <h1 className="font-display mt-5 text-4xl tracking-wide uppercase">
          {stateName(story.state)} story
        </h1>
        <p className="text-muted mt-2 text-sm">
          {clubName} · {year} · {surfaceName(story.surface)} · revision {story.revision}
        </p>
      </header>

      <section className="border-border mt-8 border-t pt-5" aria-labelledby="observation-heading">
        <h2 id="observation-heading" className="font-display text-2xl tracking-wide uppercase">
          Selected observation
        </h2>
        {currentCandidate ? (
          <CandidateEvidence candidate={currentCandidate} />
        ) : (
          <p role="status" className="mt-3 max-w-2xl text-sm">
            {staleCopy(
              story.validation.kind === 'stale-evidence' ? story.validation.reason : 'scope',
            )}
          </p>
        )}
      </section>

      {canEdit ? (
        <RevisionForm
          year={year}
          story={story}
          rounds={rounds}
          selection={selection}
          preview={revisionPreview}
          action={action}
        />
      ) : null}

      {(story.state === 'published' || story.state === 'superseded') && !currentCandidate ? (
        <RevisionForm
          year={year}
          story={story}
          rounds={rounds}
          selection={selection}
          preview={revisionPreview}
          action={action}
          mode="create"
        />
      ) : null}

      {role === 'admin' && currentCandidate && story.state === 'draft' ? (
        <section className="border-border mt-9 border-t pt-5" aria-labelledby="review-heading">
          <h2 id="review-heading" className="font-display text-2xl tracking-wide uppercase">
            Evidence review
          </h2>
          <p className="text-muted mt-2 max-w-2xl text-sm">
            Approve this exact revision and its current server-derived evidence before it can be
            published.
          </p>
          <div className="mt-5">
            <OperationsForm action={action} submitLabel="Approve this evidence">
              <input type="hidden" name="operation" value="review" />
              {hiddenRevision(story, currentCandidate.fingerprint)}
            </OperationsForm>
          </div>
        </section>
      ) : null}

      {role === 'admin' && currentCandidate && story.state === 'reviewed' ? (
        <section className="border-border mt-9 border-t pt-5" aria-labelledby="publish-heading">
          <h2 id="publish-heading" className="font-display text-2xl tracking-wide uppercase">
            Publish
          </h2>
          {replacement ? (
            <p className="mt-2 text-sm">Publishing replaces {replacement.eventName}.</p>
          ) : (
            <p className="mt-2 text-sm">No current publication uses this placement.</p>
          )}
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <OperationsForm action={action} submitLabel="Return to draft">
              <input type="hidden" name="operation" value="reject" />
              {hiddenRevision(story)}
            </OperationsForm>
            <OperationsForm action={action} submitLabel="Publish story">
              <input type="hidden" name="operation" value="publish" />
              {hiddenRevision(story, currentCandidate.fingerprint)}
            </OperationsForm>
          </div>
        </section>
      ) : null}

      {(story.state === 'published' || story.state === 'superseded') && currentCandidate ? (
        <section className="border-border mt-9 border-t pt-5" aria-labelledby="new-draft-heading">
          <h2 id="new-draft-heading" className="font-display text-2xl tracking-wide uppercase">
            New draft
          </h2>
          <p className="text-muted mt-2 text-sm">
            Published selections are immutable. A fresh draft requires its own evidence review.
          </p>
          <div className="mt-5">
            <OperationsForm action={action} submitLabel="Create a new draft">
              <input type="hidden" name="operation" value="create" />
              <input
                type="hidden"
                name="checkpointOrdinal"
                value={currentCandidate.checkpoint.ordinal}
              />
              <input type="hidden" name="eventId" value={currentCandidate.event.id} />
              <input type="hidden" name="surface" value={story.surface} />
              <input type="hidden" name="expectedEvidence" value={currentCandidate.fingerprint} />
            </OperationsForm>
          </div>
        </section>
      ) : null}

      {reportingHref ? (
        <Link
          href={reportingHref}
          className={`${linkClass} mt-9 inline-flex min-h-11 items-center`}
        >
          Open reporting placement
        </Link>
      ) : null}
    </main>
  );
}
