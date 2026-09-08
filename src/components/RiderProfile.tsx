import Link from 'next/link';
import { roundHref } from '../lib/reporting-navigation.ts';
import type {
  RiderMeasurement,
  RiderSelectedResult,
  RiderSeason,
} from '../lib/db/editorial-query.ts';
import type { RaceResultRow } from './race-detail.ts';

export type RiderProfileProps = {
  profile: RiderSeason;
  year: number;
  view?: 'my-ride' | 'field-context';
};

function checkpointLabel(profile: RiderSeason): string {
  return profile.checkpoint.kind === 'through'
    ? `Through Race ${profile.checkpoint.ordinal}`
    : 'No published checkpoint';
}

function eventHref(
  year: number,
  riderId: number,
  through: number,
  sourceEventId: string,
  view?: RiderProfileProps['view'],
): string {
  const base = `/${year}/rider/${riderId}?through=${through}&event=${encodeURIComponent(sourceEventId)}`;
  return view === undefined ? base : `${base}&view=${view}`;
}

function published(value: string): string {
  return value.trim() === '' ? 'Not published' : value;
}

function resultContext(result: RaceResultRow): string {
  const category = `${result.category}${result.conference === null ? '' : ` · ${result.conference}`}`;
  if (result.status === 'dnf') return `${category} · DNF · time comparison unavailable`;
  const lap =
    result.lapsDown !== null && result.lapsDown > 0
      ? ` · −${result.lapsDown} lap${result.lapsDown === 1 ? '' : 's'}`
      : '';
  return `${category} · place ${published(result.place)}${lap}`;
}

function Measurements({ measured }: { measured: RiderMeasurement }) {
  if (measured.kind === 'none') {
    return <p className="text-muted mt-4 text-sm">No lap measurements were published.</p>;
  }

  if (measured.kind === 'one') {
    return (
      <dl className="mt-4 text-sm">
        <div>
          <dt className="text-muted">{measured.label}</dt>
          <dd className="font-semibold tabular-nums">{measured.value}</dd>
        </div>
      </dl>
    );
  }

  const readable = measured.values.filter(
    (value): value is typeof value & { seconds: number } => value.seconds !== null,
  );
  const maxSeconds = Math.max(0, ...readable.map((value) => value.seconds));
  const description = measured.values.map((value) => `${value.label} ${value.value}`).join('; ');

  return (
    <figure className="mt-4" role="img" aria-label={`Measured laps: ${description}`}>
      <figcaption className="text-muted text-sm">Measured laps</figcaption>
      <ul className="mt-2 list-none space-y-2 p-0 text-sm">
        {measured.values.map((value) => (
          <li key={value.label} className="grid grid-cols-[4rem_1fr_auto] items-center gap-2">
            <span className="text-muted">{value.label}</span>
            {value.seconds === null ? (
              <span className="text-muted">Published value is not readable as a duration.</span>
            ) : (
              <span className="bg-surface h-3 overflow-hidden rounded-sm" aria-hidden="true">
                <span
                  className="bg-navy block h-full rounded-sm"
                  style={{ width: `${maxSeconds === 0 ? 0 : (value.seconds / maxSeconds) * 100}%` }}
                />
              </span>
            )}
            <span className="font-semibold tabular-nums">{value.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function NeighborList({
  direction,
  neighbors,
}: {
  direction: 'ahead' | 'behind';
  neighbors: RiderSelectedResult['neighbors']['ahead'];
}) {
  const heading = direction === 'ahead' ? 'Ahead' : 'Behind';
  return (
    <div>
      <h3 className="text-muted text-sm font-bold">{heading}</h3>
      {neighbors.length === 0 ? (
        <p className="text-muted mt-1 text-sm">No comparable finisher {direction}.</p>
      ) : (
        <ul className="mt-1 list-none space-y-1 p-0 text-sm">
          {neighbors.map((neighbor) => (
            <li key={`${neighbor.plate}-${neighbor.place}`} className="tabular-nums">
              Plate {neighbor.plate} · place {neighbor.place} · {neighbor.gapPctPoints.toFixed(1)}{' '}
              percentage points {direction === 'ahead' ? 'ahead of' : 'behind'} this rider
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FieldContext({ selected }: { selected: RiderSelectedResult }) {
  const category = `${selected.result.category}${
    selected.result.conference === null ? '' : ` · ${selected.result.conference}`
  }`;
  const comparable =
    selected.result.status === 'finished' &&
    (selected.result.lapsDown === null || selected.result.lapsDown === 0) &&
    selected.result.pctBack !== null;

  return (
    <section className="border-border mt-6 border-t pt-5" aria-labelledby="field-context-heading">
      <h2 id="field-context-heading" className="font-display text-2xl tracking-wide uppercase">
        Field context
      </h2>
      <p className="text-muted mt-1 text-sm">{category}</p>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-muted">Published place</dt>
          <dd className="font-semibold tabular-nums">{published(selected.result.place)}</dd>
        </div>
        <div>
          <dt className="text-muted">Percent back</dt>
          <dd className="font-semibold tabular-nums">
            {selected.result.pctBack === null ? 'Not comparable' : `${selected.result.pctBack}%`}
          </dd>
        </div>
      </dl>
      {comparable ? (
        <>
          <p className="text-muted mt-4 text-sm">
            Derived gaps are relative to this rider’s percent back and shown in percentage points.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <NeighborList direction="ahead" neighbors={selected.neighbors.ahead.slice(0, 2)} />
            <NeighborList direction="behind" neighbors={selected.neighbors.behind.slice(0, 2)} />
          </div>
        </>
      ) : (
        <p className="text-muted mt-4 text-sm">
          {selected.result.status === 'dnf'
            ? 'This published DNF has no comparable gap to the winner, so field comparisons are withheld.'
            : selected.result.lapsDown !== null && selected.result.lapsDown > 0
              ? `Lap deficit: −${selected.result.lapsDown} lap${selected.result.lapsDown === 1 ? '' : 's'}. Percent-back comparison is withheld.`
              : 'This result has no comparable gap to the winner, so field comparisons are withheld.'}
        </p>
      )}
    </section>
  );
}

function History({
  profile,
  year,
  through,
}: {
  profile: RiderSeason;
  year: number;
  through: number | null;
}) {
  return (
    <details className="border-border mt-8 border-t pt-4" open={profile.selected === null}>
      <summary className="text-fg hover:text-accent cursor-pointer font-display text-2xl tracking-wide uppercase">
        Season history
      </summary>
      {profile.rounds.length === 0 ? (
        <p className="text-muted mt-3 text-sm">
          No recorded results are included at this checkpoint.
        </p>
      ) : (
        <ol className="mt-3 list-none space-y-3 p-0">
          {profile.rounds.map((round) => (
            <li key={round.round.id} className="border-border border-t pt-3">
              <h2 className="font-semibold">{round.round.name}</h2>
              <ul className="mt-1 list-none space-y-1 p-0 text-sm">
                {round.results.map((result) => {
                  const selected =
                    profile.selected?.race.sourceEventId === result.race.sourceEventId;
                  return (
                    <li key={result.race.sourceEventId}>
                      {through === null ? (
                        <span>{result.race.name}</span>
                      ) : (
                        <Link
                          href={eventHref(
                            year,
                            profile.rider.id,
                            through,
                            result.race.sourceEventId,
                          )}
                          aria-current={selected ? 'page' : undefined}
                          className="text-fg hover:text-accent font-bold underline underline-offset-4"
                        >
                          {result.race.name}
                        </Link>
                      )}{' '}
                      <span className="text-muted">
                        · {resultContext(result.result)} · official total{' '}
                        {published(result.officialTotal)}
                        {selected ? ' · selected' : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

/**
 * A rider's own published history. The caller resolves both Club scope and the
 * checkpoint; this component lets the coach select one exact source Event and
 * one evidence perspective without inventing a result or comparison.
 */
export function RiderProfile({ profile, year, view = 'my-ride' }: RiderProfileProps) {
  const through = profile.checkpoint.kind === 'through' ? profile.checkpoint.ordinal : null;
  const hasResults = profile.rounds.length > 0;
  const selected = profile.selected;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="border-fg border-b-2 pb-3">
        <p className="text-muted text-sm">
          <Link
            href={through === null ? `/${year}` : `/${year}?through=${through}`}
            className="text-fg hover:text-accent underline"
          >
            {year} season
          </Link>{' '}
          · {checkpointLabel(profile)}
        </p>
        <h1 className="font-display mt-1 text-4xl tracking-wide uppercase">{profile.rider.name}</h1>
      </header>

      {selected === null ? (
        hasResults ? (
          <p className="text-muted mt-6 text-sm">
            Choose a recorded event to view its official total, measurements, and field context.
          </p>
        ) : (
          <p className="text-muted mt-6 text-sm">
            No recorded results are included at this checkpoint.{' '}
            <Link
              href={through === null ? `/${year}` : `/${year}?through=${through}`}
              className="text-fg hover:text-accent font-bold underline underline-offset-4"
            >
              Return to the {year} season
            </Link>
            .
          </p>
        )
      ) : (
        <>
          <section className="mt-6" aria-labelledby="selected-race-heading">
            <p className="text-muted text-sm">{selected.race.name}</p>
            <h2
              id="selected-race-heading"
              className="font-display mt-1 text-2xl tracking-wide uppercase"
            >
              Race {selected.race.roundOrdinal} result
            </h2>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-muted">Official total</dt>
                <dd className="font-semibold tabular-nums">{published(selected.officialTotal)}</dd>
              </div>
              <div>
                <dt className="text-muted">Published place</dt>
                <dd className="font-semibold tabular-nums">{published(selected.result.place)}</dd>
              </div>
              {selected.result.status !== 'dnf' &&
              selected.result.lapsDown !== null &&
              selected.result.lapsDown > 0 ? (
                <div>
                  <dt className="text-muted">Lap deficit</dt>
                  <dd className="font-semibold tabular-nums">
                    −{selected.result.lapsDown} lap{selected.result.lapsDown === 1 ? '' : 's'}
                  </dd>
                </div>
              ) : null}
              {selected.result.status === 'dnf' ? (
                <div>
                  <dt className="text-muted">Result</dt>
                  <dd className="font-semibold">DNF</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {through === null ? null : (
            <nav aria-label="Selected result views" className="mt-5">
              <ul className="flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-sm font-bold">
                {(['my-ride', 'field-context'] as const).map((candidate) => {
                  const label = candidate === 'my-ride' ? 'My ride' : 'Field context';
                  return (
                    <li key={candidate}>
                      <Link
                        href={eventHref(
                          year,
                          profile.rider.id,
                          through,
                          selected.race.sourceEventId,
                          candidate,
                        )}
                        aria-current={view === candidate ? 'page' : undefined}
                        className={
                          view === candidate
                            ? 'text-fg border-b-2 border-fg pb-1 no-underline'
                            : 'text-fg hover:text-accent underline underline-offset-4'
                        }
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          {view === 'my-ride' ? (
            <section className="border-border mt-5 border-t pt-5" aria-labelledby="my-ride-heading">
              <h2 id="my-ride-heading" className="font-display text-2xl tracking-wide uppercase">
                My ride
              </h2>
              {through === null ? null : (
                <Link
                  href={roundHref(
                    year,
                    selected.race.roundOrdinal,
                    through,
                    selected.race.sourceEventId,
                  )}
                  className="text-fg hover:text-accent mt-3 inline-block text-sm font-bold underline underline-offset-4"
                >
                  Open race review
                </Link>
              )}
              <Measurements measured={selected.measured} />
            </section>
          ) : (
            <FieldContext selected={selected} />
          )}
        </>
      )}

      <History profile={profile} year={year} through={through} />
    </main>
  );
}
