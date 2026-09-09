import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RiderProfile } from './RiderProfile.tsx';
import type { RiderSeason } from '../lib/db/editorial-query.ts';
import type { RaceResultRow } from './race-detail.ts';

const row = (overrides: Partial<RaceResultRow>): RaceResultRow => ({
  plate: 'A11',
  category: 'HS2 Girls',
  conference: 'North',
  place: '2',
  status: 'finished',
  timeRaw: '20:54',
  points: null,
  lapsDown: null,
  pctBack: 4.5,
  fieldSize: 12,
  fieldTopPct: null,
  scored: false,
  ptsLeader: false,
  grade: null,
  lapSplits: [],
  lapSeconds: [],
  ...overrides,
});

const profile = {
  rider: { id: 11, name: '«RIDER-A»' },
  checkpoint: { kind: 'through' as const, ordinal: 2 },
  rounds: [
    {
      round: { id: 1, ordinal: 1, name: 'Race 1' },
      results: [
        {
          race: {
            eventId: 101,
            sourceEventId: 'river-bend',
            name: 'River Bend',
            seasonYear: 2026,
            roundOrdinal: 1,
          },
          result: row({ place: '4', timeRaw: '22:00', pctBack: 10 }),
          officialTotal: '22:00',
          measured: { kind: 'none' as const },
        },
      ],
    },
    {
      round: { id: 2, ordinal: 2, name: 'Race 2' },
      results: [
        {
          race: {
            eventId: 102,
            sourceEventId: 'pine-creek',
            name: 'Pine Creek',
            seasonYear: 2026,
            roundOrdinal: 2,
          },
          result: row({ place: '2', timeRaw: '20:54', pctBack: 4.5 }),
          officialTotal: '20:54',
          measured: { kind: 'none' as const },
        },
      ],
    },
  ],
  selected: {
    race: {
      eventId: 102,
      sourceEventId: 'pine-creek',
      name: 'Pine Creek',
      seasonYear: 2026,
      roundOrdinal: 2,
    },
    result: row({ place: '2', timeRaw: '20:54', pctBack: 4.5 }),
    officialTotal: '20:54',
    measured: { kind: 'none' as const },
    neighbors: {
      gapBasis: 'derived-percent-back-percentage-points' as const,
      ahead: [{ plate: 'N1', place: '1', pctBack: 0, gapPctPoints: 4.5 }],
      behind: [{ plate: 'N3', place: '3', pctBack: 9.3, gapPctPoints: 4.8 }],
    },
  },
} satisfies RiderSeason;

describe('RiderProfile', () => {
  it('keeps a compact checkpoint-bounded history visible and lets a coach select its recorded event', () => {
    const markup = renderToStaticMarkup(<RiderProfile profile={profile} year={2026} />);

    expect(markup).toContain('«RIDER-A»');
    expect(markup).toContain('Through Race 2');
    expect(markup).toContain('Race 1');
    expect(markup).toContain('Race 2');
    expect(markup).toContain('href="/2026/rider/11?through=2&amp;event=river-bend"');
    expect(markup).toContain('href="/2026/rider/11?through=2&amp;event=pine-creek"');
    expect(markup).toContain('Official total');
    expect(markup).toContain('20:54');
  });

  it('offers keyboard-reachable ride and field views while keeping none, one, and many lap shapes distinct', () => {
    const oneMeasurement = {
      ...profile,
      selected: {
        ...profile.selected,
        measured: { kind: 'one' as const, label: 'Lap 2', value: '10:00', seconds: 600 },
      },
    } satisfies RiderSeason;
    const manyMeasurements = {
      ...profile,
      selected: {
        ...profile.selected,
        measured: {
          kind: 'many' as const,
          values: [
            { label: 'Lap 1', value: '10:20', seconds: 620 },
            { label: 'Lap 2', value: 'unreadable', seconds: null },
          ],
        },
      },
    } satisfies RiderSeason;

    const noneMarkup = renderToStaticMarkup(<RiderProfile profile={profile} year={2026} />);
    const oneMarkup = renderToStaticMarkup(<RiderProfile profile={oneMeasurement} year={2026} />);
    const manyMarkup = renderToStaticMarkup(
      <RiderProfile profile={manyMeasurements} year={2026} />,
    );

    expect(noneMarkup).toContain('aria-label="Selected result views"');
    expect(noneMarkup).toContain(
      'href="/2026/rider/11?through=2&amp;event=pine-creek&amp;view=my-ride"',
    );
    expect(noneMarkup).toContain(
      'href="/2026/rider/11?through=2&amp;event=pine-creek&amp;view=field-context"',
    );
    expect(noneMarkup).toContain('No lap measurements were published.');
    expect(oneMarkup).toContain('Lap 2');
    expect(oneMarkup).toContain('10:00');
    expect(manyMarkup).toContain('Measured laps: Lap 1 10:20; Lap 2 unreadable');
    expect(manyMarkup).not.toContain('id="field-context-heading"');
    expect(manyMarkup).not.toContain('Plate N1');
  });

  it('switches one selected event between My ride and Field context without stacking both panels', () => {
    const myRide = renderToStaticMarkup(
      <RiderProfile profile={profile} year={2026} view="my-ride" />,
    );
    const fieldContext = renderToStaticMarkup(
      <RiderProfile profile={profile} year={2026} view="field-context" />,
    );

    expect(myRide).toContain('aria-current="page"');
    expect(myRide).toContain('border-b-2 border-fg pb-1 no-underline');
    expect(myRide).toContain('Official total');
    expect(myRide).not.toContain('Derived gaps are relative to this rider');
    expect(fieldContext).toContain('Field context');
    expect(fieldContext).toContain(
      'Derived gaps are relative to this rider’s percent back and shown in percentage points.',
    );
    expect(fieldContext).not.toContain('id="my-ride-heading"');
  });

  it('keeps a direct history unselected instead of choosing a result on the coach’s behalf', () => {
    const unselected = { ...profile, selected: null } satisfies RiderSeason;

    const markup = renderToStaticMarkup(<RiderProfile profile={unselected} year={2026} />);

    expect(markup).toContain('Choose a recorded event to view its official total');
    expect(markup).toContain('href="/2026/rider/11?through=2&amp;event=pine-creek"');
    expect(markup).not.toContain('Official total</dt>');
  });

  it('gives an empty rider history an honest season return instead of a selection instruction', () => {
    const empty = {
      ...profile,
      checkpoint: { kind: 'none' as const },
      rounds: [],
      selected: null,
    } satisfies RiderSeason;

    const markup = renderToStaticMarkup(<RiderProfile profile={empty} year={2026} />);

    expect(markup).toContain('No recorded results are included at this checkpoint.');
    expect(markup).toContain('Return to the 2026 season');
    expect(markup).not.toContain('Choose a recorded event');
  });

  it('states unavailable source values and withholds field comparisons for a DNF or lap deficit', () => {
    const dnf = {
      ...profile,
      selected: {
        ...profile.selected,
        result: row({ place: '', status: 'dnf', timeRaw: '', pctBack: null, lapsDown: 2 }),
        officialTotal: '',
        neighbors: {
          gapBasis: 'derived-percent-back-percentage-points' as const,
          ahead: [],
          behind: [],
        },
      },
    } satisfies RiderSeason;
    const lapDeficit = {
      ...profile,
      selected: {
        ...profile.selected,
        result: row({ place: '8', lapsDown: 1, pctBack: null }),
      },
    } satisfies RiderSeason;

    const dnfMarkup = renderToStaticMarkup(
      <RiderProfile profile={dnf} year={2026} view="field-context" />,
    );
    const deficitMarkup = renderToStaticMarkup(
      <RiderProfile profile={lapDeficit} year={2026} view="field-context" />,
    );

    expect(dnfMarkup).toContain('Not published');
    expect(dnfMarkup).toContain('DNF');
    expect(dnfMarkup).toContain('field comparisons are withheld');
    expect(dnfMarkup).not.toContain('Derived gaps are relative to this rider');
    expect(dnfMarkup).not.toContain('−2 laps');
    expect(deficitMarkup).toContain('Lap deficit: −1 lap.');
    expect(deficitMarkup).toContain('Percent-back comparison is withheld.');
  });
});
