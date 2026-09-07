import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { resolveDefaultSquad, resolveSeasonByYear } from './query.ts';

/**
 * The bare season route: `/[season]` — never a wall itself any more (issue
 * #114). Resolves the signed-in coach's own Squad through `squad_coach` and
 * redirects to its addressable home, `/[season]/squad/[slug]`
 * (`./squad/[slug]/page.tsx`), which is where the wall now renders.
 *
 * A coach with no Squad link in this Season has nowhere to redirect to, so
 * this renders the same words the old combined page showed for that case —
 * there is nothing to build a wall out of, and no guess to make on the
 * coach's behalf. `resolveDefaultSquad` no longer guesses one either: the
 * "if the season has exactly one squad, use it" fallback it used to fall
 * back to is gone (#107/#108 made the coach link itself trustworthy), so
 * this state now means exactly what it says — not-yet-linked, not
 * ambiguous-and-guessed.
 *
 * The layout above already turned an unknown or malformed segment into a real
 * not-found before this ever renders; the check below is defensive, not the
 * primary gate — see `src/app/[season]/layout.tsx`.
 */
export const dynamic = 'force-dynamic';

export default async function SeasonHomePage({ params }: { params: Promise<{ season: string }> }) {
  const { season: seasonSegment } = await params;
  const db = appDb();

  const season = await resolveSeasonByYear(db, seasonSegment);
  if (season === null) notFound();

  const session = await auth();
  const squad = await resolveDefaultSquad(db, session?.user?.id ?? null, season.id);

  if (squad !== null) redirect(`/${season.year}/squad/${squad.slug}`);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-4xl tracking-wide uppercase">{season.year} season</h1>
      <p className="text-muted mt-3 max-w-2xl">
        You&rsquo;re not coaching a squad in the {season.year} season.
      </p>
    </main>
  );
}
