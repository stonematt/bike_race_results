// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import type { OperationAction } from '@/components/OperationsForm.tsx';
import { StoryDetail } from './StoryDetail.tsx';

afterEach(cleanup);

it('shows a reviewed selection’s exact Event evidence and keeps publish separate from approval', () => {
  const action: OperationAction = vi.fn(async () => ({}));
  render(
    <StoryDetail
      year={2026}
      clubName="Demo Descenders"
      role="admin"
      story={{
        id: 9,
        eventId: 2,
        state: 'reviewed',
        revision: 2,
        surface: 'race-review',
        checkpointOrdinal: 2,
        validation: { kind: 'current' },
        evidence: {
          kind: 'available',
          candidate: {
            clubId: 1,
            fingerprint: 'reviewed-evidence',
            count: 5,
            season: { id: 2, year: 2026 },
            checkpoint: { kind: 'through', ordinal: 2 },
            event: {
              id: 2,
              sourceEventId: 'demo-2026-round-1',
              name: 'Demo Race 1 — Old Oak',
              conference: 'North',
              round: { id: 2, ordinal: 1, name: 'Race 1' },
            },
            source: {
              rawFetchId: 1,
              contentHash: 'a'.repeat(64),
              listId: 'demo-results',
              hidden: false,
            },
            template: 'club-starts-at-event',
          },
        },
      }}
      rounds={[
        {
          ordinal: 1,
          name: 'Race 1',
          events: [
            {
              id: 2,
              sourceEventId: 'demo-2026-round-1',
              name: 'Demo Race 1 — Old Oak',
              conference: 'North',
            },
          ],
        },
        {
          ordinal: 2,
          name: 'Race 2',
          events: [
            {
              id: 3,
              sourceEventId: 'demo-2026-round-2',
              name: 'Demo Race 2 — Pine Loop',
              conference: 'North',
            },
          ],
        },
      ]}
      selection={{ checkpointOrdinal: 2, eventId: 3, surface: 'race-review' }}
      preview={{
        kind: 'available',
        candidate: {
          clubId: 1,
          fingerprint: 'revised-evidence',
          count: 3,
          season: { id: 2, year: 2026 },
          checkpoint: { kind: 'through', ordinal: 2 },
          event: {
            id: 3,
            sourceEventId: 'demo-2026-round-2',
            name: 'Demo Race 2 — Pine Loop',
            conference: 'North',
            round: { id: 3, ordinal: 2, name: 'Race 2' },
          },
          source: {
            rawFetchId: 2,
            contentHash: 'b'.repeat(64),
            listId: 'demo-results-2',
            hidden: false,
          },
          template: 'club-starts-at-event',
        },
      }}
      replacement={{ id: 4, eventName: 'Earlier Event (North)' }}
      action={action}
    />,
  );

  expect(screen.getByRole('heading', { name: 'Reviewed story' })).toBeInTheDocument();
  expect(
    screen.getByText('5 club riders recorded a start at Demo Race 1 — Old Oak (North).'),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'See Demo Race 1 — Old Oak results' })).toHaveAttribute(
    'href',
    '/2026/round/1?through=2#event-demo-2026-round-1',
  );
  expect(screen.getAllByText('Checkpoint')[0]!.nextElementSibling).toHaveTextContent(
    'Through race 2',
  );
  expect(screen.getByRole('heading', { name: 'Revision preview' })).toBeInTheDocument();
  expect(
    screen.getByText('3 club riders recorded a start at Demo Race 2 — Pine Loop (North).'),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'See Demo Race 2 — Pine Loop results' })).toHaveAttribute(
    'href',
    '/2026/round/2?through=2#event-demo-2026-round-2',
  );
  expect(screen.getByRole('button', { name: 'Save revised draft' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Approve this evidence' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Publish story' })).toBeInTheDocument();
  expect(screen.getByText('Publishing replaces Earlier Event (North).')).toBeInTheDocument();
});

it('keeps an omitted race-review placement and offers a refreshed draft when publication is stale', () => {
  const action: OperationAction = vi.fn(async () => ({}));
  render(
    <StoryDetail
      year={2026}
      clubName="Demo Descenders"
      role="admin"
      story={{
        id: 10,
        eventId: 3,
        state: 'published',
        revision: 1,
        surface: 'race-review',
        checkpointOrdinal: 2,
        validation: { kind: 'stale-evidence', reason: 'source' },
        evidence: { kind: 'unavailable', reason: 'missing-source' },
      }}
      rounds={[
        {
          ordinal: 2,
          name: 'Race 2',
          events: [
            {
              id: 3,
              sourceEventId: 'demo-2026-round-2',
              name: 'Demo Race 2 — Pine Loop',
              conference: 'North',
            },
          ],
        },
      ]}
      selection={{}}
      preview={{
        kind: 'available',
        candidate: {
          clubId: 1,
          fingerprint: 'fresh-evidence',
          count: 4,
          season: { id: 2, year: 2026 },
          checkpoint: { kind: 'through', ordinal: 2 },
          event: {
            id: 3,
            sourceEventId: 'demo-2026-round-2',
            name: 'Demo Race 2 — Pine Loop',
            conference: 'North',
            round: { id: 3, ordinal: 2, name: 'Race 2' },
          },
          source: {
            rawFetchId: 2,
            contentHash: 'b'.repeat(64),
            listId: 'demo-results-2',
            hidden: false,
          },
          template: 'club-starts-at-event',
        },
      }}
      action={action}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('The selected source changed.');
  expect(screen.getByLabelText('Placement')).toHaveValue('race-review');
  expect(screen.getByLabelText('Event')).toHaveValue('3');
  expect(screen.getByRole('heading', { name: 'Revision preview' })).toBeInTheDocument();
  const refresh = screen.getByRole('button', { name: 'Create refreshed draft' }).closest('form');
  expect(refresh).toHaveFormValues({ operation: 'create', eventId: '3', surface: 'race-review' });
});
