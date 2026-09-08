import Link from 'next/link';
import type { StoryCandidateResult } from '@/lib/editorial-evidence.ts';
import type { StorySurface } from '@/lib/editorial-stories.ts';
import { roundHref } from '@/lib/reporting-navigation.ts';
import { OperationsForm, type OperationAction } from '@/components/OperationsForm.tsx';

export type StoryWorkspace = {
  rounds: Array<{
    ordinal: number;
    name: string;
    events: Array<{ id: number; sourceEventId: string; name: string; conference: string | null }>;
  }>;
  stories: Array<{
    id: number;
    state: 'draft' | 'reviewed' | 'published' | 'superseded';
    revision: number;
    surface: StorySurface;
    checkpointOrdinal: number;
    event: {
      id: number;
      sourceEventId: string;
      name: string;
      conference: string | null;
      round: { ordinal: number; name: string };
    };
    validation: { kind: 'current' } | { kind: 'stale-evidence'; reason: string };
  }>;
};

export type StorySelection = {
  checkpointOrdinal?: number;
  eventId?: number;
  surface?: StorySurface;
};

const fieldClass =
  'border-navy bg-surface mt-2 block w-full rounded border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-navy';
const linkClass = 'text-fg text-sm font-bold underline underline-offset-4 hover:text-accent';

function surfaceName(surface: StorySurface): string {
  return surface === 'season-dispatch' ? 'Season weekend section' : 'This Event’s race review';
}

function stateName(
  state: StoryWorkspace['stories'][number]['state'],
  validation: StoryWorkspace['stories'][number]['validation'],
): string {
  if (validation.kind === 'stale-evidence') return 'Evidence changed';
  return state[0]!.toUpperCase() + state.slice(1);
}

function unavailableCopy(
  reason: Exclude<StoryCandidateResult, { kind: 'available' }>['reason'],
): string {
  switch (reason) {
    case 'zero-starts':
      return 'No recorded club starts support this selection. Choose another Event or checkpoint.';
    case 'after-checkpoint':
      return 'That Event is beyond the selected checkpoint. Choose another Event or checkpoint.';
    case 'missing-source':
    case 'invalid-source':
    case 'inconsistent-coverage':
      return 'Published source coverage is not ready for this selection. Choose another Event or checkpoint.';
    default:
      return 'This selection is no longer available. Reload the season and choose again.';
  }
}

function CandidatePreview({ preview, year }: { preview: StoryCandidateResult; year: number }) {
  if (preview.kind === 'unavailable') {
    return (
      <p role="status" className="border-border mt-5 border-t pt-4 text-sm">
        {unavailableCopy(preview.reason)}
      </p>
    );
  }

  const { candidate } = preview;
  const eventName = candidate.event.conference
    ? `${candidate.event.name} (${candidate.event.conference})`
    : candidate.event.name;
  return (
    <section className="border-border mt-7 border-t pt-5" aria-labelledby="preview-heading">
      <h2 id="preview-heading" className="font-display text-2xl tracking-wide uppercase">
        Preview
      </h2>
      <p className="mt-3 max-w-2xl text-lg font-semibold">
        {candidate.count} club {candidate.count === 1 ? 'rider' : 'riders'} recorded a start at{' '}
        {eventName}.
      </p>
      <p className="mt-3 max-w-xl text-sm">What would you like to try at the next race?</p>
      <dl className="mt-5 grid max-w-2xl gap-x-6 gap-y-3 border-border border-y py-4 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="font-bold">Checkpoint</dt>
        <dd>Through race {candidate.checkpoint.ordinal}</dd>
        <dt className="font-bold">Exact Event</dt>
        <dd>{eventName}</dd>
        <dt className="font-bold">Recorded club starts</dt>
        <dd>{candidate.count}</dd>
        <dt className="font-bold">Count basis</dt>
        <dd>
          Distinct identified riders on this club’s current season roster; includes published DNF
          results.
        </dd>
      </dl>
      <Link
        href={roundHref(
          year,
          candidate.event.round.ordinal,
          candidate.checkpoint.ordinal,
          candidate.event.sourceEventId,
        )}
        className={`${linkClass} mt-5 inline-block`}
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
    </section>
  );
}

function StoryRows({ year, stories }: { year: number; stories: StoryWorkspace['stories'] }) {
  const current = stories.filter((story) => story.state !== 'superseded');
  const history = stories.filter((story) => story.state === 'superseded');
  const rows = (items: StoryWorkspace['stories']) => (
    <ul className="mt-4 list-none border-border border-t">
      {items.map((story) => (
        <li
          key={story.id}
          className="border-border flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b py-4"
        >
          <div>
            <p className="font-semibold">
              {story.event.name}
              {story.event.conference ? ` (${story.event.conference})` : ''}
            </p>
            <p className="text-muted mt-1 text-sm">
              {surfaceName(story.surface)} · Through race {story.checkpointOrdinal} ·{' '}
              {stateName(story.state, story.validation)}
            </p>
          </div>
          <Link
            href={`/${year}/stories/${story.id}?through=${story.checkpointOrdinal}`}
            className={linkClass}
          >
            Open
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="border-border mt-9 border-t pt-5" aria-labelledby="stories-heading">
      <h2 id="stories-heading" className="font-display text-2xl tracking-wide uppercase">
        Stories
      </h2>
      {current.length ? (
        rows(current)
      ) : (
        <p className="text-muted mt-3 text-sm">
          No draft, reviewed, or published selections for this season yet.
        </p>
      )}
      {history.length ? (
        <details className="mt-5">
          <summary className="w-fit cursor-pointer text-sm font-bold underline underline-offset-4">
            Superseded history ({history.length})
          </summary>
          {rows(history)}
        </details>
      ) : null}
    </section>
  );
}

/** A narrow, explicit selection surface; it never accepts editorial prose or a client count. */
export function StoriesWorkspace({
  year,
  clubName,
  role,
  workspace,
  selection,
  preview,
  saveDraft,
}: {
  year: number;
  clubName: string;
  role: 'coach' | 'admin';
  workspace: StoryWorkspace;
  selection: StorySelection;
  preview?: StoryCandidateResult;
  saveDraft: OperationAction;
}) {
  const selectedSurface = selection.surface ?? 'season-dispatch';
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header>
        <Link href={`/${year}/operations`} className={linkClass}>
          Back to Club operations
        </Link>
        <h1 className="font-display mt-5 text-4xl tracking-wide uppercase">Stories</h1>
        <p className="text-muted mt-2 text-sm">
          {clubName} · {year} · {role === 'admin' ? 'Admin' : 'Coach'}
        </p>
      </header>

      <section className="border-border mt-8 border-t pt-5" aria-labelledby="selection-heading">
        <h2 id="selection-heading" className="font-display text-2xl tracking-wide uppercase">
          New selection
        </h2>
        <p className="text-muted mt-2 max-w-2xl text-sm">
          Choose an exact Event and checkpoint, then preview the source-derived observation before
          saving a draft.
        </p>
        <form
          action={`/${year}/stories`}
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
              defaultValue={selection.checkpointOrdinal ?? ''}
              required
              className={fieldClass}
            >
              <option value="" disabled>
                Choose a checkpoint
              </option>
              {workspace.rounds.map((round) => (
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
            <select
              id="surface"
              name="surface"
              defaultValue={selectedSurface}
              className={fieldClass}
            >
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
              defaultValue={selection.eventId ?? ''}
              required
              className={fieldClass}
            >
              <option value="" disabled>
                Choose an Event
              </option>
              {workspace.rounds.flatMap((round) =>
                round.events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {round.name} · {event.name}
                    {event.conference ? ` (${event.conference})` : ''}
                  </option>
                )),
              )}
            </select>
          </div>
          <button
            type="submit"
            className="bg-navy hover:bg-fg cursor-pointer rounded px-4 py-2 text-sm font-bold text-white sm:col-span-3 sm:w-fit"
          >
            Preview selection
          </button>
        </form>
        {preview ? <CandidatePreview preview={preview} year={year} /> : null}
        {preview?.kind === 'available' ? (
          <div className="mt-6">
            <OperationsForm action={saveDraft} submitLabel="Save draft">
              <input type="hidden" name="operation" value="create" />
              <input
                type="hidden"
                name="checkpointOrdinal"
                value={preview.candidate.checkpoint.ordinal}
              />
              <input type="hidden" name="eventId" value={preview.candidate.event.id} />
              <input type="hidden" name="surface" value={selectedSurface} />
              <input type="hidden" name="expectedEvidence" value={preview.candidate.fingerprint} />
            </OperationsForm>
          </div>
        ) : null}
      </section>
      <StoryRows year={year} stories={workspace.stories} />
    </main>
  );
}
