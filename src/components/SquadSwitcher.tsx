import Link from 'next/link';

export type SquadSwitcherOption = { id: number; name: string; slug: string };

/**
 * Shown only when a coach holds more than one Squad in a Season (issue #114)
 * — the caller (`squad/[slug]/page.tsx`) decides that, this component just
 * draws the choice. A plain list of links rather than a `<select>` that
 * navigates on change: the destination is always a real, bookmarkable
 * `/[season]/squad/[slug]` URL, so a link is the more honest affordance.
 */
export function SquadSwitcher({
  seasonYear,
  currentSlug,
  squads,
  through,
}: {
  seasonYear: number;
  currentSlug: string;
  squads: readonly SquadSwitcherOption[];
  through?: number;
}) {
  return (
    <nav aria-label="Switch squad" className="mt-2 flex flex-wrap gap-2 text-sm">
      {squads.map((squad) => {
        const isCurrent = squad.slug === currentSlug;
        return (
          <Link
            key={squad.id}
            href={`/${seasonYear}/squad/${squad.slug}${through === undefined ? '' : `?through=${through}`}`}
            aria-current={isCurrent ? 'page' : undefined}
            className={
              isCurrent
                ? 'border-accent bg-accent/10 text-fg rounded-full border px-3 py-1 font-semibold'
                : 'border-border bg-surface text-fg hover:border-fg rounded-full border px-3 py-1'
            }
          >
            {squad.name}
          </Link>
        );
      })}
    </nav>
  );
}
