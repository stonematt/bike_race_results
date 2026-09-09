import { notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { SignOutButton } from '@/components/SignOutButton.tsx';
import { SeasonSelector } from '@/components/SeasonSelector.tsx';
import { TopNav } from '@/components/TopNav.tsx';
import { readActiveMemberships } from '@/lib/authz/access.ts';
import { requireClubContext } from '../club-context.ts';
import { listSeasonYears, resolveSeasonByYear } from './query.ts';

/**
 * The season frame: every route under `/[season]` renders inside this, with
 * the persistent selector pinned in the banner so switching seasons is always
 * one control away, not a page you navigate back to first (issue #88).
 *
 * Guards the segment once, here, rather than in every page beneath it: an
 * unknown or malformed year is a real not-found, not a page that renders with
 * nothing in it. `notFound()` thrown from a layout stops its children from
 * rendering at all, so `[season]/page.tsx` (and anything added under this
 * segment later) never has to repeat this check.
 */
export const dynamic = 'force-dynamic';

export default async function SeasonLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ season: string }>;
}) {
  const { season: seasonSegment } = await params;
  const db = appDb();
  const session = await auth();
  const club = await requireClubContext(db, session?.user?.id);

  const season = await resolveSeasonByYear(db, seasonSegment);
  if (season === null) notFound();

  const [seasonYears, memberships] = await Promise.all([
    listSeasonYears(db),
    readActiveMemberships(db, club.userId),
  ]);

  return (
    <>
      <TopNav
        qaPanel={
          <>
            <SeasonSelector currentYear={season.year} seasonYears={seasonYears} />
            {memberships.length > 1 ? (
              <Link className="top-nav-link" href="/clubs">
                Switch club
              </Link>
            ) : null}
            <Link className="top-nav-link" href={`/${season.year}/operations`}>
              Club operations
            </Link>
          </>
        }
        seasonHref={`/${season.year}`}
        utilityControls={
          <>
            {session?.user?.email ? (
              <span className="top-nav-account">{session.user.email}</span>
            ) : null}
            <SignOutButton />
          </>
        }
      />
      {children}
    </>
  );
}
