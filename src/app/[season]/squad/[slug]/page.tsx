import { renderRoster } from '../../roster-view.tsx';

export const dynamic = 'force-dynamic';

export default async function SquadPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string; slug: string }>;
  searchParams: Promise<{ through?: string | string[] }>;
}) {
  const { season, slug } = await params;
  const { through } = await searchParams;
  return renderRoster({ seasonSegment: season, squadSlug: slug, through });
}
