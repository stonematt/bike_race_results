import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { SeasonPulse } from './SeasonPulse.tsx';
import { buildSeasonPulse } from '@/lib/season-pulse.ts';

it('renders a semantic, scrollable participation-first wall with only present legend states', () => {
  const pulse = buildSeasonPulse({
    rounds: [
      { id: 1, ordinal: 1, name: 'Race 1' },
      { id: 2, ordinal: 2, name: 'Race 2' },
    ],
    riders: [{ id: 1, name: '«RIDER»', category: 'HS1 Girls' }],
    results: [{ riderId: 1, roundOrdinal: 2, status: 'finished', place: '5' }],
  });
  const markup = renderToStaticMarkup(<SeasonPulse seasonYear={2042} pulse={pulse} />);

  expect(markup).toContain(
    'aria-label="Season participation wall. Scroll horizontally to compare riders and races."',
  );
  expect(markup).toContain('scope="colgroup"');
  expect(markup).toContain('season-pulse-scroll-note');
  expect(markup).toContain('Girls · High School');
  expect(markup).toContain('title="HS1 Girls"');
  expect(markup).toContain('>HS1<');
  expect(markup).toContain('Race 1, 0 starts');
  expect(markup).toContain('First recorded start this season');
  expect(markup).toContain('Finished in the published top five');
  expect(markup).toContain('legend-late-first');
  expect(markup).toContain('legend-podium');
  expect(markup).toContain('No result recorded');
  expect(markup).toContain('href="/2042/round/2"');
});
