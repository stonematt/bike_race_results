/**
 * Slug generation and validation, shared by club, squad, rider and coach keys
 * (issue #114).
 *
 * A slug identifies something in a URL and a bookmark, and it has to survive
 * a rename: `club.slug` and `squad.slug` both carry an explicit optional
 * config value that falls back to one derived from a name
 * (`src/lib/club-config.ts`, `src/lib/seed.ts`), so that renaming a club or a
 * squad does not have to break every link to it.
 *
 * Collision-freeness is the caller's job, not this module's. `slugify` is a
 * pure function of one name; it has no view of any other row, so it cannot
 * know whether its output collides with one. The caller holds the
 * uniqueness scope — globally for a club, per `(club, season)` for a squad —
 * and is where a collision has to be resolved.
 */

/**
 * The shape every slug in this app must match: lower-case, hyphen-separated,
 * no leading, trailing or doubled hyphens. This is the same shape
 * `club-config.ts` already used for a rider or coach key (`rider-a`,
 * `coach-a`), so a club slug, a squad slug, a rider key and a coach key all
 * read the same way in a URL or a config file.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Whether a string is already in the canonical slug shape. */
export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/**
 * Derive a slug from a display name: lower-case, diacritics stripped,
 * anything that is not a letter or a digit collapsed to a single hyphen, and
 * leading/trailing hyphens trimmed.
 *
 *   "Descenders"        -> "descenders"
 *   "O'Brien's Squad!!" -> "o-brien-s-squad"
 *   "  Café  Racers  "  -> "cafe-racers"
 *
 * An input with nothing sluggable in it — empty, or punctuation-only —
 * derives to the empty string. That is not a valid slug (`isSlug` rejects
 * it); the caller decides what to do about a name that cannot produce one.
 */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      // Combining diacritical marks (U+0300-U+036F), stripped after NFKD splits
      // them off the base letter ("é" -> "e" + U+0301), so "Café" slugifies to
      // "cafe" rather than dropping the whole letter.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}
