import Link from 'next/link';
import { signinHref } from './messages.ts';
import { SigninShell } from './SigninShell.tsx';

type AuthStatusPageProps = {
  badge: string;
  heading: string;
  callbackUrl?: string;
  children: React.ReactNode;
};

/**
 * The confirmation and recovery states Auth.js dispatches to. Both are public
 * and both are reached by someone who is not signed in, so neither may name a
 * recipient, a token or an account: they say what happened in general terms and
 * offer the one way forward, back to the door for a fresh link.
 *
 * That door has to keep the visitor's destination or the way forward is a way
 * somewhere else: someone who arrived at `/signin?callbackUrl=/seasons/2025`
 * and asks for a second link would otherwise be returned to `/`. `signinHref`
 * filters the value — it is attacker-supplied — and encodes it.
 */
export function AuthStatusPage({ badge, heading, callbackUrl, children }: AuthStatusPageProps) {
  return (
    <SigninShell>
      <section className="signin-door signin-status" aria-labelledby="auth-status-heading">
        <p className="signin-badge">{badge}</p>
        <h2 id="auth-status-heading">{heading}</h2>
        {children}
        <Link className="signin-status-action" href={signinHref(callbackUrl)}>
          Request a new sign-in link
        </Link>
      </section>
    </SigninShell>
  );
}
