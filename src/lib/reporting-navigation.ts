/**
 * Shared URL boundary for checkpointed reporting routes.
 *
 * `undefined` is an omitted checkpoint, `null` is malformed, and a number is
 * only syntactically valid here. A route still resolves that ordinal in its
 * selected Season before it reads reporting data.
 */
export function checkpointFromSearch(
  value: string | string[] | undefined,
): number | null | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const ordinal = Number(value);
  return Number.isSafeInteger(ordinal) && ordinal >= 0 ? ordinal : null;
}

/** A stable fragment for an Event when a Round contains multiple conferences. */
export function eventAnchorId(sourceEventId: string): string {
  return `event-${encodeURIComponent(sourceEventId)}`;
}

/** A checkpointed Round link, optionally focused on its selected source Event. */
export function roundHref(
  year: number,
  ordinal: number,
  through: number,
  sourceEventId?: string,
): string {
  const href = `/${year}/round/${ordinal}?through=${through}`;
  return sourceEventId === undefined ? href : `${href}#${eventAnchorId(sourceEventId)}`;
}
