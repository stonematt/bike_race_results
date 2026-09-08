import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { readActiveMemberships, resolveSelectedClub } from '@/lib/authz/access.ts';
import { chooseClub } from './actions.ts';

/** Authenticated people with several memberships choose context on the server. */
export const dynamic = 'force-dynamic';

export default async function ClubsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) notFound();

  const db = appDb();
  const [memberships, selection] = await Promise.all([
    readActiveMemberships(db, userId),
    resolveSelectedClub(db, userId),
  ]);
  if (memberships.length === 0) notFound();
  if (memberships.length === 1) redirect('/');
  const selectedClubId = selection.kind === 'selected' ? selection.membership.clubId : null;

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <h1 className="font-display text-4xl tracking-wide uppercase">Choose a club</h1>
      <p className="text-muted mt-3 text-sm">
        Select the club whose private reporting you want to open.
      </p>
      <form action={chooseClub} className="mt-6">
        <fieldset>
          <legend className="text-sm font-bold">Club</legend>
          <div className="mt-2 grid gap-2">
            {memberships.map((membership) => (
              <label
                className="border-border bg-surface flex cursor-pointer items-center gap-3 rounded border px-3 py-2"
                key={membership.clubId}
              >
                <input
                  defaultChecked={membership.clubId === selectedClubId}
                  name="clubId"
                  type="radio"
                  value={membership.clubId}
                />
                <span>
                  <span className="font-bold">{membership.clubName}</span>{' '}
                  <span className="text-muted text-sm">· {membership.role}</span>
                  {membership.clubId === selectedClubId ? (
                    <span className="text-muted ml-2 text-sm">Current choice</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          className="bg-navy mt-4 cursor-pointer rounded px-4 py-2 text-sm font-bold text-white"
          type="submit"
        >
          Continue
        </button>
      </form>
    </main>
  );
}
