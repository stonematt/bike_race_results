'use server';

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth.ts';
import { appDb } from '@/app/db.ts';
import { selectClub } from '@/lib/authz/access.ts';

export async function chooseClub(formData: FormData): Promise<void> {
  const value = formData.get('clubId');
  if (typeof value !== 'string' || !/^\d+$/.test(value)) notFound();
  const clubId = Number(value);
  if (!Number.isSafeInteger(clubId)) notFound();

  const session = await auth();
  if (!session?.user?.id) notFound();

  await selectClub(appDb(), session.user.id, clubId);
  // A server-stored preference establishes context. Do not carry a submitted
  // deep link across clubs, where a rider or squad identifier may be foreign.
  redirect('/');
}
