/**
 * The operator grant command (#182).
 *
 * An owner-run, direct grant of a `coach` or `member` Club membership to an
 * email address, outside the app. It is the "separate bootstrap command" the
 * accepted contract allows for operator provisioning, and it is deliberately
 * narrow. Decided in the #181 grill:
 *
 *   - **A script, not a migration.** A migration runs on every database and
 *     would put one production membership into the public migration journal.
 *   - **A direct grant, not an invitation.** An invitation stays the only way
 *     into the app; this is the operator path outside it.
 *   - **`coach` and `member` only.** Admin keeps its own bootstrap
 *     (`pnpm seed --email`) and promotion in the app.
 *   - **An explicit target.** It never loads `.env.local`. A hosted database is
 *     reached only through `--env-file <path>`, whose `DATABASE_URL` wins over
 *     the shell's; a hosted `DATABASE_URL` without one is refused.
 *   - **A dry run by default.** It prints the database, the Club, the email, the
 *     role, the current state and the exact writes it would make.
 *   - **Permission is typed.** `--apply` refuses without an interactive
 *     terminal, and writes only after the operator types the database host.
 *   - **One idempotent transaction.** Find or create the user through
 *     `db/users.ts`, matching the email exactly as a magic-link sign-in will;
 *     insert the membership; write a `membership.granted` audit event with the
 *     user as subject and a null actor, meaning an operator outside the app.
 *
 * What it will not do, and reports instead: reinstate a revoked membership (a
 * separate decision), change the role of an active one (an in-app action with
 * its own `membership.role-changed` audit), pick between two user rows stored
 * under the email (`user.email` carries no unique index), or grant to a row
 * whose stored email differs from it only in case or whitespace (sign-in would
 * not find that row, and what to do with it is not this command's choice).
 *
 * Exit codes: `0` for a dry run, a grant, or nothing to write; `1` for a
 * refusal or a state it leaves alone; `2` for a usage error. Refusals and usage
 * go to stderr; the dry-run report and the success line go to stdout.
 *
 * Everything it touches outside the database — the environment, the env file,
 * the filesystem check, the terminal, the output — is handed in, so
 * `bin/grant-membership.ts` stays a thin entry point and the tests drive the
 * whole command against PGlite.
 */

import { sql } from 'drizzle-orm';
import { parseEnv } from 'node:util';
import { parseClubRole, type AccessDatabase, type ClubRole } from './authz/access.ts';
import type { Database } from './db/index.ts';
import { describeDatabaseLocation, isHostedUrl, resolveDatabaseUrl } from './db/url.ts';
import {
  findOrCreateUser,
  findUserIdsByEmail,
  findUserIdsByNormalizedEmail,
  type UserExecutor,
} from './db/users.ts';
import { checkEmailAddress } from './email-address.ts';

export type GrantableRole = Exclude<ClubRole, 'admin'>;

export type GrantCommandDeps = {
  /** The shell's environment. Never `.env.local`: nothing here loads it. */
  env: Record<string, string | undefined>;
  /** Reads the `--env-file` named on the command line. */
  readFile: (file: string) => string;
  /** Whether a local PGlite directory exists. Opening one that does not creates it. */
  localDatabaseExists: (directory: string) => boolean;
  openDatabase: (url: string) => { db: Database; close: () => Promise<void> };
  terminal: {
    /** Both stdin and stdout are a TTY. */
    interactive: boolean;
    ask: (question: string) => Promise<string>;
  };
  /** stdout: the dry-run report and the success line. */
  print: (line: string) => void;
  /** stderr: refusals and usage. */
  error: (line: string) => void;
};

/** A refusal the operator can put right; printed, never a stack trace. */
class GrantRefused extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'GrantRefused';
    this.exitCode = exitCode;
  }
}

const USAGE =
  'usage: pnpm membership:grant --email <address> --role coach|member ' +
  '[--club <slug>] [--env-file <path>] [--apply]';

/** The in-memory PGlite location `createDatabaseRuntime` accepts; it has no directory. */
const IN_MEMORY_DATABASE = 'memory://';

type GrantArgs = {
  /** Already normalized, exactly as a magic-link sign-in will store it. */
  email: string;
  role: GrantableRole;
  clubSlug?: string;
  envFile?: string;
  apply: boolean;
};

/**
 * The address exactly as a magic-link sign-in will store and look it up.
 *
 * It is normalized once, by the normalizer the sign-in gate and invitations
 * share (`email-address.ts`): trimmed and lowercased. Sign-in then normalizes
 * the typed address again, with @auth/core's `defaultNormalizer`
 * (`lib/actions/signin/send-token.js`, @auth/core 0.41.3 under next-auth
 * 5.0.0-beta.32): NFKC, lowercased, trimmed, a `"` rejected, the domain cut at
 * its first comma. The adapter's `getUserByEmail` then matches that result
 * exactly. An address holding a comma or a quote, or one NFKC would change, is
 * refused, so this normalizer leaves the stored address as it is and the grant
 * lands on the row sign-in finds.
 */
function normalizeEmail(email: string): string {
  const checked = checkEmailAddress(email);
  if (!checked.ok) throw new GrantRefused('--email is not a valid address.', 2);
  const normalized = checked.email;
  if (/[,"]/u.test(normalized) || normalized.normalize('NFKC') !== normalized) {
    throw new GrantRefused(
      '--email holds a comma, a quote or a character Unicode NFKC normalization changes, ' +
        'so sign-in would not look it up as given. Nothing was read or written.',
      2,
    );
  }
  return normalized;
}

function parseArgs(argv: string[]): GrantArgs {
  const values = new Map<string, string>();
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (!['--email', '--role', '--club', '--env-file'].includes(arg)) {
      throw new GrantRefused(`unknown argument ${arg}\n${USAGE}`, 2);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new GrantRefused(`${arg} needs a value\n${USAGE}`, 2);
    }
    values.set(arg.slice(2), value);
    i++;
  }
  const email = values.get('email');
  const role = values.get('role');
  if (email === undefined || role === undefined) throw new GrantRefused(USAGE, 2);
  if (role === 'admin') {
    throw new GrantRefused(
      'admin is not granted by this command. Admin keeps its own bootstrap ' +
        '(pnpm seed --email) and promotion in the app.',
      2,
    );
  }
  if (role !== 'coach' && role !== 'member') {
    throw new GrantRefused(`--role must be coach or member.\n${USAGE}`, 2);
  }
  return {
    email: normalizeEmail(email),
    role,
    clubSlug: values.get('club'),
    envFile: values.get('env-file'),
    apply,
  };
}

/**
 * The database this run targets. With `--env-file`, that file's `DATABASE_URL`
 * and nothing else: it is read without touching `process.env`, and it wins over
 * the shell's. Without one, the shell's `DATABASE_URL` or the local PGlite
 * default — and a hosted URL from the shell is refused, because a variable left
 * exported from some earlier session is exactly how a run lands on production
 * by accident. "Hosted" is `isHostedUrl`'s: any `postgres://` URL.
 */
function resolveTarget(args: GrantArgs, deps: GrantCommandDeps): string {
  if (args.envFile === undefined) {
    const url = resolveDatabaseUrl(deps.env);
    if (isHostedUrl(url)) {
      throw new GrantRefused(
        'DATABASE_URL names a hosted database, and a hosted target is reached only ' +
          'through --env-file <path>. Nothing was read or written.',
      );
    }
    return url;
  }
  let content: string;
  try {
    content = deps.readFile(args.envFile);
  } catch {
    throw new GrantRefused(`cannot read --env-file ${args.envFile}`);
  }
  const url = parseEnv(content).DATABASE_URL;
  if (!url) throw new GrantRefused(`${args.envFile} sets no DATABASE_URL`);
  return url;
}

/**
 * A local PGlite directory must already exist. Opening one that does not
 * (`createDatabaseRuntime`, `db/runtime.ts`) creates and initializes it, and
 * the Club query then fails on an empty schema, so even a dry run would leave
 * a new database behind. An in-memory target has no directory to look for.
 */
function requireLocalDatabase(url: string, deps: GrantCommandDeps): void {
  if (isHostedUrl(url) || url === IN_MEMORY_DATABASE) return;
  if (!deps.localDatabaseExists(url)) {
    throw new GrantRefused(
      `no local database exists at ${url}, and opening it would create one. ` +
        'Create and migrate it with pnpm db:migrate first. Nothing was created.',
    );
  }
}

/**
 * What the operator types to permit `--apply`: the host of a hosted database,
 * or the directory of a local one. Hostnames compare case-insensitively.
 */
function databaseHost(url: string): string {
  if (!isHostedUrl(url)) return url;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    throw new GrantRefused('DATABASE_URL could not be parsed. Nothing was read or written.');
  }
}

type Row = Record<string, unknown>;

type Club = { id: number; name: string; slug: string };

/** The Club named by `--club`, or the only Club when there is exactly one. */
async function selectClub(db: AccessDatabase, slug: string | undefined): Promise<Club> {
  const clubs = (
    (await db.execute(sql`select id, name, slug from club order by slug`)).rows as Row[]
  ).map((row) => ({ id: Number(row.id), name: String(row.name), slug: String(row.slug) }));
  if (slug !== undefined) {
    const club = clubs.find((candidate) => candidate.slug === slug);
    if (!club) throw new GrantRefused(`no Club has the slug ${slug}. Nothing was written.`);
    return club;
  }
  if (clubs.length === 0)
    throw new GrantRefused('the database holds no Club. Nothing was written.');
  if (clubs.length > 1) {
    throw new GrantRefused(
      `the database holds ${clubs.length} Clubs; name one with --club <slug>: ` +
        clubs.map((club) => club.slug).join(', '),
    );
  }
  return clubs[0]!;
}

type GrantState = {
  /** Every user row stored under exactly this email: the rows sign-in finds. */
  userIds: string[];
  /** When none is, the rows stored under it only once trimmed and lowercased. */
  looseUserIds: string[];
  /** The membership in this Club, when exactly one user row matched. */
  membership: { role: ClubRole; revoked: boolean } | undefined;
};

async function readState(db: UserExecutor, clubId: number, email: string): Promise<GrantState> {
  const userIds = await findUserIdsByEmail(db, email);
  const looseUserIds = userIds.length === 0 ? await findUserIdsByNormalizedEmail(db, email) : [];
  if (userIds.length !== 1) return { userIds, looseUserIds, membership: undefined };
  const row = (
    await db.execute(sql`
      select role, revoked_at from club_membership
      where club_id = ${clubId} and user_id = ${userIds[0]}`)
  ).rows[0] as Row | undefined;
  return {
    userIds,
    looseUserIds,
    membership: row && {
      role: parseClubRole(row.role),
      revoked: row.revoked_at !== null && row.revoked_at !== undefined,
    },
  };
}

type Decision =
  | { kind: 'grant' }
  /** Already true: nothing to write, and that is a success. */
  | { kind: 'nothing-to-write'; message: string }
  /** A state this command reports and leaves alone. */
  | { kind: 'left-alone'; message: string };

function decide(club: Club, args: GrantArgs, state: GrantState): Decision {
  if (state.userIds.length > 1) {
    return {
      kind: 'left-alone',
      message:
        `${state.userIds.length} user rows match ${args.email}, and this command will not ` +
        'choose between them. Nothing was written.',
    };
  }
  if (state.userIds.length === 0 && state.looseUserIds.length > 0) {
    const count = state.looseUserIds.length;
    return {
      kind: 'left-alone',
      message:
        `no user row is stored exactly as ${args.email}, but ${count} ` +
        `${count === 1 ? 'row is' : 'rows are'} once trimmed and lowercased ` +
        `(${state.looseUserIds.join(', ')}). A magic-link sign-in matches the stored ` +
        'address exactly and would not find it, and what to do with it is not this ' +
        "command's choice. Nothing was written.",
    };
  }
  const membership = state.membership;
  if (membership === undefined) return { kind: 'grant' };
  if (membership.revoked) {
    return {
      kind: 'left-alone',
      message:
        `the ${membership.role} membership in ${club.name} is revoked. Reinstating it is a ` +
        'separate decision, so it stays revoked. Nothing was written.',
    };
  }
  if (membership.role === args.role) {
    return {
      kind: 'nothing-to-write',
      message: `${args.email} is already an active ${args.role} of ${club.name}: nothing to write.`,
    };
  }
  return {
    kind: 'left-alone',
    message:
      `${args.email} is already an active ${membership.role} of ${club.name}. A role change ` +
      'is made in the app, where it is audited as membership.role-changed. Nothing was written.',
  };
}

function describeUser(state: GrantState): string {
  if (state.userIds.length === 1) return `present (${state.userIds[0]})`;
  if (state.userIds.length > 1) return `${state.userIds.length} rows match`;
  if (state.looseUserIds.length === 0) return 'none';
  return (
    `none stored exactly; ${state.looseUserIds.length} once trimmed and lowercased ` +
    `(${state.looseUserIds.join(', ')})`
  );
}

function describeMembership(state: GrantState): string {
  const membership = state.membership;
  if (membership === undefined) return 'none';
  return `${membership.revoked ? 'revoked' : 'active'} ${membership.role}`;
}

function report(
  deps: GrantCommandDeps,
  location: string,
  club: Club,
  args: GrantArgs,
  state: GrantState,
  decision: Decision,
): void {
  deps.print(`database:   ${location}`);
  deps.print(`club:       ${club.name} (${club.slug})`);
  deps.print(`email:      ${args.email}`);
  deps.print(`role:       ${args.role}`);
  deps.print(`user row:   ${describeUser(state)}`);
  deps.print(`membership: ${describeMembership(state)}`);
  if (decision.kind !== 'grant') {
    deps.print('planned writes: none');
    return;
  }
  deps.print('planned writes, in one transaction:');
  if (state.userIds.length === 0) deps.print(`  insert user (email ${args.email})`);
  deps.print(`  insert club_membership (club ${club.name}, role ${args.role})`);
  deps.print(
    `  insert club_audit_event (action membership.granted, subject ${args.email}, actor null)`,
  );
}

/**
 * The grant itself, in one transaction. The state is read again under a lock
 * on the Club row, so what the dry run reported and what is written cannot
 * drift apart, and two grants in the same Club cannot interleave. If the state
 * changed since the report, the new decision is returned and nothing written.
 */
async function writeGrant(db: Database, club: Club, args: GrantArgs): Promise<Decision> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from club where id = ${club.id} for update`);
    const state = await readState(tx, club.id, args.email);
    const decision = decide(club, args, state);
    if (decision.kind !== 'grant') return decision;

    // At most one row is stored exactly as the email here, and this finds it
    // or creates it the way the auth adapter would, with the schema's id.
    const userId = await findOrCreateUser(tx, args.email);
    await tx.execute(sql`
      insert into club_membership (club_id, user_id, role)
      values (${club.id}, ${userId}, ${args.role})`);
    await tx.execute(sql`
      insert into club_audit_event (club_id, actor_user_id, action, subject_user_id)
      values (${club.id}, null, 'membership.granted', ${userId})`);
    return decision;
  });
}

/** Report a decision that writes nothing, and return its exit code. */
function settle(deps: GrantCommandDeps, decision: Exclude<Decision, { kind: 'grant' }>): number {
  if (decision.kind === 'nothing-to-write') {
    deps.print(decision.message);
    return 0;
  }
  deps.error(`refused: ${decision.message}`);
  return 1;
}

/** Run the command; the returned number is the process exit code. */
export async function runGrantCommand(argv: string[], deps: GrantCommandDeps): Promise<number> {
  try {
    const args = parseArgs(argv);
    const url = resolveTarget(args, deps);
    const location = describeDatabaseLocation(url);
    const host = databaseHost(url);
    // Refused before anything is opened: a script, a pipe or an agent session
    // has no terminal, and the typed host is the owner's permission to write.
    if (args.apply && !deps.terminal.interactive) {
      throw new GrantRefused(
        '--apply needs an interactive terminal, to type the database host. Nothing was written.',
      );
    }
    requireLocalDatabase(url, deps);
    const { db, close } = deps.openDatabase(url);
    try {
      const club = await selectClub(db, args.clubSlug);
      const state = await readState(db, club.id, args.email);
      const decision = decide(club, args, state);
      report(deps, location, club, args, state, decision);
      if (decision.kind !== 'grant') return settle(deps, decision);
      if (!args.apply) {
        deps.print('dry run: nothing was written. Re-run with --apply to write.');
        return 0;
      }

      const typed = await deps.terminal.ask(`Type the database host (${host}) to write: `);
      if (typed.trim().toLowerCase() !== host.toLowerCase()) {
        throw new GrantRefused('the typed host did not match. Nothing was written.');
      }
      const written = await writeGrant(db, club, args);
      if (written.kind !== 'grant') return settle(deps, written);
      deps.print(`granted: ${args.email} is now an active ${args.role} of ${club.name}.`);
      return 0;
    } finally {
      await close();
    }
  } catch (error) {
    if (error instanceof GrantRefused) {
      deps.error(`refused: ${error.message}`);
      return error.exitCode;
    }
    throw error;
  }
}
