/**
 * The operator grant command (#182): an owner-run, direct grant of a `coach` or
 * `member` Club membership, outside the app and outside invitations.
 *
 * Every test drives the command through `runGrantCommand`, the same function
 * `bin/grant-membership.ts` calls, with the environment, the env file, the
 * terminal and the database handed in. The database is always a fresh
 * in-memory PGlite holding synthetic rows. A "hosted" target is only ever a
 * string in a test env file: `openDatabase` hands back the PGlite handle
 * whatever URL it is given, so no test can reach a real server.
 */

import { eq, sql } from 'drizzle-orm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { schema } from './db/index.ts';
import { createTestDb, type TestDatabase } from './db/testing.ts';
import { runGrantCommand, type GrantCommandDeps } from './operator-grant.ts';

const ENV_FILE = '/secure/preview-direct.env';
const HOSTED_URL =
  'postgresql://neondb_owner:s3cret-password@ep-cedar-123.db.example.test/neondb?sslmode=verify-full';
const HOST = 'ep-cedar-123.db.example.test';

async function cedarClub(db: TestDatabase) {
  const [club] = await db
    .insert(schema.club)
    .values({ name: 'Cedar Club', slug: 'cedar' })
    .returning();
  return club!;
}

type Harness = {
  deps: GrantCommandDeps;
  output: () => string;
  opened: string[];
  asked: string[];
};

function harness(
  db: TestDatabase,
  options: {
    env?: Record<string, string | undefined>;
    files?: Record<string, string>;
    interactive?: boolean;
    typed?: string;
  } = {},
): Harness {
  const lines: string[] = [];
  const opened: string[] = [];
  const asked: string[] = [];
  const files = options.files ?? { [ENV_FILE]: `DATABASE_URL=${HOSTED_URL}\n` };
  return {
    opened,
    asked,
    output: () => lines.join('\n'),
    deps: {
      env: options.env ?? {},
      readFile: (file) => {
        const content = files[file];
        if (content === undefined) throw new Error(`ENOENT: ${file}`);
        return content;
      },
      openDatabase: (url) => {
        opened.push(url);
        return { db, close: async () => {} };
      },
      terminal: {
        interactive: options.interactive ?? false,
        ask: async (question) => {
          asked.push(question);
          return options.typed ?? '';
        },
      },
      print: (line) => lines.push(line),
    },
  };
}

async function snapshot(db: TestDatabase) {
  return {
    users: await db.select().from(schema.users),
    memberships: await db.select().from(schema.clubMembership),
    audit: await db.select().from(schema.clubAuditEvent),
  };
}

describe('operator grant: dry run', () => {
  it('prints the target, the Club, the email, the role, the current state and the planned writes, and writes nothing', async () => {
    const db = await createTestDb();
    await cedarClub(db);
    const before = await snapshot(db);
    const h = harness(db);

    const code = await runGrantCommand(
      ['--env-file', ENV_FILE, '--email', 'coach@example.com', '--role', 'coach'],
      h.deps,
    );

    expect(code).toBe(0);
    const out = h.output();
    expect(out).toContain('neondb');
    expect(out).toContain(HOST);
    expect(out).toContain('Cedar Club');
    expect(out).toContain('coach@example.com');
    expect(out).toMatch(/role:\s+coach/);
    expect(out).toMatch(/user row:\s+none/);
    expect(out).toMatch(/membership:\s+none/);
    expect(out).toContain('insert user');
    expect(out).toContain('insert club_membership');
    expect(out).toContain('insert club_audit_event');
    expect(out).toContain('membership.granted');
    expect(out).toMatch(/dry run/i);
    expect(out).not.toContain('s3cret-password');
    expect(await snapshot(db)).toEqual(before);
  });
});

describe('operator grant: target', () => {
  it('refuses a hosted DATABASE_URL from the shell without --env-file, before opening it', async () => {
    const db = await createTestDb();
    await cedarClub(db);
    const h = harness(db, { env: { DATABASE_URL: HOSTED_URL } });

    const code = await runGrantCommand(['--email', 'coach@example.com', '--role', 'coach'], h.deps);

    expect(code).toBe(1);
    expect(h.opened).toEqual([]);
    expect(h.output()).toMatch(/refused:.*--env-file/);
    expect(h.output()).not.toContain('s3cret-password');
  });

  it('without --env-file or DATABASE_URL targets the local PGlite default, not .env.local', async () => {
    const db = await createTestDb();
    await cedarClub(db);
    const h = harness(db, { env: {} });

    const code = await runGrantCommand(['--email', 'coach@example.com', '--role', 'coach'], h.deps);

    expect(code).toBe(0);
    expect(h.opened).toEqual(['./.pglite']);
  });

  it("takes DATABASE_URL from --env-file over the shell's", async () => {
    const db = await createTestDb();
    await cedarClub(db);
    const h = harness(db, { env: { DATABASE_URL: './.pglite-somewhere-else' } });

    await runGrantCommand(
      ['--env-file', ENV_FILE, '--email', 'coach@example.com', '--role', 'coach'],
      h.deps,
    );

    expect(h.opened).toEqual([HOSTED_URL]);
  });

  it('refuses an --env-file that cannot be read or sets no DATABASE_URL', async () => {
    const db = await createTestDb();
    await cedarClub(db);
    const missing = harness(db, { files: {} });
    const empty = harness(db, { files: { [ENV_FILE]: 'AUTH_SECRET=x\n' } });
    const argv = ['--env-file', ENV_FILE, '--email', 'coach@example.com', '--role', 'coach'];

    expect(await runGrantCommand(argv, missing.deps)).toBe(1);
    expect(await runGrantCommand(argv, empty.deps)).toBe(1);
    expect(missing.opened).toEqual([]);
    expect(empty.opened).toEqual([]);
    expect(empty.output()).toMatch(/refused:.*DATABASE_URL/);
  });

  /**
   * Asserted against the source, as `seed.test.ts` does for the entry points
   * that must load `.env.local`: running a bin script is the one thing a test
   * here will not do, because it writes to whatever its target resolves to.
   */
  it('has the bin/ entry point never load .env.local', () => {
    const source = fs.readFileSync(
      path.join(import.meta.dirname, '..', '..', 'bin', 'grant-membership.ts'),
      'utf8',
    );

    expect(source).toMatch(/runGrantCommand/);
    expect(source).not.toMatch(/loadEnvLocal|loadEnvFile|['"]\.\/env\.ts['"]/);
  });
});

describe('operator grant: --apply', () => {
  const applyArgv = [
    '--env-file',
    ENV_FILE,
    '--email',
    ' Coach@Example.com ',
    '--role',
    'coach',
    '--apply',
  ];

  it('refuses without an interactive terminal and writes nothing', async () => {
    const db = await createTestDb();
    await cedarClub(db);
    const before = await snapshot(db);
    const h = harness(db, { interactive: false });

    const code = await runGrantCommand(applyArgv, h.deps);

    expect(code).toBe(1);
    expect(h.asked).toEqual([]);
    expect(h.output()).toMatch(/refused:.*terminal/);
    expect(await snapshot(db)).toEqual(before);
  });

  it('writes nothing when the typed host does not match', async () => {
    const db = await createTestDb();
    await cedarClub(db);
    const before = await snapshot(db);
    const h = harness(db, { interactive: true, typed: 'ep-other-456.db.example.test' });

    const code = await runGrantCommand(applyArgv, h.deps);

    expect(code).toBe(1);
    expect(h.asked).toHaveLength(1);
    expect(h.output()).toMatch(/did not match/);
    expect(await snapshot(db)).toEqual(before);
  });

  it('with the typed host creates the user, the membership and one membership.granted audit row with a null actor', async () => {
    const db = await createTestDb();
    const club = await cedarClub(db);
    const h = harness(db, { interactive: true, typed: HOST });

    const code = await runGrantCommand(applyArgv, h.deps);

    expect(code).toBe(0);
    const { users, memberships, audit } = await snapshot(db);
    expect(users).toHaveLength(1);
    expect(users[0]!.email).toBe('coach@example.com');
    expect(memberships).toEqual([
      expect.objectContaining({
        clubId: club.id,
        userId: users[0]!.id,
        role: 'coach',
        revokedAt: null,
      }),
    ]);
    expect(audit).toEqual([
      expect.objectContaining({
        clubId: club.id,
        actorUserId: null,
        action: 'membership.granted',
        subjectUserId: users[0]!.id,
      }),
    ]);
    expect(h.output()).toMatch(/granted/);
  });

  it('writes the user, the membership and the audit row in one transaction', async () => {
    const db = await createTestDb();
    await cedarClub(db);
    // The last of the three writes cannot land, so none of them may.
    await db.execute(sql`drop table club_audit_event`);
    const h = harness(db, { interactive: true, typed: HOST });

    await expect(runGrantCommand(applyArgv, h.deps)).rejects.toThrow();

    expect(await db.select().from(schema.users)).toEqual([]);
    expect(await db.select().from(schema.clubMembership)).toEqual([]);
  });
});

function grantArgv(
  options: { email?: string; role?: string; club?: string; write?: boolean } = {},
): string[] {
  return [
    '--env-file',
    ENV_FILE,
    '--email',
    options.email ?? 'coach@example.com',
    '--role',
    options.role ?? 'coach',
    ...(options.club === undefined ? [] : ['--club', options.club]),
    ...(options.write === false ? [] : ['--apply']),
  ];
}

describe('operator grant: existing state', () => {
  it('re-running the same grant writes nothing and says so', async () => {
    const db = await createTestDb();
    await cedarClub(db);
    expect(
      await runGrantCommand(grantArgv(), harness(db, { interactive: true, typed: HOST }).deps),
    ).toBe(0);
    const before = await snapshot(db);
    const again = harness(db, { interactive: true, typed: HOST });

    const code = await runGrantCommand(grantArgv(), again.deps);

    expect(code).toBe(0);
    expect(again.asked).toEqual([]);
    expect(again.output()).toMatch(/membership:\s+active coach/);
    expect(again.output()).toMatch(/already an active coach.*nothing to write/i);
    expect(await snapshot(db)).toEqual(before);
  });

  it('reports a revoked membership and leaves it revoked', async () => {
    const db = await createTestDb();
    const club = await cedarClub(db);
    await db.insert(schema.users).values({ id: 'coach-user', email: 'coach@example.com' });
    await db.insert(schema.clubMembership).values({
      clubId: club.id,
      userId: 'coach-user',
      role: 'coach',
      revokedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const before = await snapshot(db);
    const h = harness(db, { interactive: true, typed: HOST });

    const code = await runGrantCommand(grantArgv(), h.deps);

    expect(code).toBe(1);
    expect(h.asked).toEqual([]);
    expect(h.output()).toMatch(/membership:\s+revoked coach/);
    expect(h.output()).toMatch(/revoked.*nothing was written/i);
    expect(await snapshot(db)).toEqual(before);
    const [membership] = await db
      .select()
      .from(schema.clubMembership)
      .where(eq(schema.clubMembership.userId, 'coach-user'));
    expect(membership!.revokedAt).not.toBeNull();
  });

  it('matches an existing user row the way sign-in does, leaving no second user row', async () => {
    const db = await createTestDb();
    const club = await cedarClub(db);
    await db.insert(schema.users).values({ id: 'coach-user', email: ' Coach@Example.COM' });
    const h = harness(db, { interactive: true, typed: HOST });

    const code = await runGrantCommand(grantArgv(), h.deps);

    expect(code).toBe(0);
    expect(h.output()).toMatch(/user row:\s+present/);
    expect(h.output()).not.toContain('insert user');
    const { users, memberships } = await snapshot(db);
    expect(users.map((user) => user.id)).toEqual(['coach-user']);
    expect(memberships).toEqual([
      expect.objectContaining({ clubId: club.id, userId: 'coach-user', role: 'coach' }),
    ]);
  });

  it('reports an active membership with a different role and changes nothing', async () => {
    const db = await createTestDb();
    const club = await cedarClub(db);
    await db.insert(schema.users).values({ id: 'coach-user', email: 'coach@example.com' });
    await db
      .insert(schema.clubMembership)
      .values({ clubId: club.id, userId: 'coach-user', role: 'member' });
    const before = await snapshot(db);
    const h = harness(db, { interactive: true, typed: HOST });

    const code = await runGrantCommand(grantArgv(), h.deps);

    expect(code).toBe(1);
    expect(h.asked).toEqual([]);
    expect(h.output()).toMatch(/already an active member.*in the app/i);
    expect(await snapshot(db)).toEqual(before);
  });

  it('refuses when more than one user row matches the email', async () => {
    const db = await createTestDb();
    await cedarClub(db);
    await db.insert(schema.users).values([
      { id: 'first', email: 'coach@example.com' },
      { id: 'second', email: 'Coach@example.com ' },
    ]);
    const before = await snapshot(db);
    const h = harness(db, { interactive: true, typed: HOST });

    const code = await runGrantCommand(grantArgv(), h.deps);

    expect(code).toBe(1);
    expect(h.asked).toEqual([]);
    expect(h.output()).toMatch(/2 user rows/);
    expect(await snapshot(db)).toEqual(before);
  });
});

describe('operator grant: arguments', () => {
  it('rejects admin as a role, before opening the database', async () => {
    const db = await createTestDb();
    await cedarClub(db);
    const h = harness(db, { interactive: true, typed: HOST });

    const code = await runGrantCommand(grantArgv({ role: 'admin' }), h.deps);

    expect(code).toBe(2);
    expect(h.opened).toEqual([]);
    expect(h.output()).toMatch(/refused:.*admin/);
  });

  it('rejects a malformed email, before opening the database', async () => {
    const db = await createTestDb();
    const h = harness(db);

    expect(await runGrantCommand(grantArgv({ email: 'not-an-address' }), h.deps)).toBe(2);
    expect(await runGrantCommand(grantArgv({ email: 'coach@exam\nple.com' }), h.deps)).toBe(2);
    expect(h.opened).toEqual([]);
  });

  it('grants the member role', async () => {
    const db = await createTestDb();
    await cedarClub(db);
    const h = harness(db, { interactive: true, typed: HOST });

    expect(await runGrantCommand(grantArgv({ role: 'member' }), h.deps)).toBe(0);

    const { memberships } = await snapshot(db);
    expect(memberships).toEqual([expect.objectContaining({ role: 'member' })]);
  });
});

describe('operator grant: Club selection', () => {
  async function twoClubs(db: TestDatabase) {
    const cedar = await cedarClub(db);
    const [alder] = await db
      .insert(schema.club)
      .values({ name: 'Alder Club', slug: 'alder' })
      .returning();
    return { cedar, alder: alder! };
  }

  it('grants in the Club named by --club', async () => {
    const db = await createTestDb();
    const { alder } = await twoClubs(db);
    const h = harness(db, { interactive: true, typed: HOST });

    expect(await runGrantCommand(grantArgv({ club: 'alder' }), h.deps)).toBe(0);

    expect(h.output()).toMatch(/club:\s+Alder Club/);
    const { memberships } = await snapshot(db);
    expect(memberships).toEqual([expect.objectContaining({ clubId: alder.id })]);
  });

  it('refuses without --club when the database holds more than one Club', async () => {
    const db = await createTestDb();
    await twoClubs(db);
    const before = await snapshot(db);
    const h = harness(db, { interactive: true, typed: HOST });

    expect(await runGrantCommand(grantArgv(), h.deps)).toBe(1);

    expect(h.output()).toMatch(/refused:.*--club.*alder.*cedar/);
    expect(await snapshot(db)).toEqual(before);
  });

  it('refuses an unknown --club, and a database with no Club', async () => {
    const empty = await createTestDb();
    const db = await createTestDb();
    await cedarClub(db);

    const unknown = harness(db, { interactive: true, typed: HOST });
    const none = harness(empty, { interactive: true, typed: HOST });

    expect(await runGrantCommand(grantArgv({ club: 'birch' }), unknown.deps)).toBe(1);
    expect(unknown.output()).toMatch(/refused:.*birch/);
    expect(await runGrantCommand(grantArgv(), none.deps)).toBe(1);
    expect(none.output()).toMatch(/refused:.*no Club/);
    expect((await snapshot(db)).memberships).toEqual([]);
  });
});
