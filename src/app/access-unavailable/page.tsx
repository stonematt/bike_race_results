import { redirect } from 'next/navigation';
import { auth } from '@/auth.ts';
import { Banner } from '@/components/Banner.tsx';
import { SignOutButton } from '@/components/SignOutButton.tsx';

/** Authenticated identities without active membership receive no club context. */
export const dynamic = 'force-dynamic';

export default async function AccessUnavailablePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');

  return (
    <>
      <Banner>
        <SignOutButton />
      </Banner>
      <main className="mx-auto max-w-xl px-6 py-10">
        <h1 className="font-display text-4xl tracking-wide uppercase">Access unavailable</h1>
        <p className="text-muted mt-3 text-sm">
          This account does not have an active club membership. Ask a club admin if you need access.
        </p>
      </main>
    </>
  );
}
