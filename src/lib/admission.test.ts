/**
 * Who gets in — plus the bind that makes the answer safe.
 *
 * These two things are tested together because they are one decision. The
 * development shim admits any address without proof, which is only tolerable
 * because the server it admits them to is reachable from nowhere but this
 * machine. Weaken either half and the other stops being defensible, so a
 * reader who finds the bypass test finds the bind test directly under it.
 *
 * env is injected rather than stubbed globally, matching allowlist.test.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { admits, DEV_PROVIDER_ID } from './admission.ts';

const LISTED = 'coach@example.org';
const STRANGER = 'anyone@example.test';
const MAIL = 'nodemailer';

/** The shim switched on, deliberately, exactly as .env.example describes it. */
const devOn = {
  NODE_ENV: 'development',
  AUTH_DEV_LOGIN: '1',
  AUTH_EMAIL_SERVER: 'smtp://localhost:1025',
  AUTH_ALLOWED_EMAILS: LISTED,
};

describe('admits, through the dev shim', () => {
  it('admits any address when the shim is switched on', () => {
    // The point of the change: local development is "type an address, you are
    // in". The allowlist is not what protects this instance — the loopback
    // bind tested at the bottom of this file is.
    expect(admits(DEV_PROVIDER_ID, { email: STRANGER }, devOn)).toBe(true);
    expect(admits(DEV_PROVIDER_ID, { email: LISTED }, devOn)).toBe(true);
  });

  it('admits nobody through a shim that was never registered', () => {
    // Same address, same claimed provider, shim off. The bypass has to be a
    // property of the running configuration, not of the string 'dev' — this is
    // what stops a stale token claiming its way past the allowlist.
    const devOff = { NODE_ENV: 'development', AUTH_ALLOWED_EMAILS: LISTED };
    expect(admits(DEV_PROVIDER_ID, { email: STRANGER }, devOff)).toBe(false);
    expect(admits(DEV_PROVIDER_ID, { email: STRANGER }, { ...devOff, AUTH_DEV_LOGIN: '0' })).toBe(
      false,
    );
  });

  it('admits nobody through the shim under NODE_ENV=production, whatever AUTH_DEV_LOGIN says', () => {
    // The .env-copied-to-a-server case, and the reason the bypass re-reads the
    // environment instead of trusting the token: a leaked or reused AUTH_SECRET
    // still cannot replay a 'dev' claim into a hosted deployment.
    const prod = {
      NODE_ENV: 'production',
      AUTH_DEV_LOGIN: '1',
      AUTH_EMAIL_SERVER: 'smtp://localhost:1025',
      AUTH_ALLOWED_EMAILS: LISTED,
    };
    expect(admits(DEV_PROVIDER_ID, { email: STRANGER }, prod)).toBe(false);
    // A dev token never becomes a production identity merely because the
    // typed address also appears on the production allowlist.
    expect(admits(DEV_PROVIDER_ID, { email: LISTED }, prod)).toBe(false);
    // A real magic-link session for that same allowlisted address remains
    // valid; this rejection is about dev provenance, not the address itself.
    expect(admits(MAIL, { email: LISTED }, prod)).toBe(true);
  });
});

describe('admits, every other provider', () => {
  it('permits a configured email provider without treating an allowlist as club authority', () => {
    const emailOn = {
      NODE_ENV: 'production',
      AUTH_EMAIL_SERVER: 'smtp://localhost:1025',
      AUTH_ALLOWED_EMAILS: '',
    };

    expect(admits(MAIL, { email: STRANGER }, emailOn)).toBe(true);
  });

  it('refuses an unsupported provider even when its claimed address is allowlisted', () => {
    const emailOn = {
      NODE_ENV: 'production',
      AUTH_EMAIL_SERVER: 'smtp://localhost:1025',
      AUTH_ALLOWED_EMAILS: LISTED,
    };

    expect(admits(MAIL, { email: LISTED }, emailOn)).toBe(true);
    expect(admits('unsupported-provider', { email: LISTED }, emailOn)).toBe(false);
  });

  it('keeps the configured email provider distinct from the local shim', () => {
    // The shim's availability cannot establish email-provider provenance.
    expect(admits(MAIL, { email: STRANGER }, devOn)).toBe(true);
    expect(admits(MAIL, { email: LISTED }, devOn)).toBe(true);
  });

  it('does not treat an allowlist edit as a membership decision', () => {
    // Revocation now belongs to the active membership read on each Node request.
    const struck = { ...devOn, AUTH_ALLOWED_EMAILS: 'someone-else@example.org' };
    expect(admits(MAIL, { email: LISTED }, devOn)).toBe(true);
    expect(admits(MAIL, { email: LISTED }, struck)).toBe(true);
  });

  it('fails closed when the email provider is not configured', () => {
    const empty = { NODE_ENV: 'development', AUTH_DEV_LOGIN: '1', AUTH_ALLOWED_EMAILS: '' };
    expect(admits(MAIL, { email: LISTED }, empty)).toBe(false);
    expect(admits(MAIL, { email: STRANGER }, empty)).toBe(false);
    expect(admits(undefined, { email: LISTED }, empty)).toBe(false);
  });
});

describe('admits, with no identity', () => {
  it('refuses an anonymous request even while the shim is switched on', () => {
    // The shim drops the allowlist, not the requirement to be signed in.
    expect(admits(DEV_PROVIDER_ID, null, devOn)).toBe(false);
    expect(admits(DEV_PROVIDER_ID, undefined, devOn)).toBe(false);
    expect(admits(DEV_PROVIDER_ID, {}, devOn)).toBe(false);
    expect(admits(DEV_PROVIDER_ID, { email: null }, devOn)).toBe(false);
    expect(admits(undefined, null, devOn)).toBe(false);
  });
});

describe('the dev server bind', () => {
  it('binds pnpm dev to loopback', () => {
    // `next dev` binds 0.0.0.0 and prints a Network URL. At a race venue on
    // shared wifi that is every device on the LAN reading minors' names, and
    // since the shim above no longer runs the allowlist, this line is the only
    // thing standing in front of it. Asserting the script, not the socket: it
    // catches the flag being dropped, which is how this regresses.
    const pkg = JSON.parse(
      fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.dev).toMatch(/(?:--hostname|-H)[= ]127\.0\.0\.1/);
  });
});
