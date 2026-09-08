'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { requireClubContext } from '@/app/club-context.ts';
import { resolveSeasonByYear } from '../query.ts';
import { AccessDenied } from '@/lib/authz/access.ts';
import {
  archiveSquad,
  createSquad,
  renameSquad,
  setPreferredSquad,
  setSquadAccounts,
  setSquadRiders,
  SquadOperationError,
} from '@/lib/club-operations.ts';
import {
  changeClubMembershipRole,
  revokeClubMembership,
  MembershipOperationError,
} from '@/lib/club-membership-operations.ts';
import type { OperationState } from '@/components/OperationsForm.tsx';

function text(data: FormData, key: string): string {
  const value = data.get(key);
  if (typeof value !== 'string') throw new SquadOperationError('Complete the required fields.');
  return value;
}
function positiveId(value: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)
    throw new SquadOperationError('Choose a valid item and try again.');
  return Number(value);
}

export async function saveOperation(
  year: string,
  displayedClubId: number,
  _state: OperationState,
  data: FormData,
): Promise<OperationState> {
  const db = appDb();
  const session = await auth();
  const context = await requireClubContext(db, session?.user?.id);
  if (context.clubId !== displayedClubId)
    return { error: 'Your club selection changed. Reload this page before saving.' };
  const season = await resolveSeasonByYear(db, year);
  if (!season) return { error: 'This season is unavailable.' };
  const actor = { actorId: context.userId, clubId: context.clubId, seasonId: season.id };
  let result: OperationState;
  let archivedId: number | null = null;
  let changedOwnAccess = false;
  let revokedUserId: string | null = null;
  try {
    const operation = text(data, 'operation');
    if (operation === 'create') {
      const squad = await createSquad(db, {
        ...actor,
        seasonId: season.id,
        name: text(data, 'name'),
      });
      result = { message: 'Squad created.', href: `/${season.year}/squad/${squad.slug}` };
    } else if (operation === 'preference') {
      const value = text(data, 'squadId');
      await setPreferredSquad(db, {
        ...actor,
        seasonId: season.id,
        squadId: value ? positiveId(value) : null,
      });
      result = { message: 'Squad preference saved.' };
    } else if (operation === 'member-role') {
      const role = text(data, 'role');
      if (role !== 'member' && role !== 'coach' && role !== 'admin')
        throw new SquadOperationError('Choose a valid club role.');
      const userId = text(data, 'userId');
      await changeClubMembershipRole(db, { ...actor, userId, role });
      changedOwnAccess = userId === actor.actorId && role !== 'admin';
      result = { message: 'Club role saved.' };
    } else if (operation === 'member-revoke') {
      if (data.get('confirm') !== 'yes')
        throw new SquadOperationError('Confirm that you want to revoke access.');
      const userId = text(data, 'userId');
      await revokeClubMembership(db, { ...actor, userId });
      changedOwnAccess = userId === actor.actorId;
      revokedUserId = userId;
      result = { message: 'Club access revoked.' };
    } else {
      const squadId = positiveId(text(data, 'squadId'));
      if (operation === 'rename') {
        await renameSquad(db, { ...actor, squadId, name: text(data, 'name') });
        result = { message: 'Squad name saved. Its address is unchanged.' };
      } else if (operation === 'riders') {
        const riderIds = data.getAll('riderId').map((value) => {
          if (typeof value !== 'string') throw new SquadOperationError('Choose valid riders.');
          return positiveId(value);
        });
        await setSquadRiders(db, { ...actor, squadId, riderIds });
        result = { message: 'Squad roster saved.' };
      } else if (operation === 'accounts') {
        const userIds = data.getAll('userId').map((value) => {
          if (typeof value !== 'string') throw new SquadOperationError('Choose valid accounts.');
          return value;
        });
        await setSquadAccounts(db, { ...actor, squadId, userIds });
        result = { message: 'Account assignments saved.' };
      } else if (operation === 'archive') {
        if (data.get('confirm') !== 'yes')
          throw new SquadOperationError('Confirm that you want to archive this squad.');
        await archiveSquad(db, { ...actor, squadId });
        archivedId = squadId;
        result = { message: 'Squad archived. Its address and roster remain available.' };
      } else throw new SquadOperationError('Choose a supported operation.');
    }
  } catch (error) {
    if (error instanceof MembershipOperationError)
      return {
        error:
          error.message === 'A club must keep one active admin.'
            ? 'Assign another active admin first.'
            : 'This account is no longer an active club member. Reload this page.',
      };
    if (error instanceof SquadOperationError) return { error: error.message };
    if (error instanceof AccessDenied)
      return { error: 'Your access changed. Reload this page to see your current choices.' };
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause?.code === '23505' || cause?.cause?.code === '23505')
      return { error: 'That squad name or address is already reserved. Choose a different name.' };
    return { error: 'The change was not saved. Reload this page and try again.' };
  }
  revalidatePath(`/${season.year}`, 'layout');
  if (changedOwnAccess) redirect('/');
  if (revokedUserId !== null)
    redirect(`/${season.year}/operations?revoked=${encodeURIComponent(revokedUserId)}`);
  if (archivedId !== null) redirect(`/${season.year}/operations?archived=${archivedId}`);
  return result;
}
