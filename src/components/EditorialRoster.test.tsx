import { renderToStaticMarkup } from 'react-dom/server';
import type { RiderEventResult } from '../lib/db/editorial-query.ts';
import { describe, expect, it } from 'vitest';
import { EditorialRoster, type EditorialRosterData } from './EditorialRoster.tsx';

const squad = { id: 1, name: 'Cedar', slug: 'cedar', archived: false };
const roster: EditorialRosterData = {
  season: { id: 1, year: 2025 },
  checkpoint: { kind: 'through', ordinal: 2 },
  squad,
  rounds: [],
  riders: [{ id: 7, name: '«RIDER-A»', category: null, results: [] }],
};

describe('EditorialRoster', () => {
  it('keeps checkpoint context across club scope and named rider history, even without results', () => {
    const markup = renderToStaticMarkup(<EditorialRoster roster={roster} squads={[squad]} />);
    expect(markup).toContain('Cedar squad');
    expect(markup).toContain('Race schedule unavailable');
    expect(markup).not.toContain('Scroll across for races');
    expect(markup).toContain('Through Race 2');
    expect(markup).toContain('href="/2025/roster?through=2"');
    expect(markup).toContain('href="/2025/rider/7?through=2"');
    expect(markup).toContain('href="/2025?through=2"');
    expect(markup).not.toContain('Did not start');
  });
  it('distinguishes an absent recorded result from incomplete, unpublished and excluded evidence', () => {
    const rounds = ['published', 'partial', 'unpublished', 'after-checkpoint'].map(
      (availability, i) => ({
        round: { id: i + 1, ordinal: i + 1, name: `Race ${i + 1}` },
        events: [],
        availability: availability as EditorialRosterData['rounds'][number]['availability'],
        clubStarts: availability === 'published' ? 0 : null,
        firstRecordedStarts: availability === 'published' ? 0 : null,
      }),
    );
    const markup = renderToStaticMarkup(
      <EditorialRoster roster={{ ...roster, rounds }} squads={[squad]} />,
    );
    expect(markup).toContain('No result recorded');
    expect(markup).toContain('Results incomplete');
    expect(markup).toContain('Results not published');
    expect(markup).toContain('After checkpoint');
    expect(markup).not.toContain('Did not start');
    expect(markup).not.toContain('href="/2025/round/4?through=2"');
  });
  it('retains both event results, published places and honest comparison gaps in one race cell', () => {
    const result: RiderEventResult = {
      race: {
        eventId: 1,
        sourceEventId: 'north',
        name: 'North course',
        seasonYear: 2025,
        roundOrdinal: 2,
      },
      result: {
        plate: 'D1',
        category: 'HS2 Boys',
        conference: 'North',
        place: '12',
        status: 'finished',
        timeRaw: '30:00',
        points: null,
        lapsDown: 1,
        pctBack: null,
        fieldSize: 20,
        fieldTopPct: null,
        scored: false,
        ptsLeader: false,
        grade: null,
        lapSplits: [],
        lapSeconds: [],
      },
      officialTotal: '30:00',
      measured: { kind: 'none' },
    };
    const second: RiderEventResult = {
      ...result,
      race: { ...result.race, eventId: 2, sourceEventId: 'south', name: 'South course' },
      result: { ...result.result, status: 'dnf', place: 'DNF', conference: 'South' },
      officialTotal: 'DNF',
    };
    const populated = {
      ...roster,
      rounds: [
        {
          round: { id: 2, ordinal: 2, name: 'Race 2' },
          events: [],
          availability: 'published' as const,
          clubStarts: 1,
          firstRecordedStarts: 1,
        },
      ],
      riders: [{ ...roster.riders[0]!, category: 'HS2 Boys', results: [result, second] }],
    };
    const markup = renderToStaticMarkup(<EditorialRoster roster={populated} squads={[squad]} />);
    expect(markup).toContain('event=north');
    expect(markup).toContain('event=south');
    expect(markup).toContain('Place 12 of 20');
    expect(markup).toContain('−1 lap');
    expect(markup).toContain('Time comparison unavailable');
    expect(markup).toContain('DNF');
    expect(markup).toContain('1 of 1 rostered riders recorded a start at Race 2');
    expect(markup).not.toContain('0%');
  });
});

it('labels an archived roster read-only and does not claim a historical membership snapshot', () => {
  const markup = renderToStaticMarkup(
    <EditorialRoster roster={{ ...roster, squad: { ...squad, archived: true } }} squads={[]} />,
  );
  expect(markup).toContain('Archived squad');
  expect(markup).toContain('Read-only');
  expect(markup).toContain(
    'Membership shown is the currently recorded roster, not a historical snapshot.',
  );
  expect(markup).toContain('href="/2025?through=2"');
  expect(markup).toContain('«RIDER-A»');
});
