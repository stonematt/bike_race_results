// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { OperationsForm } from './OperationsForm.tsx';

afterEach(cleanup);
it('announces a failed save and preserves the entered name for correction', async () => {
  render(
    <OperationsForm
      action={async () => ({ error: 'Choose a different squad name.' })}
      submitLabel="Save name"
    >
      <label htmlFor="name">Squad name</label>
      <input id="name" name="name" defaultValue="Cedar" />
    </OperationsForm>,
  );
  fireEvent.change(screen.getByLabelText('Squad name'), { target: { value: 'North' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Save name' }).closest('form')!);
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a different squad name.'),
  );
  expect(screen.getByLabelText('Squad name')).toHaveValue('North');
  expect(screen.getByRole('alert')).toHaveFocus();
});
