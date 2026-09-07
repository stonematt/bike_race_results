/**
 * The one way a `user` row is looked up or brought into being.
 *
 * next-auth's adapter owns `user`/`account`/`session`/`verificationToken`
 * (`schema.ts`), and this deliberately does not take that ownership away: it
 * writes only the columns the adapter's own `createUser` writes, and leaves
 * `id` to the schema's `crypto.randomUUID()` default. Matching the adapter's
 * shape is what makes this safe across an adapter upgrade — inventing a
 * different one (an extra required column, a second identity index) is what
 * would fight it.
 *
 * Two callers need exactly this, which is why it lives here rather than in
 * either of them:
 *
 *   - `seedAdmin` (`src/lib/seed.ts`), bootstrapping the first coach who can
 *     sign in against an empty database.
 *   - the development sign-in shim (`src/auth.ts`), which a Credentials
 *     provider does not persist through the adapter at all — so without this
 *     it returned the typed address as `user.id` and every query keyed on
 *     `coach.user_id` missed (#107).
 *
 * It sits under `db/` rather than in `seed.ts` so that the auth path does not
 * import the seeding module: `seed.ts` pulls in `club-config.ts`, which reads
 * files off disk, and production auth has no business depending on any of it.
 *
 * The caller normalises the address. Both callers lowercase and trim first, so
 * signing in as `Coach@x` and `coach@x` cannot leave two rows behind — that
 * property lives with them because it is the allowlist's normalisation, not a
 * fact about this table.
 *
 * `user` carries no unique index on email (`schema.ts`), which is why this
 * resolves by query rather than by an `on conflict` target. That leaves the
 * check-then-act open in principle: two simultaneous first sign-ins for the
 * same brand-new address could each miss the select and insert a row. Not
 * worth closing here — the only caller that races is the development shim,
 * behind a loopback bind and one operator — and closing it properly means a
 * unique index on an adapter-owned table, which is a schema decision rather
 * than a detail of this function. Written down so it is a known gap and not a
 * surprise: the casing guarantee above is enforced by the callers, not by the
 * database.
 */

import { eq } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema.ts';

type Db = PgliteDatabase<typeof schema>;
/** The handle drizzle hands a `db.transaction` callback. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Either handle — this is called inside a seeding transaction and outside one. */
export type UserExecutor = Db | Tx;

/** The id of the `user` row for this address, creating the row if it is new. */
export async function findOrCreateUser(
  executor: UserExecutor,
  email: string,
  displayName?: string,
): Promise<string> {
  const existing = await executor.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing[0]) return existing[0].id;
  const [user] = await executor
    .insert(schema.users)
    .values({ email, name: displayName })
    .returning({ id: schema.users.id });
  return user!.id;
}
