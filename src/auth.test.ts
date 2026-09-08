/**
 * The wiring, not the policy. src/lib/admission.test.ts proves what `admits`
 * decides; nothing there proves this file asks it the right question.
 *
 * The gap that motivated these: drop `account` from the `signIn` destructure
 * and the shim's branch becomes unreachable — every admission test stays green
 * while the shim admits nobody. Same for the credentials provider quietly
 * regaining an allowlist check. Both are one-token edits to a security gate.
 *
 * The adapter itself is still mocked — it validates its constructor argument
 * and neither it nor which driver backs `createDb()` participates in a
 * callback decision. `createDb()` is not: the dev provider's `authorize` now
 * resolves (or creates) a real `user` row (#107), so this needs a database
 * that can actually hold one. `createTestDb()` gives it a real in-memory
 * Postgres, migrated once and reused for the whole file — the tests that
 * touch it never depend on running against a shared row from an earlier test,
 * since each address they use is its own.
 */

import { eq } from 'drizzle-orm';
import type { Provider } from 'next-auth/providers';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb } from './lib/db/testing.ts';

// The adapter validates its db argument on construction, and neither it nor
// the database participates in a callback decision.
vi.mock('@auth/drizzle-adapter', () => ({ DrizzleAdapter: () => ({}) }));

const testDb = await createTestDb();

vi.mock('./lib/db/index.ts', () => ({
  createDb: () => testDb,
  schema: { users: {}, accounts: {}, sessions: {}, verificationTokens: {} },
}));

const { authOptions, providers } = await import('./auth.ts');
const { DEV_PROVIDER_ID } = await import('./lib/admission.ts');
const schema = await import('./lib/db/schema.ts');

const LISTED = 'coach@example.org';
const STRANGER = 'anyone@example.test';
const MEMBER = 'member@example.test';

/** next-auth types these callbacks loosely; both only read what is named here. */
const signIn = authOptions().callbacks.signIn as (arg: {
  user: { email?: string | null };
  account: { provider?: string } | null;
}) => Promise<boolean>;

const jwt = authOptions().callbacks.jwt as (arg: {
  token: Record<string, unknown>;
  account: { provider?: string } | null;
}) => Record<string, unknown>;

function devEnv() {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('AUTH_DEV_LOGIN', '1');
  vi.stubEnv('AUTH_EMAIL_SERVER', 'smtp://localhost:1025');
  vi.stubEnv('AUTH_ALLOWED_EMAILS', `${LISTED},${MEMBER}`);
}

beforeAll(async () => {
  await testDb.insert(schema.club).values({ id: 900, name: 'Auth Club', slug: 'auth-club' });
  await testDb.insert(schema.users).values({ id: 'active-member', email: MEMBER });
  await testDb.insert(schema.clubMembership).values({
    clubId: 900,
    userId: 'active-member',
    role: 'member',
  });
});

/**
 * The dev shim's own config, dug out of the registered provider.
 *
 * `Credentials(config)` does not return `config`. It returns a fixed skeleton —
 * `{ id: "credentials", name: "Credentials", authorize: () => null, options:
 * config }` — and next-auth merges `options` over that skeleton when it
 * normalises providers at request time. So the `id: DEV_PROVIDER_ID` and the
 * `authorize` written in src/auth.ts live under `.options` here, and looking for
 * `p.id === 'dev'` finds nothing at this layer. The merged id is real: the
 * running app answers on /api/auth/callback/dev.
 */
interface DevShim {
  id?: string;
  authorize: (credentials: Record<string, unknown>) => Promise<unknown>;
}

function findDevShim(): DevShim | undefined {
  const found = providers().find((p: Provider) => {
    const options = (p as { options?: { id?: string } }).options;
    return typeof p === 'object' && options?.id === DEV_PROVIDER_ID;
  });
  return (found as { options?: DevShim } | undefined)?.options;
}

function devProvider(): DevShim {
  const shim = findDevShim();
  if (!shim) throw new Error('the dev provider was not registered');
  return shim;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the signIn callback', () => {
  it('forwards the provider, so the shim branch is actually reachable', async () => {
    devEnv();
    // Cut `account` out of the destructure and this is the assertion that goes
    // red. STRANGER is not on the allowlist, so only the provider can admit it.
    await expect(
      signIn({ user: { email: STRANGER }, account: { provider: DEV_PROVIDER_ID } }),
    ).resolves.toBe(true);
  });

  it('requires an active membership after the Edge allowlist check for email sign-in', async () => {
    devEnv();
    await expect(
      signIn({ user: { email: STRANGER }, account: { provider: 'nodemailer' } }),
    ).resolves.toBe(false);
    await expect(
      signIn({ user: { email: LISTED }, account: { provider: 'nodemailer' } }),
    ).resolves.toBe(false);
    await expect(
      signIn({ user: { email: MEMBER }, account: { provider: 'nodemailer' } }),
    ).resolves.toBe(true);
    await expect(signIn({ user: { email: STRANGER }, account: null })).resolves.toBe(false);
  });
});

describe('the jwt callback', () => {
  it('stamps the provider at sign-in and carries it afterwards', () => {
    // Without the stamp the route gate has nothing to branch on, and the shim's
    // user is evicted on their next request.
    expect(jwt({ token: {}, account: { provider: DEV_PROVIDER_ID } }).provider).toBe(
      DEV_PROVIDER_ID,
    );
    // account is null on every request after the first; the claim must survive.
    expect(jwt({ token: { provider: DEV_PROVIDER_ID }, account: null }).provider).toBe(
      DEV_PROVIDER_ID,
    );
  });
});

describe('the dev credentials provider', () => {
  it('admits an address that is not on the allowlist, with a real user row id', async () => {
    devEnv();
    const result = (await devProvider().authorize({ email: STRANGER })) as {
      id?: string;
      email?: string;
    };
    expect(result).toMatchObject({ email: STRANGER });
    // The whole point of #107: `id` is the `user` row's id, not the address —
    // a Credentials provider does not persist through the adapter, so this is
    // the one chance to make it identity-shaped like a real sign-in.
    expect(result.id).not.toBe(STRANGER);

    const rows = await testDb.select().from(schema.users).where(eq(schema.users.email, STRANGER));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(result.id);
  });

  it('normalises the address, so two casings resolve to one user row', async () => {
    devEnv();
    const first = (await devProvider().authorize({ email: '  Coach2@Example.ORG ' })) as {
      id?: string;
      email?: string;
    };
    const second = (await devProvider().authorize({ email: 'coach2@example.org' })) as {
      id?: string;
      email?: string;
    };

    expect(first.email).toBe('coach2@example.org');
    // Two casings, one id — otherwise sign-in leaves two user rows behind.
    expect(second.id).toBe(first.id);

    const rows = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'coach2@example.org'));
    expect(rows).toHaveLength(1);
  });

  it('refuses an empty or non-string address', async () => {
    devEnv();
    expect(await devProvider().authorize({ email: '   ' })).toBeNull();
    expect(await devProvider().authorize({ email: undefined })).toBeNull();
    expect(await devProvider().authorize({})).toBeNull();
  });

  it('is not registered at all unless both gates are set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_DEV_LOGIN', '1');
    expect(findDevShim()).toBeUndefined();

    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_DEV_LOGIN', '');
    expect(findDevShim()).toBeUndefined();
  });
});
