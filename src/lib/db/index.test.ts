import { expect, it } from 'vitest';
import { createDb } from './index.ts';

it('keeps legacy command helpers local-PGlite-only without exposing a Postgres URL', () => {
  const url = 'postgresql://synthetic-user:synthetic-password@127.0.0.1:55432/synthetic';
  expect(() => createDb(url)).toThrow('only a local PGlite directory');
  try {
    createDb(url);
  } catch (error) {
    expect((error as Error).message).not.toMatch(/synthetic-user|synthetic-password|127\.0\.0\.1/);
  }
});
