'use server';

/**
 * The sign-in form posts through a Server Action, which is outside Auth.js's own
 * routing — so `authConfig.pages.error` never sees what happens in here. Left
 * alone, `signIn` throwing `AccessDenied` for an address without a live
 * membership is an unhandled Server Action error: HTTP 500 and a browser error
 * page, for exactly the visitor the refusal copy exists to help.
 *
 * These two wrappers make the trip Auth.js would have made, and nothing more.
 * The recovery target is filtered by `recoveryPath`; `redirectTo` is never a
 * destination chosen here, only a value handed back to Auth.js, which validates
 * it against the trusted origin.
 */

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth.ts';
import { DEV_PROVIDER_ID } from '@/lib/admission.ts';
import { EMAIL_SENT_PATH, recoveryPath } from './messages.ts';

/** Anything Auth.js raised becomes the branded recovery page; the rest rethrows. */
function toRecovery(error: unknown): never {
  if (error instanceof AuthError) redirect(recoveryPath(error.type));
  throw error;
}

/**
 * `redirect: false` keeps the confirmation on its branded path. With Auth.js's
 * own redirect the browser is parked on the internal
 * `/api/auth/verify-request?provider=nodemailer` URL, which renders the branded
 * page but shows the endpoint in the address bar. `EMAIL_SENT_PATH` is a
 * literal, so choosing the destination here introduces no open redirect.
 *
 * This still does not close the membership gap: a refused address lands on the
 * recovery page and an admitted one on the confirmation, so the pair remains an
 * oracle for whether an address has access. That was already true before these
 * pages existed — the refusal threw out of the Server Action and the admitted
 * address reached `/api/auth/verify-request` — and the confirmation copy is
 * hedged ("If the address can access Descenders") against the day it closes.
 * Making the two outcomes identical is a render-layer decision that belongs to
 * issue #9, not here; #159 is scoped to how these states look, and collapsing
 * them would also take the "ask your club admin" guidance away from the person
 * who most needs it. Deliberately left as-is.
 */
export async function requestEmailLink(redirectTo: string, formData: FormData) {
  try {
    await signIn('nodemailer', {
      email: formData.get('email'),
      redirectTo,
      redirect: false,
    });
  } catch (error) {
    toRecovery(error);
  }
  redirect(EMAIL_SENT_PATH);
}

/** The development shim, which refuses for its own reasons and throws alike. */
export async function signInWithDevShim(redirectTo: string, formData: FormData) {
  try {
    await signIn(DEV_PROVIDER_ID, { email: formData.get('email'), redirectTo });
  } catch (error) {
    toRecovery(error);
  }
}
