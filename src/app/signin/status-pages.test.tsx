import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CheckEmail from './check-email/page.tsx';
import Recover from './recover/page.tsx';
import { REFUSED, signinMessage } from './messages.ts';

const recover = async (error?: string) =>
  renderToStaticMarkup(await Recover({ searchParams: Promise.resolve({ error }) }));

describe('branded authentication status pages', () => {
  it('renders an anonymous email-sent confirmation without exposing a recipient', () => {
    const markup = renderToStaticMarkup(<CheckEmail />);

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

  it('says a rejected link was expired or used, the one reason Auth.js asserts', async () => {
    const markup = await recover('Verification');

    expect(markup).toContain(signinMessage('Verification'));
    expect(markup).toContain('That sign-in link didn’t work.');
  });

  it('never echoes the raw error code or anything address-shaped', async () => {
    for (const error of [undefined, 'AccessDenied', 'Verification', 'Configuration']) {
      const markup = await recover(error);

      if (error) expect(markup).not.toContain(error);
      expect(markup).not.toMatch(/@|token|identifier|recipient/i);
    }
  });
});
