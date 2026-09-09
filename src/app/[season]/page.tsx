import { notFound } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { requireClubContext } from '@/app/club-context.ts';
import { SeasonPulse } from '@/components/SeasonPulse.tsx';
import { ReviewedObservation } from '@/components/ReviewedObservation.tsx';
import { loadPublishedStory } from '@/lib/editorial-publication.ts';
import { buildSeasonPulse } from '@/lib/season-pulse.ts';
import { OREGON_EVENT_WEEKENDS_URL, ribbonRoundsForSeason } from '@/lib/season-ribbon.ts';
import { loadSeasonPulseInput, loadSeasonWallContext } from '@/lib/db/season-pulse-query.ts';
import { resolveSeasonByYear } from './query.ts';

export const dynamic = 'force-dynamic';

/** Season selection always reads all available results. A legacy through query
 * never truncates this wall; reviewed observations retain their own evidence. */
export default async function SeasonHomePage({
  params,
}: {
  params: Promise<{ season: string }>;
  searchParams?: Promise<{ through?: string | string[] }>;
}) {
  const { season: segment } = await params;
  const db = appDb();
  const season = await resolveSeasonByYear(db, segment);
  if (!season) notFound();
  const session = await auth();
  const club = await requireClubContext(db, session?.user?.id ?? null);
  const scope = { seasonId: season.id, clubId: club.clubId };
  const [input, context] = await Promise.all([
    loadSeasonPulseInput(db, scope),
    loadSeasonWallContext(db, scope),
  ]);
  if (!input) notFound();
  const pulse = buildSeasonPulse(input);
  const riders = pulse.groups.flatMap((g) => g.riders);
  const starters = riders.filter((r) => r.marks.some((m) => m.state === 'start'));
  const continuity = riders.filter((r) => r.everyRace).length;
  const totalStarts = pulse.rounds.reduce((sum, r) => sum + r.starts, 0);
  const ribbon = ribbonRoundsForSeason(season.year, pulse.rounds);
  const latest = pulse.rounds.at(-1);
  const story = latest
    ? await loadPublishedStory(db, {
        ...scope,
        actorId: club.userId,
        checkpointOrdinal: latest.ordinal,
        surface: 'season-dispatch',
      })
    : null;
  const firstStarts = new Map<number, number>();
  for (const row of context.clubResults)
    if (row.riderId !== null)
      firstStarts.set(
        row.riderId,
        Math.min(firstStarts.get(row.riderId) ?? Infinity, row.roundOrdinal),
      );
  const spotlight = context.clubResults
    .filter(
      (r) =>
        r.status === 'finished' &&
        r.riderId !== null &&
        r.roundOrdinal === firstStarts.get(r.riderId),
    )
    .sort((a, b) => b.roundOrdinal - a.roundOrdinal || a.name.localeCompare(b.name))[0];
  const lateRound = Math.max(
    0,
    ...[...firstStarts.values()].filter((r) => r > (pulse.rounds[0]?.ordinal ?? 0)),
  );
  const lateCount = [...firstStarts.values()].filter((r) => r === lateRound).length;
  const field = context.field;
  const localArt = process.env.NEXT_PUBLIC_LOCAL_BRAND_ART === '1';
  const headline =
    pulse.rounds.length > 1
      ? `${continuity} riders. All ${pulse.rounds.length} races.`
      : pulse.rounds.length === 1
        ? `${starters.length} riders at the opener.`
        : 'The season starts here.';
  const evidence = spotlight
    ? [
        spotlight,
        ...(field?.clubRiders ?? []).filter(
          (r) => r.riderId !== spotlight.riderId || r.sourceEventId !== spotlight.sourceEventId,
        ),
      ]
    : (field?.clubRiders ?? []);
  return (
    <main className={`season-page${localArt ? ' has-local-brand-art' : ''}`}>
      <section className="season-lead" aria-labelledby="season-heading">
        <div>
          <p>{season.year} season · Published results</p>
          <h1 id="season-heading">{headline}</h1>
          <p>
            {lateRound
              ? `${lateCount} riders made a first recorded start at Race ${lateRound}.`
              : latest
                ? `${latest.starts} club riders recorded a start at ${latest.name}.`
                : 'Published results will appear here when available.'}
          </p>
        </div>
        <div className="season-jersey" aria-hidden="true" />
      </section>
      {season.year === 2026 ? (
        <p className="season-ribbon-source">
          Five Oregon race weekends · <a href={OREGON_EVENT_WEEKENDS_URL}>Oregon League schedule</a>
          . Western Regionals is separate.
        </p>
      ) : null}
      <nav className="season-ribbon" aria-label="Season race ribbon">
        {ribbon.map((round) => {
          const content = (
            <>
              <strong>
                {season.year === 2026 ? `Race ${round.ordinal} · ` : ''}
                {round.label}
              </strong>
              {round.date ? <span>{round.date}</span> : null}
              {round.conference ? <span>{round.conference}</span> : null}
              {round.href ? (
                <small>{round.starts} recorded starts</small>
              ) : (
                <small className="season-ribbon-pending">Scheduled · results not published</small>
              )}
            </>
          );
          return round.href ? (
            <a key={round.ordinal} href={round.href}>
              {content}
            </a>
          ) : (
            <div key={round.ordinal} className="season-ribbon-scheduled">
              {content}
            </div>
          );
        })}
      </nav>
      <SeasonPulse seasonYear={season.year} pulse={pulse} />
      {spotlight ? (
        <section className="season-spotlight" aria-labelledby="spotlight-heading">
          <div>
            <h2 id="spotlight-heading">{spotlight.name}</h2>
            <p>
              First recorded start this season at Race {spotlight.roundOrdinal}. Published place{' '}
              {spotlight.place ?? 'not recorded'} in {spotlight.category}
              {spotlight.conference ? ` · ${spotlight.conference}` : ''}.
            </p>
            {spotlight.laps !== null ? (
              <p>
                {spotlight.laps}{' '}
                {spotlight.categoryLaps !== null
                  ? `of ${spotlight.categoryLaps} category-leading laps recorded.`
                  : 'laps recorded.'}
              </p>
            ) : null}
          </div>
          <dl>
            <div>
              <dt>Riders with a start</dt>
              <dd>{starters.length}</dd>
            </div>
            <div>
              <dt>Club starts</dt>
              <dd>{totalStarts}</dd>
            </div>
          </dl>
        </section>
      ) : null}
      {field ? (
        <section className="season-field" aria-labelledby="field-heading">
          <h2 id="field-heading">Same-category finish context</h2>
          <p>
            {field.category}
            {field.conference ? ` · ${field.conference}` : ''} · Race {field.roundOrdinal}.
            Published finishing order among classified finishers; not time or speed.
          </p>
          <p>
            {field.clubRiders
              .map(
                (r) =>
                  `${r.name}: ${r.status === 'finished' && r.place !== null ? `${r.place} of ${field.finishers.length}` : 'DNF — no rank mark'}`,
              )
              .join(' · ')}
          </p>
          {field.finishers.length ? (
            <>
              <svg
                className="season-rank"
                viewBox="0 0 1000 44"
                role="img"
                aria-label={`${field.finishers.length} classified finishers. Orange marks club riders.`}
              >
                <line x1="15" x2="985" y1="22" y2="22" />
                {field.finishers.map((r, i) => {
                  const highlighted = field.clubRiders.some(
                    (c) => c.status === 'finished' && c.place === r.place,
                  );
                  return (
                    <circle
                      key={i}
                      cx={
                        field.finishers.length === 1
                          ? 500
                          : 15 + (i / (field.finishers.length - 1)) * 970
                      }
                      cy="22"
                      r={highlighted ? 9 : 4}
                      className={highlighted ? 'is-club' : ''}
                    />
                  );
                })}
              </svg>
              <div className="season-rank-labels">
                <span>
                  {field.finishers.length === 1 ? 'Only classified finisher' : 'First finisher'}
                </span>
                {field.finishers.length > 1 ? <span>Last classified finisher</span> : null}
              </div>
            </>
          ) : (
            <p>No classified finishers have a rank mark.</p>
          )}
        </section>
      ) : null}
      <section className="season-stories" aria-labelledby="stories-heading">
        <h2 id="stories-heading">More from this season</h2>
        {story ? (
          <ReviewedObservation story={story} />
        ) : (
          <p>
            {latest
              ? `${latest.starts} club riders recorded a start at ${latest.name}.`
              : 'No published race results yet.'}
          </p>
        )}
        <div className="season-story-grid">
          <article>
            <h3>
              {pulse.rounds.length > 1
                ? `${continuity} riders started every race`
                : `${starters.length} riders at the opener`}
            </h3>
            <p>
              {totalStarts} club starts are recorded across {pulse.rounds.length} available{' '}
              {pulse.rounds.length === 1 ? 'race' : 'races'}.
            </p>
          </article>
          <article>
            <h3>
              {lateRound
                ? `${lateCount} first recorded starts at Race ${lateRound}`
                : 'The season is under way'}
            </h3>
            <p>
              {lateRound
                ? 'A first recorded start describes this season’s available results, not a rider’s first-ever race.'
                : 'One race provides a starting point for the conversations ahead.'}
            </p>
          </article>
          <article>
            <h3>A question for practice</h3>
            <p>
              What would you like to try, notice, or encourage before the next result opens a new
              conversation?
            </p>
          </article>
        </div>
      </section>
      <section className="season-milo" aria-labelledby="milo-heading">
        {localArt ? (
          <img src="/local-brand/milo-lockup-orange.png" alt="Descenders Milo lockup" />
        ) : null}
        <div>
          <h2 id="milo-heading">MILO before the next ride</h2>
          <p>Show up. Make room. Try something. Pass it on.</p>
          <p>Make the effort · Include everyone · Learn by trying · Offer encouragement</p>
        </div>
      </section>
      <details className="season-evidence">
        <summary>Results behind this season wall</summary>
        <div className="season-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Rider</th>
                <th>Race</th>
                <th>Category</th>
                <th>Published place</th>
                <th>Laps</th>
                <th>Source event</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td>Race {r.roundOrdinal}</td>
                  <td>
                    {r.category} {r.conference}
                  </td>
                  <td>{r.status === 'finished' ? (r.place ?? 'Unplaced') : 'DNF'}</td>
                  <td>{r.laps ?? 'Not recorded'}</td>
                  <td>
                    <a href={`/${season.year}/round/${r.roundOrdinal}#event-${r.sourceEventId}`}>
                      {r.sourceEventId}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Starts count distinct club riders with a result in a race. DNF remains a start and has no
          rank mark. The rank denominator includes numeric-placed finishers in the same event,
          category and conference. A rider with fewer laps retains their published place.
        </p>
      </details>
    </main>
  );
}
