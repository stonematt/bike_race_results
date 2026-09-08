/**
 * Edge-safe auth config. Middleware runs in the Edge runtime and cannot import
 * the database (PGlite is a WASM Node module), so the adapter and providers
 * live in src/auth.ts and only this half is shared with middleware.
 *
 * src/lib/admission.ts is pure — it reads process.env and nothing else — so it
 * is safe to pull into the Edge bundle, and that is what lets the gate run on
 * every request instead of only at sign-in.
 */

import type { NextAuthConfig } from 'next-auth';
import { admits } from './lib/admission.ts';

declare module 'next-auth' {
  interface Session {
    /**
     * Which provider established this session. The route gate needs it and a
     * decoded token is all it gets — see the jwt and session callbacks below.
     */
    provider?: string;
  }
}

export const authConfig = {
  pages: { signIn: '/signin' },
  session: { strategy: 'jwt' },
  callbacks: {
    /**
     * Stamp the provider at sign-in. `account` is only populated on the request
     * that establishes the session, so this is the one chance to record how
     * someone got in; every later call just carries the claim forward.
     *
     * The claim is not trusted on its own. src/lib/admission.ts re-reads the
     * environment before honouring it, so a token minted by a development shim
     * is inert against a deployment that registers no shim.
     */
    jwt({ token, account }) {
      if (account) token.provider = account.provider;
      return token;
    },

    /**
     * Carry the claim onto the session, which is all `authorized` below sees.
     *
     * Narrowed rather than cast. A JWT's own fields are `unknown` — the token
     * is decoded from whatever was in the cookie, so this is the boundary
     * between a claim and a value, and a cast would paper over exactly the case
     * that matters: a token carrying something other than a provider string.
     */
    session({ session, token }) {
      session.provider = typeof token.provider === 'string' ? token.provider : undefined;

      // `token.sub` is the id the provider's `authorize` returned at sign-in.
      // Under the jwt strategy NextAuth does not carry it onto the session on
      // its own — that is adapter-session behaviour — so without this line
      // `session.user.id` is undefined on every request, and every query keyed
      // on a coach silently receives null. `resolveClub` hid it behind its
      // single-club fallback; `resolveDefaultSquad` did not, and the wall went
      // blank against a fully seeded club.
      if (session.user && typeof token.sub === 'string') session.user.id = token.sub;

      return session;
    },

    /**
     * Every route is behind auth, including aggregate views — stricter than the
     * original privacy review, and decided in issue #7. There is no public half
     * of this app to carve out.
     *
     * This re-checks provider provenance on every request rather than trusting
     * the token. The development claim remains inert in production because the
     * registered-provider check re-reads the environment. Edge cannot load
     * PGlite, so active club membership and next-request revocation are checked
     * by the Node request/action boundary in `src/app/club-context.ts`.
     */
    authorized({ auth }) {
      return admits(auth?.provider, auth?.user);
    },
  },
  providers: [],
} satisfies NextAuthConfig;
