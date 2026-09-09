import { describe, expect, it } from 'vitest';
import { checkpointFromSearch, eventAnchorId, roundHref } from './reporting-navigation.ts';

describe('reporting navigation', () => {
  it('distinguishes the default checkpoint from an invalid or recorded ordinal', () => {
    expect(checkpointFromSearch(undefined)).toBeUndefined();
    expect(checkpointFromSearch('')).toBeUndefined();
    expect(checkpointFromSearch('0')).toBe(0);
    expect(checkpointFromSearch('2')).toBe(2);
    expect(checkpointFromSearch('2.5')).toBeNull();
    expect(checkpointFromSearch(['2'])).toBeNull();
  });

  it('keeps a selected event anchored in its checkpointed round', () => {
    expect(roundHref(2026, 2, 3, 'pine creek/north')).toBe(
      '/2026/round/2?through=3#event-pine%20creek%2Fnorth',
    );
    expect(eventAnchorId('pine creek/north')).toBe('event-pine%20creek%2Fnorth');
  });
});
