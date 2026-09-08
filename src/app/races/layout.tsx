import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { requireClubContext } from '@/app/club-context.ts';

/** The historic race index and Event redirects are club-private reads too. */
export default async function RacesLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  await requireClubContext(appDb(), session?.user?.id);
  return children;
}
