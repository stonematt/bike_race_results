import { AuthStatusPage } from '../AuthStatusPage.tsx';
import { recoveryHeading, signinMessage } from '../messages.ts';

/**
 * Auth.js dispatches every non-`SignInError` failure here through
 * `authConfig.pages.error`: the `AccessDenied` a refused address raises before
 * any mail is sent, the `Verification` a rejected link raises, and a
 * `Configuration` fault. This page is public and its visitor is anonymous, so
 * it says only what the shared copy table allows — no token, no recipient, and
 * one refusal wording for every refused address alike.
 */
export default async function Recover({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AuthStatusPage badge="Try again" heading={recoveryHeading(error)}>
      <p className="signin-copy">{signinMessage(error)}</p>
    </AuthStatusPage>
  );
}
