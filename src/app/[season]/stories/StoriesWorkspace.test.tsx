// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import type { OperationAction } from '@/components/OperationsForm.tsx';
import { StoriesWorkspace } from './StoriesWorkspace.tsx';

afterEach(cleanup);

it('previews an explicit checkpointed Event and saves only its server-derived evidence as a draft', async () => {
  let submitted: FormData | undefined;
  const saveDraft: OperationAction = async (_state, data) => {
    submitted = data;
    return { message: 'Draft saved.' };
  };
  render(
    <StoriesWorkspace
      year={2026}
      clubName="Demo Descenders"
      role="admin"
      workspace={{
        rounds: [
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
          { ordinal: 2, name: 'Race 2', events: [] },
        ],
        stories: [
          {
            id: 9,
            state: 'draft',
            revision: 1,
            surface: 'season-dispatch',
            checkpointOrdinal: 2,
            event: {
              id: 2,
              sourceEventId: 'demo-2026-round-1',
              name: 'Demo Race 1 — Old Oak',
              conference: 'North',
              round: { ordinal: 1, name: 'Race 1' },
            },
            validation: { kind: 'current' },
          },
        ],
      }}
      selection={{ checkpointOrdinal: 2, eventId: 2, surface: 'season-dispatch' }}
      preview={{
        kind: 'available',
        candidate: {
          clubId: 1,
          fingerprint: 'evidence-fingerprint',
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
            listId: 'demo-2026-individual-results',
            hidden: false,
          },
          template: 'club-starts-at-event',
        },
      }}
      saveDraft={saveDraft}
    />,
  );

  expect(screen.getByRole('heading', { name: 'Stories', level: 1 })).toBeInTheDocument();
  expect(screen.getByText('Demo Descenders · 2026 · Admin')).toBeInTheDocument();
  expect(screen.getByLabelText('Through race')).toHaveValue('2');
  expect(screen.getByLabelText('Placement')).toHaveValue('season-dispatch');
  expect(screen.getByLabelText('Event')).toHaveValue('2');
  expect(screen.getByRole('button', { name: 'Preview selection' }).closest('form')).toHaveAttribute(
    'action',
    '/2026/stories',
  );
  expect(
    screen.getByText('5 club riders recorded a start at Demo Race 1 — Old Oak (North).'),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'See Demo Race 1 — Old Oak results' })).toHaveAttribute(
    'href',
    '/2026/round/1?through=2#event-demo-2026-round-1',
  );
  expect(screen.getByText('Checkpoint').nextElementSibling).toHaveTextContent('Through race 2');
  expect(screen.getByText(/Through race 2 · Draft/)).toBeInTheDocument();

  fireEvent.submit(screen.getByRole('button', { name: 'Save draft' }).closest('form')!);
  await waitFor(() => expect(submitted).toBeInstanceOf(FormData));
  if (!submitted) throw new Error('Draft form was not submitted');
  expect(submitted.get('expectedEvidence')).toBe('evidence-fingerprint');
  expect(submitted.get('eventId')).toBe('2');
  expect(submitted.get('checkpointOrdinal')).toBe('2');
  expect(submitted.get('surface')).toBe('season-dispatch');
});
