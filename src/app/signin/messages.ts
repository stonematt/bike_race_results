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
  Verification: 'Use a new sign-in link to try again.',
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
 * The only shape of `callbackUrl` this app will put back into a URL: a
 * same-origin absolute path. The value is attacker-supplied — it arrives as a
 * query parameter — so anything a browser would resolve off-origin is dropped
 * rather than repaired: an absolute `https://elsewhere.example/`, a
 * protocol-relative `//elsewhere.example`, and the `/\elsewhere.example` a
 * browser normalises into one. `/` is dropped too, because it is where
 * `/signin` sends an unparameterised visitor anyway.
 *
 * Nothing here redirects to the value. It is only handed back to `/signin`,
 * which declines to redirect to it as well (issue #158) and passes it to
 * Auth.js as `redirectTo` for trusted-origin validation.
 */
function safeCallbackUrl(callbackUrl?: string): string | undefined {
  if (!callbackUrl || callbackUrl === '/') return undefined;
  if (callbackUrl[0] !== '/') return undefined;
  if (callbackUrl[1] === '/' || callbackUrl[1] === '\\') return undefined;
  return callbackUrl;
}

/**
 * The href the status pages offer back to the door. `URLSearchParams` does the
 * encoding, so the value is never interpolated into the href raw.
 */
export function signinHref(callbackUrl?: string): string {
  const safe = safeCallbackUrl(callbackUrl);
  return safe ? `/signin?${new URLSearchParams({ callbackUrl: safe })}` : '/signin';
}

/**
 * Where a sent link lands. Auth.js forwards no `callbackUrl` of its own to
 * either status page — `pages.error` is reached with `?error=` alone and
 * `pages.verifyRequest` with `?provider=&type=` — so the destination the
 * visitor asked for survives only because the Server Action still holds it and
 * carries it here.
 */
export function emailSentPath(callbackUrl?: string): string {
  const safe = safeCallbackUrl(callbackUrl);
  return safe
    ? `${EMAIL_SENT_PATH}?${new URLSearchParams({ callbackUrl: safe })}`
    : EMAIL_SENT_PATH;
}

/**
 * The only Auth.js error types this app is willing to put in a URL. @auth/core
 * applies the same filter before it redirects to `pages.error` — a server fault
 * becomes a generic code rather than naming itself — and the sign-in form has to
 * apply it too, because it catches the error before core's dispatch can. Any
 * other type drops the parameter and lands on the plain refusal.
 */
const DISCLOSABLE = new Set(['AccessDenied', 'Verification']);

export function recoveryPath(errorType?: string, callbackUrl?: string): string {
  const params = new URLSearchParams();
  if (errorType && DISCLOSABLE.has(errorType)) params.set('error', errorType);
  const safe = safeCallbackUrl(callbackUrl);
  if (safe) params.set('callbackUrl', safe);
  const query = params.toString();
  return query ? `/signin/recover?${query}` : '/signin/recover';
}
