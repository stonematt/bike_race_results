import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CheckEmail from './check-email/page.tsx';
import Recover from './recover/page.tsx';
import { REFUSED } from './messages.ts';

const recover = async (error?: string, callbackUrl?: string) =>
  renderToStaticMarkup(await Recover({ searchParams: Promise.resolve({ error, callbackUrl }) }));

const checkEmail = async (callbackUrl?: string) =>
  renderToStaticMarkup(await CheckEmail({ searchParams: Promise.resolve({ callbackUrl }) }));

describe('branded authentication status pages', () => {
  it('renders an anonymous email-sent confirmation without exposing a recipient', async () => {
    const markup = await checkEmail();

    expect(markup).toContain('Every result opens a conversation.');
    expect(markup).toContain('Check your email for a sign-in link.');
    expect(markup).toContain('href="/signin"');
    expect(markup).not.toMatch(/@|token|identifier/i);
  });

  it('keeps the accepted login presentation on the recovery surface', async () => {
    const markup = await recover();

    expect(markup).toContain('Every result opens a conversation.');
    expect(markup).toContain('MILO rides with us.');
    expect(markup).toContain('Request a new sign-in link');
    expect(markup).toContain('href="/signin"');
  });

  /**
   * The refusal is the whole point of the shared copy: a refused address must
   * not be told anything a working one is not, so every code Auth.js does not
   * define for us renders one wording.
   */
  it('renders one refusal wording for a refused address and for an unrecognised code', async () => {
    const denied = await recover('AccessDenied');
    const unknown = await recover('SomethingElse');

    expect(denied).toContain(REFUSED);
    expect(denied).toBe(unknown);
    expect(denied).not.toMatch(/expired|already used/i);
  });

  it('gives a rejected link a cause-neutral way forward', async () => {
    const markup = await recover('Verification');

    expect(markup).toContain('That sign-in link didn’t work.');
    expect(markup).toContain('Use a new sign-in link to try again.');
    expect(markup).not.toMatch(/expired|already used/i);
  });

  /**
   * Auth.js forwards no `callbackUrl` to either status page — `pages.error` is
   * reached with `?error=` alone — so the Server Action carries it, and these
   * pages have to hand it back or the way forward silently becomes `/`.
   */
  describe('the way back to the door', () => {
    it('returns a visitor to where they were going, from either state', async () => {
      expect(await checkEmail('/seasons/2025')).toContain(
        'href="/signin?callbackUrl=%2Fseasons%2F2025"',
      );
      expect(await recover('Verification', '/seasons/2025')).toContain(
        'href="/signin?callbackUrl=%2Fseasons%2F2025"',
      );
    });

    it('drops a destination a browser would resolve off-origin', async () => {
      for (const hostile of [
        'https://elsewhere.example/',
        '//elsewhere.example',
        '/\\elsewhere.example',
        'javascript:alert(1)',
        '/',
      ]) {
        expect(await checkEmail(hostile)).toContain('href="/signin"');
        expect(await recover(undefined, hostile)).toContain('href="/signin"');
      }
    });

    it('encodes the destination rather than interpolating it into the href', async () => {
      const markup = await checkEmail('/seasons/2025?a=1&b="x"');

      expect(markup).toContain(
        'href="/signin?callbackUrl=%2Fseasons%2F2025%3Fa%3D1%26b%3D%22x%22"',
      );
      expect(markup).not.toContain('b="x"');
    });
  });

  it('never echoes the raw error code or anything address-shaped', async () => {
    for (const error of [undefined, 'AccessDenied', 'Verification', 'Configuration']) {
      const markup = await recover(error);

      if (error) expect(markup).not.toContain(error);
      expect(markup).not.toMatch(/@|token|identifier|recipient/i);
    }
  });
});
