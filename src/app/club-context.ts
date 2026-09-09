import { redirect } from 'next/navigation';
import {
  resolveSelectedClub,
  type AccessDatabase,
  type ActiveMembership,
} from '@/lib/authz/access.ts';

/**
 * The Node request boundary for club-private reporting.
 *
 * Middleware can establish a supported authenticated provider at the Edge, but
 * it cannot load PGlite. Every caller of this helper therefore re-reads the
 * active database membership before releasing a club-scoped query. A saved
 * club preference selects among memberships; it never grants one.
 */
export async function requireClubContext(
  db: AccessDatabase,
  userId: string | null | undefined,
): Promise<ActiveMembership> {
  if (!userId) redirect('/signin');

  const selection = await resolveSelectedClub(db, userId);
  if (selection.kind === 'selected') return selection.membership;
  if (selection.kind === 'choose') redirect('/clubs');
  redirect('/access-unavailable');
}
