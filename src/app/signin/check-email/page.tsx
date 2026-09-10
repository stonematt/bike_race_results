import { AuthStatusPage } from '../AuthStatusPage.tsx';

/** Auth.js sends email sign-ins here through authConfig.pages.verifyRequest. */
export default function CheckEmail() {
  return (
    <AuthStatusPage badge="Email sent" heading="Check your email for a sign-in link.">
      <p className="signin-copy">
        If the address can access Descenders, a link is on its way. It will open your season reports
        when you use it.
      </p>
    </AuthStatusPage>
  );
}
