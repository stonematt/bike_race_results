import { AuthError } from 'next-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A Server Action that throws is an HTTP 500, not a redirect, and no rendering
 * test can see it: local UAT found a refused address reaching a browser error
 * page while every page test passed. These cover the catch, which is the only
 * thing standing between an unadmitted visitor and that 500.
 */

const { mockSignIn } = vi.hoisted(() => ({ mockSignIn: vi.fn() }));
vi.mock('@/auth.ts', () => ({ signIn: mockSignIn }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const { requestEmailLink, signInWithDevShim } = await import('./actions.ts');

const form = (email: string) => {
  const data = new FormData();
  data.set('email', email);
  return data;
};

class Denied extends AuthError {
  static type = 'AccessDenied';
}

beforeEach(() => mockSignIn.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('the sign-in Server Actions', () => {
  it('sends a refused address to the branded recovery page instead of throwing a 500', async () => {
    mockSignIn.mockRejectedValue(new Denied());

    await expect(requestEmailLink('/', form('stranger@example.test'))).rejects.toThrow(
      'redirect:/signin/recover?error=AccessDenied',
    );
  });

  it('drops an error type it is not willing to disclose, landing on the plain refusal', async () => {
    class Faulty extends AuthError {
      static type = 'AdapterError';
    }
    mockSignIn.mockRejectedValue(new Faulty());

    // Anchored: a substring match would also accept a leaked `?error=` here.
    await expect(requestEmailLink('/', form('coach@example.test'))).rejects.toThrow(
      /^redirect:\/signin\/recover$/,
    );
  });

  it('lands a sent link on the branded confirmation, not the internal endpoint', async () => {
    mockSignIn.mockResolvedValue(undefined);

    await expect(requestEmailLink('/', form('coach@example.test'))).rejects.toThrow(
      'redirect:/signin/check-email',
    );
  });

  /**
   * `redirectTo` is attacker-supplied — it arrives as `?callbackUrl=`. Auth.js
   * validates it against the trusted origin, so it must reach `signIn` and must
   * never become a destination this module picks itself.
   */
  it('hands redirectTo to Auth.js and never redirects to it', async () => {
    mockSignIn.mockResolvedValue(undefined);

    await expect(
      requestEmailLink('https://elsewhere.example/', form('coach@example.test')),
    ).rejects.toThrow('redirect:/signin/check-email');
    expect(mockSignIn).toHaveBeenCalledWith('nodemailer', {
      email: 'coach@example.test',
      redirectTo: 'https://elsewhere.example/',
      redirect: false,
    });
  });

  /**
   * Auth.js hands neither status page a `callbackUrl` of its own — its
   * `pages.error` redirect carries `?error=` alone — so this is the only place
   * the visitor's destination can survive the detour. It is still filtered and
   * encoded, never redirected to.
   */
  it('carries a same-origin destination onto both status pages', async () => {
    mockSignIn.mockResolvedValue(undefined);
    await expect(requestEmailLink('/seasons/2025', form('coach@example.test'))).rejects.toThrow(
      'redirect:/signin/check-email?callbackUrl=%2Fseasons%2F2025',
    );

    mockSignIn.mockRejectedValue(new Denied());
    await expect(requestEmailLink('/seasons/2025', form('stranger@example.test'))).rejects.toThrow(
      'redirect:/signin/recover?error=AccessDenied&callbackUrl=%2Fseasons%2F2025',
    );
  });

  it('leaves an off-origin destination out of the status page URL entirely', async () => {
    mockSignIn.mockResolvedValue(undefined);
    await expect(
      requestEmailLink('https://elsewhere.example/', form('coach@example.test')),
    ).rejects.toThrow(/^redirect:\/signin\/check-email$/);

    mockSignIn.mockRejectedValue(new Denied());
    await expect(
      requestEmailLink('//elsewhere.example', form('stranger@example.test')),
    ).rejects.toThrow(/^redirect:\/signin\/recover\?error=AccessDenied$/);
  });

  it('re-throws anything that is not an Auth.js error, including its own redirect', async () => {
    const boom = new TypeError('database is on fire');
    mockSignIn.mockRejectedValue(boom);

    await expect(requestEmailLink('/', form('coach@example.test'))).rejects.toThrow(boom);
  });

  it('gives the development shim the same catch', async () => {
    mockSignIn.mockRejectedValue(new Denied());

    await expect(signInWithDevShim('/', form('stranger@example.test'))).rejects.toThrow(
      'redirect:/signin/recover?error=AccessDenied',
    );
  });

  it('leaves the shim’s own successful redirect alone', async () => {
    mockSignIn.mockRejectedValue(new Error('redirect:/'));

    await expect(signInWithDevShim('/', form('coach@example.test'))).rejects.toThrow('redirect:/');
  });
});
