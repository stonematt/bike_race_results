import { notFound } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { requireClubContext } from '@/app/club-context.ts';
import { loadClubOperations } from '@/lib/club-operations-query.ts';
import { ClubOperations } from '@/components/ClubOperations.tsx';
import { resolveSeasonByYear } from '../query.ts';
import { saveOperation } from './actions.ts';

export const dynamic = 'force-dynamic';
export default async function OperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string }>;
  searchParams: Promise<{ archived?: string; revoked?: string }>;
}) {
  const { season: year } = await params;
  const db = appDb();
  const session = await auth();
  const context = await requireClubContext(db, session?.user?.id);
  const season = await resolveSeasonByYear(db, year);
  if (!season) notFound();
  const model = await loadClubOperations(db, {
    actorId: context.userId,
    clubId: context.clubId,
    seasonId: season.id,
  });
  const { archived, revoked } = await searchParams;
  const archivedSquad = model.squads.find(
    (squad) => squad.archived && String(squad.id) === archived,
  );
  const revokedAccount = model.accounts.find(
    (account) => account.revoked && account.id === revoked,
  );
  const notice = archivedSquad
    ? `${archivedSquad.name} archived. Its address and roster remain available.`
    : revokedAccount
      ? `Access revoked for ${revokedAccount.name || revokedAccount.email}.`
      : undefined;
  return (
    <ClubOperations
      year={season.year}
      clubName={context.clubName}
      model={model}
      action={saveOperation.bind(null, year, context.clubId)}
      notice={notice}
    />
  );
}
