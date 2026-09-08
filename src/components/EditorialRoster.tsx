import Link from 'next/link';
import { categoryRank } from '../lib/category-order.ts';
import { SquadSwitcher } from './SquadSwitcher.tsx';
import type { DispatchRound } from '../lib/db/editorial-query.ts';
import type { SquadRef } from '../app/[season]/query.ts';
import type { EditorialRoster as EditorialRosterData } from '../lib/db/editorial-roster-query.ts';
export type { EditorialRosterData };

export function EditorialRoster({
  roster,
  squads,
}: {
  roster: EditorialRosterData;
  squads: SquadRef[];
}) {
  const { season, checkpoint, squad, riders, rounds } = roster;
  const through = checkpoint.kind === 'through' ? checkpoint.ordinal : undefined;
  const search = through === undefined ? '' : `?through=${through}`;
  const selectedRound = rounds.find((round) => round.round.ordinal === through);
  const starts =
    selectedRound?.availability === 'published'
      ? riders.filter((rider) =>
          rider.results.some((result) => result.race.roundOrdinal === through),
        ).length
      : null;
  const categories = [...new Set(riders.map((rider) => rider.category))].sort(
    (a, b) =>
      categoryRank(a ?? '', 'descending') - categoryRank(b ?? '', 'descending') ||
      (a ?? '').localeCompare(b ?? ''),
  );
  function emptyCell(round: DispatchRound): string {
    switch (round.availability) {
      case 'after-checkpoint':
        return 'After checkpoint';
      case 'unpublished':
        return 'Results not published';
      case 'partial':
        return 'Results incomplete';
      case 'published':
        return 'No result recorded';
    }
  }
  return (
    <main className="mx-auto max-w-5xl px-6 py-6 sm:py-8">
      <Link
        href={`/${season.year}${search}`}
        className="text-sm font-bold underline underline-offset-4"
      >
        {season.year} season dispatch
      </Link>
      <h1 className="font-display mt-5 text-4xl tracking-wide uppercase">
        {squad ? `${squad.name} squad` : 'Club roster'}
      </h1>
      <p className="text-muted mt-2 text-sm">
        {through === undefined ? 'No published checkpoint' : `Through Race ${through}`}
      </p>
      <nav aria-label="Roster scope" className="mt-4 flex gap-4 text-sm font-bold">
        {squad ? (
          <span aria-current="page" className="border-fg border-b-2 pb-1">
            Squad roster
          </span>
        ) : null}
        <Link
          href={`/${season.year}/roster${search}`}
          aria-current={squad ? undefined : 'page'}
          className={squad ? 'underline underline-offset-4' : 'border-fg border-b-2 pb-1'}
        >
          Club roster
        </Link>
      </nav>
      {squads.length > 0 ? <p className="mt-4 text-sm font-bold">Squads</p> : null}
      <SquadSwitcher
        seasonYear={season.year}
        currentSlug={squad?.slug ?? ''}
        squads={squads}
        through={through}
      />
      <p className="text-muted mt-4 text-sm">
        Current season roster · {riders.length} {riders.length === 1 ? 'rider' : 'riders'}
      </p>
      {starts !== null ? (
        <p className="mt-2 text-sm font-semibold">
          {starts} of {riders.length} rostered riders recorded a start at Race {through}.
        </p>
      ) : null}
      {selectedRound?.availability === 'partial' ? (
        <p className="text-muted mt-2 text-sm">
          Race {through} results are incomplete; participation totals are unavailable.
        </p>
      ) : null}
      {riders.length === 0 ? (
        <p className="mt-6 text-sm">No riders on this roster yet.</p>
      ) : (
        <>
          <p className="text-muted mt-6 text-sm">
            {rounds.length === 0
              ? 'Race schedule unavailable.'
              : 'Scroll across for races. Categories reflect the latest included result.'}
          </p>
          <div
            role="region"
            aria-label="Roster race evidence"
            tabIndex={0}
            className="mt-2 overflow-x-auto"
          >
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Current roster and recorded results through the selected checkpoint
              </caption>
              <thead>
                <tr className="border-fg border-b-2">
                  <th scope="col" className="bg-bg sticky left-0 min-w-36 p-3 text-left">
                    Rider
                  </th>
                  {rounds.map(({ round }) => (
                    <th key={round.id} scope="col" className="min-w-36 p-3 text-left">
                      {round.name}
                    </th>
                  ))}
                </tr>
              </thead>
              {categories.map((category) => (
                <tbody key={category ?? 'none'}>
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={rounds.length + 1}
                      className="border-border bg-surface border-b py-3 text-left font-bold"
                    >
                      <div className="sticky left-0 w-36 px-3">
                        {category ?? 'No category recorded'}
                      </div>
                    </th>
                  </tr>
                  {riders
                    .filter((rider) => rider.category === category)
                    .map((rider) => (
                      <tr key={rider.id} className="border-border border-b">
                        <th scope="row" className="bg-bg sticky left-0 p-3 text-left align-top">
                          <Link
                            href={`/${season.year}/rider/${rider.id}${search}`}
                            className="font-bold underline underline-offset-4"
                          >
                            {rider.name}
                          </Link>
                        </th>
                        {rounds.map((round) => {
                          const results =
                            round.availability === 'after-checkpoint'
                              ? []
                              : rider.results.filter(
                                  (result) => result.race.roundOrdinal === round.round.ordinal,
                                );
                          return (
                            <td key={round.round.id} className="p-3 align-top">
                              {results.length === 0 ? (
                                <span className="text-muted">{emptyCell(round)}</span>
                              ) : (
                                <ul className="space-y-3">
                                  {results.map(({ race, result, officialTotal }) => (
                                    <li key={race.sourceEventId}>
                                      <Link
                                        href={`/${season.year}/rider/${rider.id}?through=${through}&event=${encodeURIComponent(race.sourceEventId)}`}
                                        className="block underline underline-offset-4"
                                      >
                                        {result.status === 'dnf'
                                          ? 'DNF'
                                          : `Place ${result.place || 'unpublished'} of ${result.fieldSize}`}
                                      </Link>
                                      <span className="text-muted mt-1 block">
                                        {result.category}
                                        {result.conference ? ` · ${result.conference}` : ''}
                                      </span>
                                      <span className="mt-1 block">
                                        Official total: {officialTotal.trim() || 'Not published'}
                                      </span>
                                      {result.status !== 'dnf' &&
                                      result.lapsDown !== null &&
                                      result.lapsDown > 0 ? (
                                        <span className="block">
                                          −{result.lapsDown} lap{result.lapsDown === 1 ? '' : 's'}
                                        </span>
                                      ) : null}
                                      <span className="text-muted block">
                                        {result.pctBack === null
                                          ? 'Time comparison unavailable'
                                          : `${result.pctBack}% back from winner`}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              ))}
            </table>
          </div>
        </>
      )}
    </main>
  );
}
