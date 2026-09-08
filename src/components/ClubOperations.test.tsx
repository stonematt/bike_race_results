// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { ClubOperations } from './ClubOperations.tsx';
import type { ClubOperations as Model } from '@/lib/club-operations-query.ts';
afterEach(cleanup);
const model: Model = {
  role: 'member',
  squads: [
    {
      id: 1,
      name: 'Cedar',
      slug: 'cedar',
      archived: false,
      canManage: false,
      riderIds: [],
      accountIds: [],
    },
  ],
  riders: [],
  preferredSquadId: null,
  accounts: [],
  invitations: [],
};
it('lets members choose navigation and read squads without management forms', () => {
  render(
    <ClubOperations year={2025} clubName="Demo Club" model={model} action={async () => ({})} />,
  );
  expect(screen.getByRole('link', { name: 'Open Cedar roster' })).toHaveAttribute(
    'href',
    '/2025/squad/cedar',
  );
  expect(screen.getByRole('combobox', { name: 'Your squad' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create squad' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save name' })).not.toBeInTheDocument();
});
it('gives a managing coach neutral naming guidance and an explicit archive confirmation', () => {
  render(
    <ClubOperations
      year={2025}
      clubName="Demo Club"
      model={{ ...model, role: 'coach', squads: [{ ...model.squads[0]!, canManage: true }] }}
      action={async () => ({})}
    />,
  );
  expect(
    screen.getAllByText(/Avoid labels about riders’ ability or behavior/).length,
  ).toBeGreaterThan(0);
  expect(screen.getByLabelText('Archive Cedar')).toBeRequired();
  expect(screen.getByRole('button', { name: 'Create squad' })).toBeInTheDocument();
});

it('announces the archive outcome outside the removed editor and keeps its roster link', () => {
  render(
    <ClubOperations
      year={2025}
      clubName="Demo Club"
      model={{ ...model, role: 'coach', squads: [{ ...model.squads[0]!, archived: true }] }}
      action={async () => ({})}
      notice="Cedar archived. Its address and roster remain available."
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Cedar archived.');
  expect(screen.getByRole('status')).toHaveFocus();
  expect(screen.getByRole('link', { name: 'Open archived Cedar roster' })).toHaveAttribute(
    'href',
    '/2025/squad/cedar',
  );
  expect(screen.queryByText('Manage Cedar')).not.toBeInTheDocument();
});

it('gives admins explicit role and revocation forms for existing active accounts only', () => {
  render(
    <ClubOperations
      year={2025}
      clubName="Demo Club"
      model={{
        ...model,
        role: 'admin',
        accounts: [
          {
            id: 'admin',
            name: 'Demo Admin',
            email: 'admin@example.test',
            role: 'admin',
            revoked: false,
          },
          {
            id: 'former',
            name: 'Demo Former',
            email: 'former@example.test',
            role: 'member',
            revoked: true,
          },
        ],
      }}
      action={async () => ({})}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Club accounts' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Role for Demo Admin' })).toHaveValue('admin');
  expect(screen.getByLabelText('Revoke access for Demo Admin')).toBeRequired();
  expect(screen.queryByRole('combobox', { name: 'Role for Demo Former' })).not.toBeInTheDocument();
  expect(screen.getByText('Access revoked')).toBeInTheDocument();
});
