// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SignIn from './page.tsx';

/**
 * The sign-in page is the one route middleware lets through, so nothing else
 * can route an already authenticated visitor away from it. These cover that
 * decision and, just as importantly, the sessions it must NOT act on — the
 * root flow sends those straight back here, and a wrong condition is a loop.
 */

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock('@/auth.ts', () => ({ signIn: vi.fn(), auth: mockAuth }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
// `admits` reads the same module, so this fixes both the rendered forms and
// which retained provider claims this deployment still honours.
vi.mock('@/lib/signin-providers.ts', () => ({
  availableProviders: () => ({ email: true, dev: false }),
}));

beforeEach(() => mockAuth.mockResolvedValue(null));
afterEach(cleanup);

it('sends a supported authenticated visit into the root flow instead of another email form', async () => {
  mockAuth.mockResolvedValue({
    provider: 'nodemailer',
    user: { id: 'synthetic-coach', email: 'coach@example.test' },
  });
  await expect(SignIn({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/');
});

it('ignores a callbackUrl when routing an authenticated visit, so the root stays the one entry', async () => {
  mockAuth.mockResolvedValue({
    provider: 'nodemailer',
    user: { id: 'synthetic-coach', email: 'coach@example.test' },
  });
  await expect(
    SignIn({ searchParams: Promise.resolve({ callbackUrl: 'https://elsewhere.example/' }) }),
  ).rejects.toThrow('redirect:/');
});

it('still offers the door to a signed-out visitor', async () => {
  render(await SignIn({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole('button', { name: 'Email me a link' })).toBeDefined();
});

it('does not route a retained development session this deployment no longer registers', async () => {
  mockAuth.mockResolvedValue({
    provider: 'dev',
    user: { id: 'synthetic-coach', email: 'coach@example.test' },
  });
  render(await SignIn({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole('button', { name: 'Email me a link' })).toBeDefined();
});

it('does not route a session carrying no user id, which the root flow would send straight back', async () => {
  mockAuth.mockResolvedValue({ provider: 'nodemailer', user: { email: 'coach@example.test' } });
  render(await SignIn({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole('button', { name: 'Email me a link' })).toBeDefined();
});
