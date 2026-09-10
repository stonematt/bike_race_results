/**
 * The copy every authentication refusal is allowed to show, in one place
 * because two pages now render it. Auth.js splits its failures by error *kind*:
 * `SignInError` kinds come back to `/signin`, everything else — including the
 * `AccessDenied` a refused address raises before any mail is sent, and the
 * `Verification` a rejected link raises — is dispatched to `pages.error`. Both
 * surfaces must say the same thing about the same code, or the difference
 * between them becomes the disclosure.
 */

/**
 * Every refusal reads the same, whatever caused it: an address without a live
 * membership/invitation and an address that simply failed must not be
 * distinguishable, or this becomes a membership-discovery surface.
 */
export const REFUSED =
  'That sign-in was refused. Access to this app is by invitation — ask your club admin if you need access.';

/**
 * Only codes whose meaning Auth.js itself asserts get their own copy. Anything
 * else falls back to the refusal, which claims no reason at all.
 */
const MESSAGES: Record<string, string> = {
  Verification: 'That sign-in link has expired or was already used. Request a new one.',
};

/** Headline for the branded recovery page, matched to the copy below it. */
const HEADINGS: Record<string, string> = {
  Verification: 'That sign-in link didn’t work.',
};

const REFUSED_HEADING = 'We couldn’t sign you in.';

export function signinMessage(error?: string): string {
  return (error && MESSAGES[error]) || REFUSED;
}

export function recoveryHeading(error?: string): string {
  return (error && HEADINGS[error]) || REFUSED_HEADING;
}

/** The branded confirmation, as a literal: never an attacker-supplied target. */
export const EMAIL_SENT_PATH = '/signin/check-email';

/**
 * The only Auth.js error types this app is willing to put in a URL. @auth/core
 * applies the same filter before it redirects to `pages.error` — a server fault
 * becomes a generic code rather than naming itself — and the sign-in form has to
 * apply it too, because it catches the error before core's dispatch can. Any
 * other type drops the parameter and lands on the plain refusal.
 */
const DISCLOSABLE = new Set(['AccessDenied', 'Verification']);

export function recoveryPath(errorType?: string): string {
  return errorType && DISCLOSABLE.has(errorType)
    ? `/signin/recover?error=${errorType}`
    : '/signin/recover';
}
