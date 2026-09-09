/**
 * How a lap deficit is spelled, in the one place that spells it.
 *
 * A Lap Deficit is how many laps fewer than her Category's leaders a Rider
 * rode (`CONTEXT.md`). It is an **annotation beside her published place, never
 * a replacement for it** — ADR-0004, and the whole of issue #111. All three
 * views that render one — the race card, the roster wall, the Category list —
 * read from here, so the wording cannot drift apart between them the way the
 * retired word "Lapped" did.
 *
 * This module holds no view state and imports nothing. It exists because the
 * alternative was two view modules importing a formatter out of a third view
 * module (`race-detail.ts`), which is a dependency none of them should carry.
 */

/** The minus sign is U+2212, not a hyphen. A lap deficit is a number, not a dash. */
export function lapsDownText(lapsDown: number): string {
  return `−${lapsDown} lap${lapsDown === 1 ? '' : 's'}`;
}

/**
 * The deficit as a caller can render it, or null when there is nothing to say.
 *
 * Null and zero collapse to the same answer on purpose: a rider who rode the
 * full distance and a rider whose lap count the source could not compare both
 * get no annotation, and neither wants one invented.
 *
 * **Only meaningful once a DNF has been ruled out.** `v_race_result` computes
 * `laps_down` for every row including a DNF's — a rider who abandoned after one
 * lap of three is three-minus-one down as a matter of arithmetic — while
 * `is_lapped` excluded DNFs itself. So a caller must branch on `status ===
 * 'dnf'` first, as every caller here does; reaching this function with a DNF
 * would annotate an abandonment with a deficit that means nothing.
 */
export function deficitText(lapsDown: number | null): string | null {
  return lapsDown ? lapsDownText(lapsDown) : null;
}
