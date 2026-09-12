/**
 * The one email-address normalizer: trimmed and lowercased. It is the form the
 * sign-in gate compares (`canStartEmailSignIn`, `authz/access.ts`), the form an
 * invitation stores as `email_normalized` (`club-membership-operations.ts`),
 * and the form the operator grant starts from (`operator-grant.ts`).
 *
 * A leaf module that imports nothing, so the auth path, the invitation
 * commands and the operator script share it without depending on each other.
 */

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/u;
const BASIC_EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+$/u;

/** Trimmed and lowercased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type EmailAddressCheck =
  { ok: true; email: string } | { ok: false; problem: 'required' | 'invalid' };

/**
 * A typed address, normalized, or why it is unusable: a control character
 * anywhere in it, nothing left after trimming, or not a basic `local@domain`
 * with exactly one `@` and no whitespace.
 */
export function checkEmailAddress(email: string): EmailAddressCheck {
  if (CONTROL_CHARACTER.test(email)) return { ok: false, problem: 'invalid' };
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, problem: 'required' };
  if (!BASIC_EMAIL_ADDRESS.test(normalized)) return { ok: false, problem: 'invalid' };
  return { ok: true, email: normalized };
}
