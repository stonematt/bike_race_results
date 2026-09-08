/**
 * Which configured provider established this identity — asked at sign-in and
 * again on every request after it.
 *
 * These started as two functions because the two callbacks know different
 * things: a sign-in is handed the provider that proved the address, while a
 * later request is handed only a decoded token. That difference is real, but it
 * is a provenance difference, not a policy one. This module answers only that
 * provenance question; Node reads active club membership for authorization.
 *
 * So the provider is carried onto the session (see the jwt and session
 * callbacks in src/auth.config.ts) and both callers ask this one function. The
 * bypass condition is written once, below, and cannot diverge again.
 *
 * The shim establishes a local identity, not a club grant. It admits an address nobody proved, which
 * is only defensible because `pnpm dev` binds loopback — the app it admits
 * people to is reachable from nowhere but the machine running it. The two
 * halves land together or not at all; see issue #33.
 *
 * Imports only a pure module so it remains safe in the Edge runtime. It runs
 * from src/auth.config.ts, in Node from src/auth.ts, and under vitest with an
 * injected environment.
 */

import { availableProviders } from './signin-providers.ts';

export type AdmissionEnv = Record<string, string | undefined>;

/**
 * The credentials provider's id, in the one place all three uses read it from:
 * the registration in src/auth.ts, the branch below, and the form on the
 * sign-in page. A typo in any one of them fails silently in a different
 * direction, and the branch below is now load-bearing.
 */
export const DEV_PROVIDER_ID = 'dev';
export const EMAIL_PROVIDER_ID = 'nodemailer';

/**
 * The one bypass. Both conditions are required and neither is redundant: the
 * provider says this session came through the shim, and `availableProviders`
 * says this process actually registered one. The second is what makes the
 * bypass impossible to reach in production — `NODE_ENV=production` turns it off
 * whatever a token claims — so a leaked or reused AUTH_SECRET cannot be replayed
 * into a hosted identity.
 */
function isRegisteredDevProvider(provider: string | undefined, env: AdmissionEnv): boolean {
  return provider === DEV_PROVIDER_ID && availableProviders(env).dev;
}

function isConfiguredEmailProvider(provider: string | undefined, env: AdmissionEnv): boolean {
  return provider === EMAIL_PROVIDER_ID && availableProviders(env).email;
}

/**
 * Does this session carry supported authenticated provenance?
 *
 * Called from two places with the same question and different provenance. At
 * sign-in, `provider` is `account.provider` — next-auth's own account of which
 * provider just proved the address. On every request after that it is the claim
 * this app stamped onto the token at sign-in. Same value, and the bypass above
 * re-checks the environment either way rather than trusting the claim alone.
 *
 * No address means no access. A verified email may authenticate to accept a
 * live invitation, but Node request/action boundaries still require an active
 * database membership before releasing club-private data.
 */
export function admits(
  provider: string | undefined,
  user: { email?: string | null } | null | undefined,
  env: AdmissionEnv = process.env,
): boolean {
  if (!user?.email) return false;
  if (provider === DEV_PROVIDER_ID) return isRegisteredDevProvider(provider, env);
  return isConfiguredEmailProvider(provider, env);
}
