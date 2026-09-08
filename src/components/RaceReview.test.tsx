import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RaceReview } from './RaceReview.tsx';
import type { RaceCategories } from '../lib/db/editorial-query.ts';

const review = {
  race: {
    eventId: 22,
    sourceEventId: 'pine-creek-north',
    name: 'Pine Creek',
    seasonYear: 2026,
    roundOrdinal: 2,
  },
  categories: [
    {
      key: { eventId: 22, category: 'HS2 Girls', conference: 'North' },
      scope: 'conference' as const,
      fieldSize: 4,
      marks: [
        { place: '1', pct: 0, ours: true, label: '«RIDER-A»' },
        { place: '2', pct: 4.5, ours: true, label: '«RIDER-B»' },
        { place: '3', pct: 9, ours: false },
        { place: '4', pct: 14, ours: false },
      ],
      outside: [],
      clubRiders: [
        {
          riderId: 11,
          name: '«RIDER-A»',
          row: {
            plate: 'A11',
            place: '1',
            status: 'finished' as const,
            timeRaw: '20:00',
            category: 'HS2 Girls',
            conference: 'North',
            points: null,
            lapsDown: null,
            pctBack: 0,
            fieldSize: 4,
            fieldTopPct: null,
            scored: false,
            ptsLeader: false,
            grade: null,
            lapSplits: [],
            lapSeconds: [],
          },
        },
        {
          riderId: 12,
          name: '«RIDER-B»',
          row: {
            plate: 'B12',
            place: '2',
            status: 'finished' as const,
            timeRaw: '20:54',
            category: 'HS2 Girls',
            conference: 'North',
            points: null,
            lapsDown: null,
            pctBack: 4.5,
            fieldSize: 4,
            fieldTopPct: null,
            scored: false,
            ptsLeader: false,
            grade: null,
            lapSplits: [],
            lapSeconds: [],
          },
        },
      ],
    },
  ],
} satisfies RaceCategories;

describe('RaceReview', () => {
  it('shows two club riders on one shared category field with usable rider entries', () => {
    const markup = renderToStaticMarkup(<RaceReview review={review} through={2} />);

    expect(markup).toContain('HS2 Girls · North');
    expect(markup.match(/role="img"/g)).toHaveLength(1);
    expect(markup).toContain('href="/2026/rider/11?through=2&amp;event=pine-creek-north"');
    expect(markup).toContain('href="/2026/rider/12?through=2&amp;event=pine-creek-north"');
    expect(markup).toContain('place 2 · 4.5% back');
    expect(markup).toContain('Orange marks are club riders. Navy marks are other field riders.');
    expect(markup).toContain('2 club riders recorded in this 4-rider field.');
  });

  it('offers a keyboard-reachable field choice and published result evidence on demand', () => {
    const markup = renderToStaticMarkup(<RaceReview review={review} through={2} />);

    expect(markup).toContain('aria-label="Choose a field"');
    expect(markup).toContain('href="#field-22-0"');
    expect(markup).toContain('<details');
    expect(markup).toContain('View published result details');
    expect(markup).toContain('Published total');
    expect(markup).toContain('20:54');
  });

  it('keeps a singleton field honest instead of inventing a comparison axis', () => {
    const singleton = {
      ...review,
      categories: [
        {
          ...review.categories[0],
          fieldSize: 1,
          marks: [{ place: '1', pct: 0, ours: true, label: '«RIDER-A»' }],
          clubRiders: [
            {
              ...review.categories[0]!.clubRiders[0]!,
              row: { ...review.categories[0]!.clubRiders[0]!.row, fieldSize: 1 },
            },
          ],
        },
      ],
    } satisfies RaceCategories;

    const markup = renderToStaticMarkup(<RaceReview review={singleton} through={2} />);

    expect(markup).toContain('One published rider; no field spread to compare.');
    expect(markup).toContain('place 1 · no field spread to compare');
    expect(markup).toContain('1 rider · percent back from winner');
    expect(markup).not.toContain('<svg');
  });

  it('keeps a singleton DNF out of a fabricated time comparison', () => {
    const dnf = {
      ...review,
      categories: [
        {
          ...review.categories[0],
          fieldSize: 1,
          marks: [{ place: '*', pct: null, ours: true, label: '«RIDER-A»' }],
          clubRiders: [
            {
              ...review.categories[0]!.clubRiders[0]!,
              row: {
                ...review.categories[0]!.clubRiders[0]!.row,
                place: '*',
                status: 'dnf' as const,
                timeRaw: '',
                pctBack: null,
              },
            },
          ],
        },
      ],
    } satisfies RaceCategories;

    const markup = renderToStaticMarkup(<RaceReview review={dnf} through={2} />);

    expect(markup).toContain('DNF · time comparison unavailable');
    expect(markup).not.toContain('place * · no field spread to compare');
  });
});
