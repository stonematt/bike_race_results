/**
 * Seed a database with the two hand-maintained things it needs: the first
 * admin, and the club's own config. Runs under Node's native type stripping —
 * `node bin/seed.ts`, no build step.
 *
 *   node bin/seed.ts --club-config --email coach@example.org
 *   node bin/seed.ts --club-config --email coach@example.org --name "A Coach"
 *   node bin/seed.ts --club-config
 *   node bin/seed.ts --club-config path/to/club-seed.json
 *
 * `--email` seeds the first coach who can sign in. The address must already be
 * on AUTH_ALLOWED_EMAILS or this refuses: seeding does not bypass the gate. See
 * src/lib/seed.ts for why.
 *
 * Runs against whatever `DATABASE_URL` names — the local PGlite directory, or a
 * hosted PostgreSQL database. Success lines name the database and its host and
 * never the URL, which on a hosted database carries the password.
 *
 * `--club-config` seeds the club, its scoring teams, the roster, the plate
 * mappings, the squads and the coach↔squad assignments from
 * config/club-seed.json, or from the file named after the flag. A rider's
 * display name is the one the league published on their latest result, so run
 * normalize first; a rider with no result yet starts under their config key and
 * is named by the next seed after one arrives. Squad coaches are resolved from
 * the key -> email map named by `--coach-emails`, which defaults to the path
 * outside the working tree that src/lib/club-config.ts documents; with no such
 * file every squad coach key is skipped with a log line.
 *
 * **There is no `--club` to type.** The club's name is whatever the config
 * declares, for the coach and the roster alike — nothing else can put them on
 * two different club rows (#62). `--club` still exists as an assertion: give it
 * a name that disagrees with the config and this refuses rather than seeds.
 *
 * Given both, the club config runs first so the admin lands on the club it
 * created. Safe to re-run — a second pass changes nothing and says so.
 *
 * **That order is load-bearing for `squad_coach` too, not only for club
 * identity.** `seedClubConfig` creates the initial squads, then `seedAdmin`
 * additively links the bootstrap admin to those existing squads. Later seeds
 * preserve managed assignments, but running the admin step first on a fresh
 * database would find no squads to link. Do not swap these two blocks.
 */

import { ClubConfigError, loadClubConfig, loadCoachEmails } from '../src/lib/club-config.ts';
import { createDatabaseRuntime } from '../src/lib/db/runtime.ts';
import { describeDatabaseLocation, resolveDatabaseUrl } from '../src/lib/db/url.ts';
import {
  ClubMismatchError,
  NotAllowlistedError,
  resolveAdminClub,
  seedAdmin,
  seedClubConfig,
  StrandedCoachError,
} from '../src/lib/seed.ts';
import { loadEnvLocal } from './env.ts';

loadEnvLocal();

/** The value following `--<name>`, or undefined when the flag is a bare switch. */
function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = process.argv[i + 1];
  return next === undefined || next.startsWith('--') ? undefined : next;
}

const email = flag('email');
const requestedClub = flag('club');
const displayName = flag('name');
const seedClub = process.argv.includes('--club-config');

if (!seedClub && !email) {
  console.error(
    'usage: node bin/seed.ts [--club-config [file]] [--coach-emails <file>]\n' +
      '       node bin/seed.ts --email <address> [--name <display name>] [--club <name>]',
  );
  process.exit(2);
}

const url = resolveDatabaseUrl();
const location = describeDatabaseLocation(url);

// A hosted run owns a connection pool. `process.exit()` inside the work below
// would skip the `finally` that closes it, and simply falling off the end would
// leave node waiting on its sockets — so every path leaves through the bottom of
// the try, carrying `exitCode`, and the process ends after the pool is closed.
const runtime = createDatabaseRuntime(url);
const db = runtime.db;
let exitCode = 0;

try {
  // Read even for an admin-only run: the config is where the club's name lives,
  // and an admin seeded onto any other name is a coach with an empty app.
  const config = loadClubConfig({ configFile: flag('club-config') });

  if (seedClub) {
    const result = await seedClubConfig(db, config, {
      coachEmails: loadCoachEmails(flag('coach-emails')),
    });
    console.log(
      `seeded ${config.club} for ${config.season} in ${location}: ` +
        `${result.scoringTeams} scoring teams, ${result.riders} riders ` +
        `(${result.ridersCreated} new, ${result.ridersRenamed} renamed from results), ` +
        `${result.plates} plate mappings, ` +
        `${result.squads} squads, ${result.squadMembers} squad members, ` +
        `${result.squadCoaches} squad coaches`,
    );
  }

  if (email) {
    const clubName = resolveAdminClub(config, requestedClub);
    // seasonYear links this coach to every squad of their club in the config's
    // season, so a fresh single-squad database has its one coach on its one
    // squad after this run, with no separate coach-emails entry required (#108).
    const result = await seedAdmin(db, { email, clubName, displayName, seasonYear: config.season });

    if (result.created) {
      console.log(
        `seeded ${result.email} as "${result.displayName}" on ${result.clubName} in ${location}`,
      );
    } else if (result.requestedClubName) {
      // The bug this replaced printed "nothing to do" naming the club it had
      // just upserted, so the recovery re-run reported a success that had not
      // happened. Say what the database holds, and that it is wrong.
      console.error(
        `refused: ${result.email} is already seeded, and the coach is on ${result.clubName} — ` +
          `not ${result.requestedClubName}, which is what this run asked for. Nothing was changed.\n` +
          `  The roster seeds onto ${config.club}, so a coach on any other club sees an empty app. ` +
          `Move the coach row onto ${result.requestedClubName}, or seed a fresh database.`,
      );
      exitCode = 1;
    } else {
      console.log(
        `${result.email} is already seeded on ${result.clubName} in ${location} — nothing to do`,
      );
    }
  }
} catch (error) {
  // Everything the operator can put right themselves: say what is wrong and
  // stop, rather than showing them a stack trace for their own typo.
  const refusals = [NotAllowlistedError, ClubConfigError, ClubMismatchError, StrandedCoachError];
  if (refusals.some((refusal) => error instanceof refusal)) {
    console.error(`refused: ${(error as Error).message}`);
    exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await runtime.close();
}

process.exit(exitCode);
