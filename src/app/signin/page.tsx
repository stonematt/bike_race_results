import { redirect } from 'next/navigation';
import { auth, signIn } from '@/auth.ts';
import { admits, DEV_PROVIDER_ID } from '@/lib/admission.ts';
import { availableProviders } from '@/lib/signin-providers.ts';

/**
 * The one route outside the gate, and the only one. It offers exactly the
 * providers src/auth.ts actually registered: the magic link when a mail server
 * is configured, and the development shim when it is explicitly switched on.
 * Email sign-in is limited server-side to active members and live invitation
 * addresses. This page renders a door, not a key.
 */

/**
 * next-auth reports a failed sign-in by redirecting back here with `?error=`.
 * Every refusal reads the same, whatever caused it: an address without a live
 * membership/invitation and an address that simply failed must not be
 * distinguishable, or this page becomes a membership-discovery surface.
 *
 * It is not a complete answer — a successful magic-link send still looks
 * different from a refusal. Closing that gap is a render-layer decision and
 * belongs to issue #9, not here.
 */
const REFUSED =
  'That sign-in was refused. Access to this app is by invitation — ask your club admin if you need access.';

const MESSAGES: Record<string, string> = {
  Verification: 'That sign-in link has expired or was already used. Request a new one.',
};

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
  const localArt = process.env.NEXT_PUBLIC_LOCAL_BRAND_ART === '1';

  return (
    <main className={`signin-kit-pop${localArt ? ' has-local-brand-art' : ''}`}>
      <header className="signin-masthead">
        <span>Descenders</span>
        <small>Season reports</small>
      </header>
      <div className="signin-entry">
        <section className="signin-story" aria-labelledby="signin-story-heading">
          <p className="eyebrow">Race day, together</p>
          <h1 id="signin-story-heading">Every result opens a conversation.</h1>
          <p>Who was there? What can we learn? What comes next?</p>
        </section>
        <section className="signin-door" aria-labelledby="signin-heading">
          <p className="signin-badge">Private team access</p>
          <h2 id="signin-heading">Open the season</h2>
          <p className="signin-copy">Use the email connected to your Descenders invitation.</p>

          {error ? (
            <p className="border-danger text-danger mt-6 rounded border-l bg-white px-4 py-3 text-sm">
              {MESSAGES[error] ?? REFUSED}
            </p>
          ) : null}

          {email ? (
            <form
              action={async (formData: FormData) => {
                'use server';
                await signIn('nodemailer', {
                  email: formData.get('email'),
                  redirectTo,
                });
              }}
              className="signin-form"
            >
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
            <form
              action={async (formData: FormData) => {
                'use server';
                await signIn(DEV_PROVIDER_ID, { email: formData.get('email'), redirectTo });
              }}
              className="signin-dev"
            >
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
      </div>
      <section className="signin-milo" aria-labelledby="signin-milo-heading">
        {localArt ? (
          <img
            src="/local-brand/milo-lockup-orange.png"
            alt="Descenders Salem Composite logo featuring Milo"
          />
        ) : null}
        <div>
          <h2 id="signin-milo-heading">MILO rides with us.</h2>
          <p>Make the effort · Include everyone · Learn by trying · Offer encouragement</p>
        </div>
      </section>
    </main>
  );
}
