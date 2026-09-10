/**
 * Local controller for authenticated UAT with the private, already-archived
 * RaceResult corpus. It deliberately has no network operation and never
 * serializes rider records: the browser is the only view of private content.
 *
 *   pnpm serverctl up --email coach@example.org
 *   pnpm serverctl prepare --email coach@example.org
 *   pnpm serverctl status
 *   pnpm serverctl down
 */

import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defaultRiderNamesPath } from '../src/lib/club-config.ts';
import { corpusRoot, hasCorpus } from '../src/lib/fixtures.ts';
import { loadEnvLocal, repoRoot } from './env.ts';

const DATABASE_URL = './.pglite-real-uat';
const STATE_DIR = join(repoRoot, '.serverctl');
const PID_FILE = join(STATE_DIR, 'real-uat.json');
const LOCK_FILE = join(STATE_DIR, 'real-uat.lock');
const LOG_FILE = join(STATE_DIR, 'real-uat.log');
const ARCHIVED_CORPUS = join(homedir(), '.local', 'share', 'bike_race_results', 'fixtures');

type Command = 'up' | 'prepare' | 'status' | 'down';
type ServerState = { pid: number; port: number; startedAt: string };

function usage(exitCode = 0): never {
  const out = exitCode === 0 ? console.log : console.error;
  out(
    'usage: pnpm serverctl <up|prepare|status|down> [--email <address>] [--port <port>]\n' +
      '  up       prepare the local real-data database, then start a loopback dev server\n' +
      '  prepare  migrate, seed the verified club roster, and decode archived 2025/2026 fixtures\n' +
      '  status   report whether this controller owns a running server\n' +
      '  down     stop only the server recorded by this controller',
  );
  process.exit(exitCode);
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    console.error(`refused: --${name} needs a value`);
    process.exit(2);
  }
  return value;
}

function command(): Command {
  const value = process.argv[2];
  if (value === 'up' || value === 'prepare' || value === 'status' || value === 'down') return value;
  usage(2);
}

function port(): number {
  const value = flag('port') ?? '3000';
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    console.error('refused: --port must be an integer from 1024 through 65535');
    process.exit(2);
  }
  return parsed;
}

function readState(): ServerState | undefined {
  if (!existsSync(PID_FILE)) return undefined;
  try {
    const value = JSON.parse(readFileSync(PID_FILE, 'utf8')) as Partial<ServerState>;
    if (
      typeof value.pid !== 'number' ||
      typeof value.port !== 'number' ||
      typeof value.startedAt !== 'string'
    )
      throw new Error('invalid');
    return { pid: value.pid, port: value.port, startedAt: value.startedAt };
  } catch {
    console.error(`refused: ${PID_FILE} is invalid; inspect it before removing it.`);
    process.exit(1);
  }
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function recordedServer(): ServerState | undefined {
  const state = readState();
  if (state === undefined) return undefined;
  if (processIsRunning(state.pid)) return state;
  rmSync(PID_FILE);
  return undefined;
}

// The start time pairs with the pid as the process identity: a pid alone can be
// reused by an unrelated process after the recorded server exits.
function processStartTime(pid: number): string {
  const inspected = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' });
  return inspected.status === 0 ? inspected.stdout.trim() : '';
}

function assertRecordedNextServer(state: ServerState): void {
  const inspected = spawnSync('ps', ['-p', String(state.pid), '-o', 'command='], {
    encoding: 'utf8',
  });
  const commandLine = inspected.status === 0 ? inspected.stdout : '';
  const expected = [
    join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next'),
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(state.port),
  ];
  if (!expected.every((part) => commandLine.includes(part))) {
    console.error(
      `refused: pid ${state.pid} is not a Next development server; leaving it and ${PID_FILE} untouched.`,
    );
    process.exit(1);
  }
  if (processStartTime(state.pid) !== state.startedAt) {
    console.error(
      `refused: pid ${state.pid} does not match the recorded start time, so the pid was reused; leaving it and ${PID_FILE} untouched.`,
    );
    process.exit(1);
  }
}

function withControllerLock(action: () => void): void {
  mkdirSync(STATE_DIR, { recursive: true });
  let descriptor: number;
  try {
    descriptor = openSync(LOCK_FILE, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      console.error('refused: another serverctl setup or start is already in progress.');
      process.exit(1);
    }
    throw error;
  }
  const release = () => {
    closeSync(descriptor);
    unlinkSync(LOCK_FILE);
  };
  process.once('exit', release);
  try {
    action();
  } finally {
    process.removeListener('exit', release);
    release();
  }
}

function ensurePrivateCorpus(): void {
  if (hasCorpus()) return;
  const archiveHasBothSeasons = ['2025', '2026'].every((season) =>
    existsSync(join(ARCHIVED_CORPUS, season)),
  );
  if (!archiveHasBothSeasons) {
    console.error(
      `refused: the private 2025/2026 fixture corpus is absent. Restore it at ${ARCHIVED_CORPUS} ` +
        'from an existing local checkout; do not run the live fetch command.',
    );
    process.exit(1);
  }

  // A link avoids a second copy but needs an index exclusion because git treats
  // a symlink as a file, not as the ignored fixtures/ directory.
  const exclusion = join(repoRoot, '.git', 'info', 'exclude');
  const current = existsSync(exclusion) ? readFileSync(exclusion, 'utf8') : '';
  if (!current.split(/\r?\n/).includes('fixtures')) {
    writeFileSync(
      exclusion,
      `${current}${current.endsWith('\n') || current === '' ? '' : '\n'}fixtures\n`,
    );
  }
  symlinkSync(ARCHIVED_CORPUS, corpusRoot());
}

function requirePreparation(email: string): void {
  loadEnvLocal();
  const allowed = (process.env.AUTH_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
  if (!process.env.AUTH_SECRET) {
    console.error('refused: AUTH_SECRET must be set in .env.local for authenticated UAT.');
    process.exit(1);
  }
  if (!allowed.includes(email.toLowerCase())) {
    console.error('refused: the requested local sign-in address is not in AUTH_ALLOWED_EMAILS.');
    process.exit(1);
  }
  if (!existsSync(defaultRiderNamesPath)) {
    console.error(
      `refused: no private rider-name map at ${defaultRiderNamesPath}; named-athlete UAT must not fall back to pseudonyms.`,
    );
    process.exit(1);
  }
  ensurePrivateCorpus();
}

function runBin(file: string, args: string[]): void {
  const result = spawnSync(process.execPath, [join(repoRoot, 'bin', file), ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL,
      AUTH_DEV_LOGIN: '1',
    },
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function prepare(email: string): void {
  if (recordedServer() !== undefined) {
    console.error('refused: stop the controller-owned server before writing its PGlite directory.');
    process.exit(1);
  }
  requirePreparation(email);
  runBin('migrate.ts', []);
  runBin('seed.ts', ['--club-config', '--email', email]);
  runBin('normalize.ts', ['--load-fixtures']);
  runBin('normalize.ts', []);
  console.log('real-data UAT database is ready: archived 2025 and 2026 fixtures are local-only.');
}

function start(email: string, requestedPort: number): void {
  if (recordedServer() !== undefined) {
    console.error(
      'refused: a controller-owned server is already running; use status or down first.',
    );
    process.exit(1);
  }
  prepare(email);
  mkdirSync(STATE_DIR, { recursive: true });
  const output = openSync(LOG_FILE, 'a');
  const child = spawn(
    process.execPath,
    [
      join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next'),
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(requestedPort),
    ],
    {
      cwd: repoRoot,
      detached: true,
      stdio: ['ignore', output, output],
      env: {
        ...process.env,
        DATABASE_URL,
        AUTH_DEV_LOGIN: '1',
        AUTH_URL: `http://localhost:${requestedPort}`,
      },
    },
  );
  child.unref();
  const startedAt = child.pid === undefined ? '' : processStartTime(child.pid);
  if (child.pid === undefined || startedAt === '') {
    // Without a recorded identity `down` could never stop this server, so stop it now.
    if (child.pid !== undefined) {
      try {
        process.kill(child.pid, 'SIGTERM');
      } catch {
        // Already exited.
      }
    }
    console.error(`refused: the local server exited or could not be identified; see ${LOG_FILE}.`);
    process.exit(1);
  }
  writeFileSync(
    PID_FILE,
    JSON.stringify({ pid: child.pid, port: requestedPort, startedAt }) + '\n',
  );
  console.log(
    `UAT server started at http://localhost:${requestedPort}/2025 — sign in locally as ${email}.`,
  );
}

const selected = command();
if (selected === 'status') {
  const state = recordedServer();
  if (state === undefined) console.log('serverctl: stopped');
  else console.log(`serverctl: running at http://localhost:${state.port} (pid ${state.pid})`);
} else if (selected === 'down') {
  const state = recordedServer();
  if (state === undefined) console.log('serverctl: already stopped');
  else {
    assertRecordedNextServer(state);
    process.kill(state.pid, 'SIGTERM');
    rmSync(PID_FILE);
    console.log('serverctl: stop requested');
  }
} else {
  const email = flag('email');
  if (!email) {
    console.error('refused: --email is required so the named UAT account is explicit.');
    process.exit(2);
  }
  if (selected === 'prepare') withControllerLock(() => prepare(email));
  else withControllerLock(() => start(email, port()));
}
