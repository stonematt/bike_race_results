/**
 * Grant a `coach` or `member` Club membership to an email address — the
 * owner-run operator path outside the app (#182). Runs under Node's native type
 * stripping, no build step.
 *
 *   pnpm membership:grant --email coach@example.com --role coach
 *   pnpm membership:grant --env-file <path> --email coach@example.com --role coach
 *   pnpm membership:grant --env-file <path> --email coach@example.com --role coach --apply
 *
 * A dry run unless `--apply` is given, and `--apply` asks for the database host
 * to be typed at an interactive terminal before it writes anything.
 *
 * **This entry point deliberately does not load `.env.local`**, unlike every
 * other script in `bin/`. The only way to reach a hosted database is an
 * explicit `--env-file <path>`; see `src/lib/operator-grant.ts` for the whole
 * contract and `docs/delivery/publish-runbook.md` for the owner step.
 */

import * as fs from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { createDatabaseRuntime } from '../src/lib/db/runtime.ts';
import { runGrantCommand } from '../src/lib/operator-grant.ts';

// Every path leaves through the bottom, after the pool is closed, so a hosted
// run never hangs on its sockets and never skips the close.
const exitCode = await runGrantCommand(process.argv.slice(2), {
  env: process.env,
  readFile: (file) => fs.readFileSync(file, 'utf8'),
  openDatabase: (url) => {
    const runtime = createDatabaseRuntime(url);
    return { db: runtime.db, close: () => runtime.close() };
  },
  terminal: {
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    ask: async (question) => {
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await prompt.question(question);
      } finally {
        prompt.close();
      }
    },
  },
  print: (line) => console.log(line),
});

process.exit(exitCode);
