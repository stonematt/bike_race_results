import { notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { CategoryView } from '@/components/CategoryView.tsx';
import { loadCategoryField } from '@/lib/db/category-query.ts';
import { checkpointFromSearch } from '@/lib/reporting-navigation.ts';
import { resolveDefaultSquad, resolveSeasonByYear } from '@/app/[season]/query.ts';
import { resolveRound } from '@/app/[season]/round/[ordinal]/query.ts';

export const dynamic = 'force-dynamic';

/**
 * The legacy category crossing remains standalone evidence. Its Round does not
 * identify a source Event when conferences raced separately, so it links to an
 * unselected Rider history instead of manufacturing an Event selection.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string; ordinal: string; riderId: string }>;
  searchParams: Promise<{ through?: string | string[] }>;
}) {
  const { season: seasonSegment, ordinal, riderId: riderIdSegment } = await params;
  const db = appDb();

  const season = await resolveSeasonByYear(db, seasonSegment);
  if (season === null) notFound();

  const round = await resolveRound(db, season.id, ordinal);
  if (round === null || !/^\d+$/.test(riderIdSegment)) notFound();
  const riderId = Number(riderIdSegment);
  if (!Number.isSafeInteger(riderId)) notFound();

  const { through: throughSearch } = await searchParams;
  const requested = checkpointFromSearch(throughSearch);
  if (requested === null) notFound();
  const through = requested ?? round.ordinal;
  const checkpoint = await resolveRound(db, season.id, String(through));
  if (checkpoint === null || checkpoint.ordinal < round.ordinal) notFound();

  const session = await auth();
  const squad = await resolveDefaultSquad(db, session?.user?.id ?? null, season.id);
  const field = await loadCategoryField(db, riderId, round.id, squad?.id ?? 0);
  if (field === null) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <p className="text-muted text-sm">
        <Link
          href={`/${season.year}?through=${through}`}
          className="text-fg hover:text-accent underline"
        >
          {season.year} season
        </Link>{' '}
        ·{' '}
        <Link
          href={`/${season.year}/round/${round.ordinal}?through=${through}`}
          className="text-fg hover:text-accent underline"
        >
          {round.name}
        </Link>
      </p>
      <p className="mt-4 text-sm">
        <Link
          href={`/${season.year}/rider/${riderId}?through=${through}`}
          className="text-fg hover:text-accent font-bold underline underline-offset-4"
        >
          Open rider history
        </Link>
      </p>
      <CategoryView field={field} riderId={riderId} />
    </main>
  );
}
