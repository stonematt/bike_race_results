/**
 * Decode archived payloads into the source-mirroring tables.
 *
 * Runs under Node's native type stripping — `node bin/normalize.ts`, no build
 * step.
 *
 *   node bin/normalize.ts --load-fixtures    archive the local corpus into raw
 *   node bin/normalize.ts                    decode the archive into the tables
 *   node bin/normalize.ts --snapshot         print the drift snapshot as JSON
 *
 * `--load-fixtures` is the offline half of `bin/fetch.ts`: it appends every
 * payload in `fixtures/` to `raw_fetch` without touching the network. The whole
 * 2025 season and the 2026 opener are already on disk (docs/fixtures.md), and
 * the crawl that produced them was deliberately slow out of respect for a
 * volunteer-run nonprofit's timing vendor — **do not re-fetch what is already
 * here.** It hangs off this entry point rather than off `bin/fetch.ts` because
 * it is what normalize reads: fill raw first, then decode.
 *
 * Both halves run against whatever `DATABASE_URL` names — the local PGlite
 * directory, or a hosted PostgreSQL database. That is how results reach a
 * hosted database at all: the archive is filled here, on a laptop, and decoded
 * into the database the app reads. `bin/fetch.ts` stays local-only.
 *
 * Decoding reads `raw_fetch` and nothing else — no network, ever — takes the
 * latest row per `(event_id, list_id)`, and writes one event per transaction.
 * All six published list families decode (issues #23 and #25); a list that is
 * recognized but not written — a duplicate layout, or a season snapshot rather
 * than the season record — is reported with the reason.
 */

import { createDatabaseRuntime } from '../src/lib/db/runtime.ts';
import { describeDatabaseLocation, resolveDatabaseUrl } from '../src/lib/db/url.ts';
import { loadCorpus } from '../src/lib/ingest/corpus.ts';
import { normalize } from '../src/lib/ingest/normalize.ts';
import { buildSnapshot } from '../src/lib/ingest/snapshot.ts';
import { loadEnvLocal } from './env.ts';

loadEnvLocal();

const url = resolveDatabaseUrl();
const location = describeDatabaseLocation(url);

// A hosted run owns a connection pool, so this command cannot end by falling
// off the end of the file: node keeps the process alive on the pool's sockets.
// It also cannot end with `process.exit()` inside the work, because that skips
// the `finally` that closes it. Every path below therefore leaves through the
// bottom of the try, and the exit code is the last thing that happens.
const runtime = createDatabaseRuntime(url);
const db = runtime.db;

try {
  if (process.argv.includes('--load-fixtures')) {
    const loaded = await loadCorpus(db);
    console.log(
      `archived ${loaded.rows} payloads into raw_fetch in ${location}: ` +
        `${loaded.configs} configs and ${loaded.lists} lists across ${loaded.events} events`,
    );
  } else {
    const result = await normalize(db);

    if (process.argv.includes('--snapshot')) {
      console.log(JSON.stringify(buildSnapshot(result.placed), null, 2));
    } else {
      const rows = Object.entries(result.rows)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([table, n]) => `${table} ${n}`)
        .join(', ');

      console.log(
        `decoded ${result.decodedLists} of ${result.lists} lists across ${result.events} events ` +
          `in ${location} (${result.skipped} recognized and not written): ${rows}`,
      );
    }
  }
} finally {
  await runtime.close();
}

process.exit(0);
