/**
 * Seeding against native PostgreSQL.
 *
 * `bin/seed.ts` is how a hosted database gets its club and its first admin, and
 * until this suite existed the command refused a `postgres://` URL outright, so
 * there was no way to put either one there. The behaviour is already covered
 * against PGlite in `seed.test.ts`; what these cases prove is that the same
 * calls do the same thing on the other driver — the seeding transaction, the
 * `returning()` reads inside it, and the idempotent second run.
 *
 * Skips itself when no disposable cluster is offered, so public CI without a
 * server still runs the file.
 */

import { describe, expect, it } from 'vitest';
import type { ClubConfig } from './club-config.ts';
import { postgresTracerUrl, withIsolatedPostgres } from './db/testing.ts';
import * as schema from './db/schema.ts';
import { seedAdmin, seedClubConfig } from './seed.ts';

const CLUB = 'Descenders';
const SALEM = 'Salem Composite';
const ADMIN = 'coach@example.org';
const env = { AUTH_ALLOWED_EMAILS: ADMIN };

const plate = (p: string) => ({ plate: p, fromRound: null, toRound: null });
const rider = (key: string, ...plates: ReturnType<typeof plate>[]) => ({ key, plates });

const clubConfig = (): ClubConfig => ({
  club: CLUB,
  season: 2025,
  scoringTeams: [SALEM],
  riders: [rider('rider-a', plate('202')), rider('rider-b', plate('204'))],
  squads: [{ name: 'Descenders', members: ['rider-a', 'rider-b'] }],
});

describe.skipIf(!postgresTracerUrl)('seeding a native PostgreSQL database', () => {
  it('writes the club config in one transaction and reports what it created', async () => {
    await withIsolatedPostgres(async (runtime) => {
      const result = await seedClubConfig(runtime.db, clubConfig());

      expect(result).toMatchObject({
        scoringTeams: 1,
        riders: 2,
        ridersCreated: 2,
        plates: 2,
        squads: 1,
        squadMembers: 2,
      });
      expect(await runtime.db.select().from(schema.rider)).toHaveLength(2);
      expect(await runtime.db.select().from(schema.riderPlate)).toHaveLength(2);
      expect(await runtime.db.select().from(schema.squad)).toHaveLength(1);
    });
  });

  it('re-seeds the same config without creating a second club or duplicate riders', async () => {
    await withIsolatedPostgres(async (runtime) => {
      await seedClubConfig(runtime.db, clubConfig());
      const second = await seedClubConfig(runtime.db, clubConfig());

      expect(second.ridersCreated).toBe(0);
      expect(second.riders).toBe(2);
      expect(await runtime.db.select().from(schema.club)).toHaveLength(1);
      expect(await runtime.db.select().from(schema.rider)).toHaveLength(2);
    });
  });

  it('bootstraps the first admin onto the seeded club, and says so only once', async () => {
    await withIsolatedPostgres(async (runtime) => {
      const config = clubConfig();
      await seedClubConfig(runtime.db, config);

      const created = await seedAdmin(runtime.db, {
        email: ADMIN,
        clubName: config.club,
        env,
        seasonYear: config.season,
      });
      expect(created).toMatchObject({ created: true, email: ADMIN, clubName: CLUB });

      const again = await seedAdmin(runtime.db, {
        email: ADMIN,
        clubName: config.club,
        env,
        seasonYear: config.season,
      });
      expect(again.created).toBe(false);
      expect(await runtime.db.select().from(schema.users)).toHaveLength(1);
      expect(await runtime.db.select().from(schema.clubMembership)).toHaveLength(1);
    });
  });

  it('refuses an address outside the bootstrap allowlist and writes nothing', async () => {
    await withIsolatedPostgres(async (runtime) => {
      const config = clubConfig();
      await seedClubConfig(runtime.db, config);

      await expect(
        seedAdmin(runtime.db, {
          email: 'stranger@example.test',
          clubName: config.club,
          env,
          seasonYear: config.season,
        }),
      ).rejects.toThrow();

      expect(await runtime.db.select().from(schema.users)).toHaveLength(0);
    });
  });
});
