import Link from 'next/link';
import type {
  Checkpoint,
  DispatchRound,
  SeasonDispatch as SeasonDispatchData,
} from '@/lib/db/editorial-query.ts';

export type SeasonDispatchProps = {
  dispatch: SeasonDispatchData;
};

function checkpointLabel(checkpoint: Checkpoint): string {
  return checkpoint.kind === 'through'
    ? `Through Race ${checkpoint.ordinal}`
    : 'No published checkpoint';
}

function checkpointSearch(checkpoint: Checkpoint): string {
  return checkpoint.kind === 'through' ? `?through=${checkpoint.ordinal}` : '';
}

function CheckpointForm({
  checkpoint,
  rounds,
  seasonYear,
}: {
  checkpoint: Checkpoint;
  rounds: readonly DispatchRound[];
  seasonYear: number;
}) {
  return (
    <form action={`/${seasonYear}`} method="get" className="mt-3 flex flex-wrap items-end gap-2">
      <label htmlFor="through" className="text-sm font-semibold">
        Through race
      </label>
      <select
        id="through"
        name="through"
        defaultValue={checkpoint.kind === 'through' ? String(checkpoint.ordinal) : ''}
        className="border-border bg-surface rounded border px-2 py-1.5 text-sm"
      >
        <option value="">Latest published</option>
        {rounds.map((round) => (
          <option key={round.round.id} value={round.round.ordinal}>
            {round.round.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="bg-navy cursor-pointer rounded px-3 py-1.5 text-sm font-bold text-white hover:bg-fg"
      >
        Update checkpoint
      </button>
    </form>
  );
}

function roundStatus(round: DispatchRound): string {
  if (round.availability === 'after-checkpoint') return 'Not included at this checkpoint';
  if (round.availability === 'unpublished') return 'Results not published';
  if (round.availability === 'partial' || round.clubStarts === null) {
    return 'Some results are not available yet';
  }
  return `${round.clubStarts} ${round.clubStarts === 1 ? 'start' : 'starts'}`;
}

function StartsChart({
  rounds,
  highlightedRound,
}: {
  rounds: readonly DispatchRound[];
  highlightedRound: number | null;
}) {
  const published = rounds.filter(
    (round): round is DispatchRound & { clubStarts: number } =>
      round.availability === 'published' && round.clubStarts !== null,
  );
  if (published.length === 0) {
    return (
      <p className="text-muted mt-3 text-sm">
        No published starts are available at this checkpoint.
      </p>
    );
  }

  const maxStarts = Math.max(...published.map((round) => round.clubStarts));
  const chartLabel = `Club starts by race: ${published
    .map((round) => `${round.round.name}, ${round.clubStarts} starts`)
    .join('; ')}`;

  return (
    <figure className="m-0">
      <figcaption className="text-muted mb-2 text-xs font-bold tracking-wider uppercase">
        Club starts by race
      </figcaption>
      <p className="text-muted text-xs">Scale: 0 to {maxStarts} starts</p>
      <div role="img" aria-label={chartLabel} className="mt-2">
        <ol className="border-border list-none border-y">
          {published.map((round) => {
            const selected = round.round.ordinal === highlightedRound;
            const width = maxStarts === 0 ? '0%' : `${(round.clubStarts / maxStarts) * 100}%`;
            return (
              <li
                key={round.round.id}
                className="border-border grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b py-2 last:border-b-0"
              >
                <span className="text-sm font-semibold">Race {round.round.ordinal}</span>
                <span aria-hidden="true" className="bg-border block h-3 overflow-hidden rounded-sm">
                  <span
                    className={`block h-full ${selected ? 'bg-accent' : 'bg-navy'}`}
                    style={{ width }}
                  />
                </span>
                <span className="text-sm tabular-nums">
                  {round.clubStarts} {round.clubStarts === 1 ? 'start' : 'starts'}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </figure>
  );
}

function RaceRibbon({
  rounds,
  checkpoint,
  seasonYear,
}: {
  rounds: readonly DispatchRound[];
  checkpoint: Checkpoint;
  seasonYear: number;
}) {
  return (
    <ol className="border-border flex list-none flex-wrap border-y py-2">
      {rounds.map((round) => {
        const eventNames = round.events
          .map((event) => (event.conference ? `${event.conference} · ${event.name}` : event.name))
          .join(' / ');
        const content = (
          <>
            <span className="font-display block text-lg tracking-wide uppercase">
              {round.round.name}
            </span>
            <span className="text-muted mt-1 block text-xs">{roundStatus(round)}</span>
            {eventNames ? (
              <span className="text-muted mt-1 block text-xs">{eventNames}</span>
            ) : null}
          </>
        );
        return (
          <li
            key={round.round.id}
            className="border-border min-w-0 basis-1/2 border-b border-r px-3 py-2 even:border-r-0 last:border-b-0"
          >
            {round.availability === 'published' || round.availability === 'partial' ? (
              <Link
                className="hover:text-accent block"
                href={`/${seasonYear}/round/${round.round.ordinal}${checkpointSearch(checkpoint)}`}
              >
                {content}
              </Link>
            ) : (
              <div>{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function SeasonDispatch({ dispatch }: SeasonDispatchProps) {
  const { checkpoint, personalSquad, schedule, season } = dispatch;
  const through = checkpointSearch(checkpoint);
  const featuredRound =
    checkpoint.kind === 'through' && schedule.kind === 'available'
      ? [...schedule.rounds]
          .reverse()
          .find(
            (round): round is DispatchRound & { clubStarts: number } =>
              round.availability === 'published' &&
              round.clubStarts !== null &&
              round.round.ordinal <= checkpoint.ordinal,
          )
      : null;
  const incompleteRound =
    checkpoint.kind === 'through' && schedule.kind === 'available'
      ? [...schedule.rounds]
          .reverse()
          .find(
            (round) =>
              round.availability === 'partial' && round.round.ordinal <= checkpoint.ordinal,
          )
      : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-6 sm:py-8">
      <header className="max-w-3xl">
        <h1 className="font-display text-4xl tracking-wide uppercase">{season.year} season</h1>
        <p className="text-muted mt-2 text-sm">{checkpointLabel(checkpoint)}</p>
        {personalSquad ? (
          <Link
            className="text-fg mt-3 inline-flex text-sm font-bold underline underline-offset-4 hover:text-accent"
            href={`/${season.year}/squad/${personalSquad.slug}${through}`}
          >
            {personalSquad.name} squad
          </Link>
        ) : null}
        {schedule.kind === 'available' ? (
          <CheckpointForm
            checkpoint={checkpoint}
            rounds={schedule.rounds}
            seasonYear={season.year}
          />
        ) : null}
      </header>

      {schedule.kind === 'available' ? (
        <>
          <section className="mt-8" aria-labelledby="race-ribbon-heading">
            <h2 id="race-ribbon-heading" className="sr-only">
              Race ribbon
            </h2>
            <RaceRibbon rounds={schedule.rounds} checkpoint={checkpoint} seasonYear={season.year} />
          </section>

          <section className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.9fr)] md:items-start">
            {featuredRound ? (
              <>
                <div>
                  <h2 className="font-display text-2xl tracking-wide uppercase">
                    {featuredRound.clubStarts} club riders recorded a start at Race{' '}
                    {featuredRound.round.ordinal}.
                  </h2>
                  <p className="text-muted mt-3 max-w-xl text-sm">
                    {featuredRound.firstRecordedStarts === null
                      ? 'First recorded starts are not available at this checkpoint.'
                      : `${featuredRound.firstRecordedStarts} club riders made their first recorded start this season.`}
                  </p>
                  {incompleteRound ? (
                    <p className="text-muted mt-2 max-w-xl text-sm">
                      {incompleteRound.round.name} results are incomplete; showing starts through{' '}
                      {featuredRound.round.name}.
                    </p>
                  ) : null}
                </div>
                <StartsChart
                  rounds={schedule.rounds}
                  highlightedRound={featuredRound.round.ordinal}
                />
                <p className="text-fg text-sm font-semibold md:col-span-2">
                  What would you like to try at the next race?
                </p>
              </>
            ) : (
              <p className="text-muted max-w-xl text-sm">
                Published starts are not included in this checkpoint.
              </p>
            )}
          </section>
        </>
      ) : (
        <p className="border-border bg-surface text-muted mt-8 max-w-2xl rounded-lg border p-5 text-sm">
          The race schedule is not available for this season.
        </p>
      )}

      {featuredRound ? (
        <section className="border-border mt-8 border-t pt-5" aria-labelledby="weekend-heading">
          <h2 id="weekend-heading" className="font-display text-2xl tracking-wide uppercase">
            More from this weekend
          </h2>
          <p className="text-muted mt-2 text-sm">
            Published fields and club rider results from {featuredRound.round.name}.
          </p>
          <Link
            className="mt-3 inline-flex text-sm font-bold underline underline-offset-4"
            href={`/${season.year}/round/${featuredRound.round.ordinal}${through}`}
          >
            Read {featuredRound.round.name} review
          </Link>
        </section>
      ) : null}

      <section className="border-border mt-8 border-t pt-5" aria-labelledby="squad-entry-heading">
        <h2 id="squad-entry-heading" className="font-display text-2xl tracking-wide uppercase">
          {personalSquad ? personalSquad.name : 'No squad linked'}
        </h2>
        {personalSquad ? (
          <Link
            className="text-fg mt-3 inline-flex text-sm font-bold underline underline-offset-4 hover:text-accent"
            href={`/${season.year}/squad/${personalSquad.slug}${through}`}
          >
            Open full {personalSquad.name} roster
          </Link>
        ) : (
          <p className="text-muted mt-3 text-sm">No personal squad is linked for this season.</p>
        )}
        <Link
          className="mt-3 flex w-fit text-sm font-bold underline underline-offset-4"
          href={`/${season.year}/roster${through}`}
        >
          Open club roster
        </Link>
      </section>
    </main>
  );
}
