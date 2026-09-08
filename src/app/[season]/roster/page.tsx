import { renderRoster } from '../roster-view.tsx';

export const dynamic = 'force-dynamic';

export default async function ClubRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string }>;
  searchParams: Promise<{ through?: string | string[] }>;
}) {
  const { season } = await params;
  const { through } = await searchParams;
  return renderRoster({ seasonSegment: season, through });
}
