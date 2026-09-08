import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SeasonDispatch } from './SeasonDispatch.tsx';

const dispatch = {
  season: { id: 2, year: 2026 },
  checkpoint: { kind: 'through' as const, ordinal: 2 },
  schedule: {
    kind: 'available' as const,
    rounds: [
      {
        round: { id: 1, ordinal: 1, name: 'Race 1' },
        events: [{ sourceEventId: 'river-bend', name: 'River Bend', conference: 'North' }],
        availability: 'published' as const,
        clubStarts: 4,
        firstRecordedStarts: 2,
      },
      {
        round: { id: 2, ordinal: 2, name: 'Race 2' },
        events: [{ sourceEventId: 'pine-creek', name: 'Pine Creek', conference: 'North' }],
        availability: 'published' as const,
        clubStarts: 6,
        firstRecordedStarts: 3,
      },
      {
        round: { id: 3, ordinal: 3, name: 'Race 3' },
        events: [{ sourceEventId: 'high-desert', name: 'High Desert', conference: 'North' }],
        availability: 'after-checkpoint' as const,
        clubStarts: null,
        firstRecordedStarts: null,
      },
    ],
  },
  personalSquad: { id: 2, name: 'Cedar', slug: 'cedar' },
  availableSquads: [
    { id: 2, name: 'Cedar', slug: 'cedar' },
    { id: 3, name: 'Summit', slug: 'summit' },
  ],
};

describe('SeasonDispatch', () => {
  it('gives a coach a factual Race-2 participation read and an entry to their squad', () => {
    const markup = renderToStaticMarkup(<SeasonDispatch dispatch={dispatch} />);

    expect(markup).toContain('Through Race 2');
    expect(markup).toContain('6 starts');
    expect(markup).toContain('3 club riders made their first recorded start this season.');
    expect(markup).toContain('6 club riders recorded a start at Race 2.');
    expect(markup).not.toContain('More riders reached the line');
    expect(markup).toContain('What would you like to try at the next race?');
    expect(markup).toContain('Cedar');
    expect(markup).toContain('href="/2026/squad/cedar?through=2"');
  });

  it('offers supported weekend evidence and a club roster entry at the same checkpoint', () => {
    const markup = renderToStaticMarkup(<SeasonDispatch dispatch={dispatch} />);
    expect(markup).toContain('More from this weekend');
    expect(markup).toContain('Read Race 2 review');
    expect(markup).toContain('href="/2026/roster?through=2"');
  });

  it('keeps the Race-2 result entry usable without claiming later results', () => {
    const markup = renderToStaticMarkup(<SeasonDispatch dispatch={dispatch} />);

    expect(markup).toContain('href="/2026/round/2?through=2"');
    expect(markup).toContain('Not included at this checkpoint');
    expect(markup).not.toContain('href="/2026/round/3?through=2"');
  });

  it('keeps unavailable first-start evidence unavailable', () => {
    const withoutFirstStarts = {
      ...dispatch,
      schedule: {
        ...dispatch.schedule,
        rounds: dispatch.schedule.rounds.map((round) =>
          round.round.ordinal === 2 ? { ...round, firstRecordedStarts: null } : round,
        ),
      },
    };

    const markup = renderToStaticMarkup(<SeasonDispatch dispatch={withoutFirstStarts} />);

    expect(markup).toContain('First recorded starts are not available at this checkpoint.');
    expect(markup).not.toContain('0 first recorded starts');
  });

  it('names a zero-based starts chart and preserves a published zero', () => {
    const withZeroStart = {
      ...dispatch,
      schedule: {
        ...dispatch.schedule,
        rounds: dispatch.schedule.rounds.map((round) =>
          round.round.ordinal === 1 ? { ...round, clubStarts: 0 } : round,
        ),
      },
    };

    const markup = renderToStaticMarkup(<SeasonDispatch dispatch={withZeroStart} />);

    expect(markup).toContain('role="img"');
    expect(markup).toContain('Club starts by race: Race 1, 0 starts; Race 2, 6 starts');
    expect(markup).toContain('Scale: 0 to 6 starts');
    expect(markup).toContain('0 starts');
  });

  it('keeps a partially published round out of the starts evidence', () => {
    const withPartialRound = {
      ...dispatch,
      schedule: {
        ...dispatch.schedule,
        rounds: dispatch.schedule.rounds.map((round) =>
          round.round.ordinal === 2
            ? {
                ...round,
                availability: 'partial' as const,
                clubStarts: null,
                firstRecordedStarts: null,
              }
            : round,
        ),
      },
    };

    const markup = renderToStaticMarkup(<SeasonDispatch dispatch={withPartialRound} />);

    expect(markup).toContain('Some results are not available yet');
    expect(markup).not.toContain('null starts');
    expect(markup).not.toContain('Race 2, 0 starts');
  });

  it('offers a native checkpoint form back to this season', () => {
    const markup = renderToStaticMarkup(<SeasonDispatch dispatch={dispatch} />);

    expect(markup).toContain('action="/2026"');
    expect(markup).toContain('method="get"');
    expect(markup).toContain('Through race');
    expect(markup).toContain('name="through"');
    expect(markup).toContain('Latest published');
    expect(markup).toContain('value="2"');
    expect(markup).toContain('Update checkpoint');
  });

  it('keeps an all-zero published chart readable without a synthetic bar length', () => {
    const allZero = {
      ...dispatch,
      schedule: {
        ...dispatch.schedule,
        rounds: dispatch.schedule.rounds.map((round) =>
          round.availability === 'published' ? { ...round, clubStarts: 0 } : round,
        ),
      },
    };

    const markup = renderToStaticMarkup(<SeasonDispatch dispatch={allZero} />);

    expect(markup).toContain('Scale: 0 to 0 starts');
    expect(markup).toContain('Club starts by race: Race 1, 0 starts; Race 2, 0 starts');
    expect(markup).not.toContain('NaN');
  });

  it('qualifies a partial latest round with the last complete starts evidence', () => {
    const throughFour = {
      ...dispatch,
      checkpoint: { kind: 'through' as const, ordinal: 4 },
      schedule: {
        ...dispatch.schedule,
        rounds: [
          ...dispatch.schedule.rounds.slice(0, 2),
          {
            ...dispatch.schedule.rounds[2]!,
            availability: 'published' as const,
            clubStarts: 3,
            firstRecordedStarts: 0,
          },
          {
            round: { id: 4, ordinal: 4, name: 'Race 4' },
            events: [{ sourceEventId: 'ridge-line', name: 'Ridge Line', conference: 'North' }],
            availability: 'partial' as const,
            clubStarts: null,
            firstRecordedStarts: null,
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(<SeasonDispatch dispatch={throughFour} />);

    expect(markup).toContain('Race 4 results are incomplete; showing starts through Race 3.');
    expect(markup).toContain('3 club riders recorded a start at Race 3.');
    expect(markup).toContain('Some results are not available yet');
    expect(markup).not.toContain('Race 4, 0 starts');
  });
});
