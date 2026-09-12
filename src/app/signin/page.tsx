import { redirect } from 'next/navigation';
import { auth } from '@/auth.ts';
import { admits } from '@/lib/admission.ts';
import { availableProviders } from '@/lib/signin-providers.ts';
import { requestEmailLink, signInWithDevShim } from './actions.ts';
import { signinMessage } from './messages.ts';
import { SigninShell } from './SigninShell.tsx';

/**
 * The one route outside the gate, and the only one. It offers exactly the
 * providers src/auth.ts actually registered: the magic link when a mail server
 * is configured, and the development shim when it is explicitly switched on.
 * Email sign-in is limited server-side to active members and live invitation
 * addresses. This page renders a door, not a key.
 *
 * next-auth still redirects its `SignInError` kinds back here with `?error=`.
 * The rest — a refused address, a rejected link — now land on `/signin/recover`
 * instead, and both surfaces share one copy table so they cannot say different
 * things about the same code.
 */
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  /**
   * Middleware lets this route through, so this page is the only thing that can
   * route an already authenticated visitor onward — without this, someone with
   * a live session who arrives here is offered a second magic link and no way
   * through (issue #158). The root owns membership and season resolution, so it
   * is the one destination; `callbackUrl` is next-auth's parameter for where to
   * land *after* a sign-in and is deliberately not honoured here, where no
   * sign-in is happening and it would be an attacker-supplied redirect target.
   *
   * Both halves of the condition are load-bearing. `admits` keeps a retained
   * development claim inert against a deployment that registers no shim, and
   * the id check keeps the one session shape the root sends straight back —
   * `requireClubContext` redirects to `/signin` without a user id — from
   * bouncing between the two routes.
   */
  const session = await auth();
  if (admits(session?.provider, session?.user) && session?.user?.id) redirect('/');

  const { error, callbackUrl } = await searchParams;
  const redirectTo = callbackUrl ?? '/';
  const { email, dev } = availableProviders();

  return (
    <SigninShell>
      <section className="signin-door" aria-labelledby="signin-heading">
        <p className="signin-badge">Private team access</p>
        <h2 id="signin-heading">Open the season</h2>
        <p className="signin-copy">Use the email connected to your Descenders invitation.</p>

        {error ? (
          <p className="border-danger text-danger mt-6 rounded border-l bg-white px-4 py-3 text-sm">
            {signinMessage(error)}
          </p>
        ) : null}

        {email ? (
          <form action={requestEmailLink.bind(null, redirectTo)} className="signin-form">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="signin-input"
            />
            <button type="submit" className="signin-submit">
              Email me a link
            </button>
          </form>
        ) : null}

        {dev ? (
          <form action={signInWithDevShim.bind(null, redirectTo)} className="signin-dev">
            <label htmlFor="dev-email">Development sign-in</label>
            <p className="text-muted mt-1 text-xs">
              Local development identity only. Active club membership is still required to open
              reporting.
            </p>
            <input id="dev-email" name="email" type="email" required className="signin-input" />
            <button type="submit" className="signin-dev-submit">
              Sign in
            </button>
          </form>
        ) : null}

        {!email && !dev ? (
          <p className="signin-unavailable">
            No sign-in method is configured. Set <code>AUTH_EMAIL_SERVER</code>, or{' '}
            <code>AUTH_DEV_LOGIN=1</code> in development. See <code>.env.example</code>.
          </p>
        ) : null}
      </section>
    </SigninShell>
  );
}
