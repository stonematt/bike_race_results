import { AuthStatusPage } from '../AuthStatusPage.tsx';

/**
 * Auth.js sends email sign-ins here through authConfig.pages.verifyRequest.
 *
 * Reading `searchParams` opts this route out of static prerendering — it builds
 * as `ƒ` rather than `○`. That is the price of keeping the visitor's
 * destination across the detour, and it is a deliberate trade: the page is
 * anonymous and cheap, and the sibling recovery page is already dynamic for the
 * same reason.
 */
export default async function CheckEmail({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <AuthStatusPage
      badge="Email sent"
      heading="Check your email for a sign-in link."
      callbackUrl={callbackUrl}
    >
      <p className="signin-copy">
        If the address can access Descenders, a link is on its way. It will open your season reports
        when you use it.
      </p>
    </AuthStatusPage>
  );
}
