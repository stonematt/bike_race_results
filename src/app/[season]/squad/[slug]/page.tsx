import { notFound } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { RosterWall } from '@/components/RosterWall.tsx';
import { SquadSwitcher } from '@/components/SquadSwitcher.tsx';
import { buildRosterWall } from '@/lib/roster-wall.ts';
import { loadRosterWallInputs } from '@/lib/db/roster-wall-query.ts';
import { listCoachSquads, resolveSeasonByYear, resolveSquadBySlug } from '../../query.ts';

/**
 * A Squad, as a navigable place — `/[season]/squad/[slug]` (issue #114). This
 * is where the Roster Wall now lives; the bare `/[season]` route
 * (`../../page.tsx`) only resolves the signed-in coach's default Squad and
 * redirects here.
 *
 * The club slug deliberately does not appear in this path. `club.slug` exists
 * and is seeded (`src/lib/seed.ts`), but routing on it is reserved for when
 * this app serves more than one club — see `resolveSquadBySlug`
 * (`../../query.ts`) for the ambiguity this defers rather than guesses at.
 *
 * Follows `round/[ordinal]/page.tsx`'s shape: resolve the Season, resolve the
 * sub-resource, `notFound()` if either misses, then load and render. Reuses
 * `buildRosterWall`, `loadRosterWallInputs` and `RosterWall` exactly the way
 * the old combined `/[season]` page did.
 */
export const dynamic = 'force-dynamic';

export default async function SquadPage({
  params,
}: {
  params: Promise<{ season: string; slug: string }>;
}) {
  const { season: seasonSegment, slug } = await params;
  const db = appDb();

  const season = await resolveSeasonByYear(db, seasonSegment);
  if (season === null) notFound();

  const squad = await resolveSquadBySlug(db, season.id, slug);
  if (squad === null) notFound();

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const coachSquads = userId === null ? [] : await listCoachSquads(db, userId, season.id);

  const { riders, rounds, results } = await loadRosterWallInputs(db, squad.id, season.id);
  const rows = buildRosterWall(riders, rounds, results);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-4xl tracking-wide uppercase">{season.year} season</h1>
      <p className="text-muted mt-3 max-w-2xl">
        You&rsquo;re looking at the <strong className="text-fg">{squad.name}</strong> squad.
      </p>

      {coachSquads.length > 1 ? (
        <SquadSwitcher seasonYear={season.year} currentSlug={squad.slug} squads={coachSquads} />
      ) : null}

      <RosterWall seasonYear={season.year} rounds={rounds} rows={rows} />
    </main>
  );
}
