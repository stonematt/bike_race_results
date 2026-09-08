import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { Banner } from '@/components/Banner.tsx';
import { SignOutButton } from '@/components/SignOutButton.tsx';
import { listSeasonYears, resolveCurrentSeason } from './[season]/query.ts';

/** The configured season is explicit; historical results remain a deliberate choice. */
export const dynamic = 'force-dynamic';

export default async function Home() {
  const db = appDb();
  const configuredYear = process.env.CURRENT_SEASON;
  const season = await resolveCurrentSeason(db, configuredYear);
  if (season !== null) redirect(`/${season.year}`);

  const [session, years] = await Promise.all([auth(), listSeasonYears(db)]);
  return (
    <>
      <Banner>
        {session?.user?.email ? <span>{session.user.email}</span> : null}
        <SignOutButton />
      </Banner>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-4xl tracking-wide uppercase">
          {configuredYear ? `${configuredYear} season` : 'Season results'}
        </h1>
        <p className="text-muted mt-4 max-w-prose">
          {configuredYear
            ? `Results for ${configuredYear} are not available yet.`
            : 'No season results have been published yet.'}
        </p>
        {years.length > 0 ? (
          <nav aria-label="Recorded seasons" className="mt-8">
            <h2 className="font-display text-2xl uppercase">Explore a recorded season</h2>
            <ul className="mt-3 flex flex-wrap gap-6">
              {years.map((year) => (
                <li key={year}>
                  <Link
                    href={`/${year}`}
                    className="text-fg font-semibold underline underline-offset-4"
                  >
                    {year} season
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </main>
    </>
  );
}
