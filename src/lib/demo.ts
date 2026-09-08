/**
 * Safe, repeatable local data for a demonstration installation.
 *
 * This deliberately does not read config files, fixture files, or a names map.
 * Its entire dataset lives below as public-safe pseudonyms, so `pnpm demo`
 * cannot accidentally load local athlete data from another setup.
 */

import { sql } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './db/schema.ts';

type Db = PgliteDatabase<typeof schema>;

export const DEMO_DATABASE_URL = './.pglite-demo';
export const DEMO_COACH_EMAIL = 'demo.coach@example.test';

const DEMO_CLUB = 'Demo Descenders';
const DEMO_CLUB_SLUG = 'demo-descenders';
const DEMO_SCORING_TEAM = 'Demo Composite';
const DEMO_EVENTS = ['demo-2025-checkpoint', 'demo-2026-round-1'] as const;

export class UnsafeDemoDatabaseError extends Error {
  constructor() {
    super(
      'Refusing to seed a populated database that is not the known synthetic demo. ' +
        'Choose a new empty local PGlite directory with DATABASE_URL. Existing data was not changed.',
    );
    this.name = 'UnsafeDemoDatabaseError';
  }
}

export type DemoBootstrapResult =
  | { status: 'created'; coachEmail: typeof DEMO_COACH_EMAIL; userId: string }
  | { status: 'already-seeded'; coachEmail: typeof DEMO_COACH_EMAIL; userId: string };

type Row = Record<string, unknown>;

const rowsOf = (result: { rows: unknown[] }): Row[] => result.rows as Row[];
const numberOf = (row: Row, key: string): number => Number(row[key]);

/**
 * The demo accepts a local PGlite path from DATABASE_URL, while keeping its
 * default away from the application's ordinary local installation.
 */
export function resolveDemoDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.DATABASE_URL;
  if (configured === undefined) return DEMO_DATABASE_URL;
  if (!configured.trim())
    throw new Error('DATABASE_URL for pnpm demo must name a local PGlite directory.');
  if (configured.startsWith('postgres://') || configured.startsWith('postgresql://')) {
    throw new Error('pnpm demo only supports a local PGlite directory.');
  }
  return configured;
}

/**
 * Add the synthetic demo only to a fresh database. A recognized prior run is
 * a no-op; every other populated database is refused before any write.
 */
export async function bootstrapSafeDemo(db: Db): Promise<DemoBootstrapResult> {
  const knownUserId = await knownDemoUserId(db);
  if (knownUserId !== null) {
    return { status: 'already-seeded', coachEmail: DEMO_COACH_EMAIL, userId: knownUserId };
  }
  if (await hasApplicationData(db)) throw new UnsafeDemoDatabaseError();

  const userId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.season).values([
      { id: 1, year: 2025 },
      { id: 2, year: 2026 },
    ]);
    await tx.insert(schema.round).values([
      { id: 1, seasonId: 1, ordinal: 2, name: 'Checkpoint Race 2' },
      { id: 2, seasonId: 2, ordinal: 1, name: 'Race 1' },
    ]);
    await tx.insert(schema.event).values([
      {
        id: 1,
        roundId: 1,
        sourceEventId: DEMO_EVENTS[0],
        conference: 'North',
        name: 'Demo Checkpoint — Race 2',
        date: '2025-09-14',
      },
      {
        id: 2,
        roundId: 2,
        sourceEventId: DEMO_EVENTS[1],
        conference: 'North',
        name: 'Demo Race 1 — Old Oak',
        date: '2026-08-30',
      },
    ]);
    await tx.insert(schema.club).values({ id: 1, name: DEMO_CLUB, slug: DEMO_CLUB_SLUG });
    await tx.insert(schema.clubScoringTeam).values([
      { clubId: 1, seasonId: 1, scoringTeam: DEMO_SCORING_TEAM },
      { clubId: 1, seasonId: 2, scoringTeam: DEMO_SCORING_TEAM },
    ]);
    await tx
      .insert(schema.users)
      .values({ id: userId, email: DEMO_COACH_EMAIL, name: 'Demo Coach' });
    await tx.insert(schema.coach).values({ userId, clubId: 1, displayName: 'Demo Coach' });
    await tx.insert(schema.rider).values([
      { id: 1, displayName: '«RIDER-A»' },
      { id: 2, displayName: '«RIDER-B»' },
      { id: 3, displayName: '«RIDER-C»' },
      { id: 4, displayName: '«RIDER-D»' },
      { id: 5, displayName: '«RIDER-E»' },
    ]);
    await tx
      .insert(schema.clubMember)
      .values(
        [1, 2].flatMap((seasonId) =>
          [1, 2, 3, 4, 5].map((riderId) => ({ clubId: 1, seasonId, riderId })),
        ),
      );
    await tx.insert(schema.riderPlate).values(
      [1, 2].flatMap((seasonId) =>
        [1, 2, 3, 4, 5].map((riderId) => ({
          riderId,
          seasonId,
          plate: `D${riderId}`,
        })),
      ),
    );
    await tx.insert(schema.squad).values([
      { id: 1, clubId: 1, seasonId: 1, name: 'Cedar', slug: 'cedar' },
      { id: 2, clubId: 1, seasonId: 2, name: 'Cedar', slug: 'cedar' },
      { id: 3, clubId: 1, seasonId: 2, name: 'Summit', slug: 'summit' },
    ]);
    await tx.insert(schema.squadCoach).values([
      { squadId: 1, userId },
      { squadId: 2, userId },
      { squadId: 3, userId },
    ]);
    await tx.insert(schema.squadMember).values([
      { squadId: 1, riderId: 1 },
      { squadId: 1, riderId: 2 },
      { squadId: 1, riderId: 3 },
      { squadId: 1, riderId: 4 },
      { squadId: 1, riderId: 5 },
      { squadId: 2, riderId: 1 },
      { squadId: 2, riderId: 2 },
      { squadId: 3, riderId: 3 },
      { squadId: 3, riderId: 4 },
      { squadId: 3, riderId: 5 },
    ]);
    await tx.insert(schema.individualResult).values(
      [1, 2].flatMap((eventId) =>
        [1, 2, 3, 4, 5].map((riderId) => ({
          eventId,
          plate: `D${riderId}`,
          displayName: `«RIDER-${String.fromCharCode(64 + riderId)}»`,
          scoringTeam: DEMO_SCORING_TEAM,
          categoryRaw: 'HS2 Open - North',
          categoryLevel: 'HS2 Open',
          categoryGradeBand: 'HS2',
          categoryGender: 'Open',
          conference: 'North',
          place: String(riderId),
          status: 'finished',
          timeRaw: `0:4${riderId}:00.00`,
          timeSeconds: String(2400 + riderId * 60),
          points: 500 - riderId * 10,
          laps: 3,
          lap1: '13:20.00',
          lap2: '13:20.00',
          lap3: '13:20.00',
        })),
      ),
    );
  });

  return { status: 'created', coachEmail: DEMO_COACH_EMAIL, userId };
}

async function knownDemoUserId(db: Db): Promise<string | null> {
  const result = await db.execute(sql`
    select u.id,
      (select count(*) from season) as seasons,
      (select count(*) from round) as rounds,
      (select count(*) from event) as events,
      (select count(*) from individual_result) as results,
      (select count(*) from club) as clubs,
      (select count(*) from rider) as riders,
      (select count(*) from "user") as users,
      (select count(*) from coach) as coaches,
      (select count(*) from club_scoring_team) as scoring_teams,
      (select count(*) from club_member) as club_members,
      (select count(*) from rider_plate) as rider_plates,
      (select count(*) from squad) as squads,
      (select count(*) from squad_coach) as squad_coaches,
      (select count(*) from squad_member) as squad_members
    from "user" u
      join coach co on co.user_id = u.id
      join club c on c.id = co.club_id
    where u.email = ${DEMO_COACH_EMAIL} and c.slug = ${DEMO_CLUB_SLUG}
      and exists (select 1 from event where source_event_id = ${DEMO_EVENTS[0]})
      and exists (select 1 from event where source_event_id = ${DEMO_EVENTS[1]})
    limit 1`);
  const row = rowsOf(result)[0];
  if (!row) return null;
  const expected = {
    seasons: 2,
    rounds: 2,
    events: 2,
    results: 10,
    clubs: 1,
    riders: 5,
    users: 1,
    coaches: 1,
    scoring_teams: 2,
    club_members: 10,
    rider_plates: 10,
    squads: 3,
    squad_coaches: 3,
    squad_members: 10,
  };
  return Object.entries(expected).every(([key, value]) => numberOf(row, key) === value)
    ? String(row.id)
    : null;
}

async function hasApplicationData(db: Db): Promise<boolean> {
  const result = await db.execute(sql`
    select exists (
      select 1 from season union all
      select 1 from event union all
      select 1 from individual_result union all
      select 1 from club union all
      select 1 from rider union all
      select 1 from "user"
    ) as populated`);
  return rowsOf(result)[0]?.populated === true;
}
