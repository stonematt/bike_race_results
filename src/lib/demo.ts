/**
 * Safe, repeatable local data for a demonstration installation.
 *
 * This deliberately does not read config files, fixture files, or a names map.
 * Its entire dataset lives below as public-safe pseudonyms, so `pnpm demo`
 * cannot accidentally load local athlete data from another setup.
 */

import { sql } from 'drizzle-orm';
import { contentHash } from './ingest/raw.ts';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './db/schema.ts';

type Db = PgliteDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type DemoExecutor = Db | Tx;

export const DEMO_DATABASE_URL = './.pglite-demo';
export const DEMO_COACH_EMAIL = 'demo.coach@example.test';

const DEMO_CLUB = 'Demo Descenders';
const DEMO_CLUB_SLUG = 'demo-descenders';
const DEMO_SCORING_TEAM = 'Demo Composite';
const DEMO_EVENTS = ['demo-2025-checkpoint', 'demo-2026-round-1'] as const;
const DEMO_2026_SOURCE_LIST_ID = 'demo-2026-individual-results';
const DEMO_2026_SOURCE_LIST_NAME = 'Synthetic | Individual Results';
const DEMO_2026_SOURCE_URL = 'synthetic://demo-2026-round-1/individual-results';
const DEMO_2026_SOURCE_PAYLOAD = {
  list: {
    ListName: DEMO_2026_SOURCE_LIST_NAME,
    ListFooterText: '5 finishers',
    Fields: [],
  },
  DataFields: [
    'BIB',
    'ID',
    'ucase([DisplayName])',
    'CLUB',
    'if([STATUS]=3;"*";[CategoryRank])',
    'PointsMatrix',
    'WithStatus([TotalTime])',
    'NumberOfLaps',
    'if([Lap01]=0;"-";[Lap01])',
    'if([Lap02.SECTOR]=0;"-";[Lap02.SECTOR])',
    'DisplayLapTime(3)',
  ],
  data: {
    '#1_HS2 Boys - North': [1, 2, 3, 4, 5].map((riderId) => [
      `D${riderId}`,
      String(riderId),
      `«RIDER-${String.fromCharCode(64 + riderId)}»`,
      DEMO_SCORING_TEAM,
      String(riderId),
      String(500 - riderId * 10),
      `0:4${riderId}:00.00`,
      '3',
      '13:20.00',
      '13:20.00',
      '13:20.00',
    ]),
  },
};
const DEMO_2026_SOURCE_HASH = contentHash(DEMO_2026_SOURCE_PAYLOAD);
const DEMO_DATA_TABLES = [
  'season',
  'round',
  'event',
  'individual_result',
  'club',
  'rider',
  'user',
  'coach',
  'club_scoring_team',
  'club_member',
  'rider_plate',
  'squad',
  'squad_coach',
  'squad_member',
] as const;
const DEMO_SOURCE_TABLES = ['raw_fetch', 'event_result_source'] as const;

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
type TableName = { schemaname: string; tablename: string };

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
 * Refuse existing data before the migrator can change an ordinary database.
 * A fully recognizable prior demo is allowed to receive later migrations.
 */
export async function assertSafeDemoMigrationPreflight(db: Db): Promise<void> {
  const tables = rowsOf(
    await db.execute(sql`
      select schemaname, tablename
      from pg_tables
      where schemaname <> 'information_schema'
        and schemaname not like 'pg\\_%' escape '\\'
        and not (schemaname = 'drizzle' and tablename = '__drizzle_migrations')
      order by schemaname, tablename`),
  );
  const populatedTables: TableName[] = [];
  for (const { schemaname, tablename } of tables) {
    const schemaName = String(schemaname);
    const tableName = String(tablename);
    const result = rowsOf(
      await db.execute(
        sql`select exists (
          select 1 from ${sql.identifier(schemaName)}.${sql.identifier(tableName)} limit 1
        ) as populated`,
      ),
    );
    if (result[0]?.populated === true) {
      populatedTables.push({ schemaname: schemaName, tablename: tableName });
    }
  }
  if (populatedTables.length === 0) return;
  const hasAllDemoDataTables = DEMO_DATA_TABLES.every((table) =>
    populatedTables.some(
      ({ schemaname, tablename }) => schemaname === 'public' && tablename === table,
    ),
  );
  const hasOnlyKnownDemoTables = populatedTables.every(
    ({ schemaname, tablename }) =>
      schemaname === 'public' &&
      (DEMO_DATA_TABLES.includes(tablename as (typeof DEMO_DATA_TABLES)[number]) ||
        DEMO_SOURCE_TABLES.includes(tablename as (typeof DEMO_SOURCE_TABLES)[number]) ||
        tablename === 'club_membership'),
  );
  if (!hasAllDemoDataTables || !hasOnlyKnownDemoTables) throw new UnsafeDemoDatabaseError();

  const userId = await knownDemoUserId(db);
  if (
    userId !== null &&
    (await hasExpectedDemoMembership(db, userId)) &&
    (await demoSourceEvidenceState(db)) !== 'custom'
  ) {
    return;
  }
  throw new UnsafeDemoDatabaseError();
}

/**
 * Add the synthetic demo only to a fresh database. A recognized prior run
 * preserves configuration and establishes missing synthetic source evidence;
 * every other populated database is refused before any write.
 */
export async function bootstrapSafeDemo(db: Db): Promise<DemoBootstrapResult> {
  const knownUserId = await knownDemoUserId(db);
  if (knownUserId !== null) {
    if (!(await hasExpectedDemoMembership(db, knownUserId))) throw new UnsafeDemoDatabaseError();
    await db.transaction(async (tx) => {
      await ensureDemoSourceEvidence(tx);
      await alignDemoSerialSequences(tx);
    });
    return { status: 'already-seeded', coachEmail: DEMO_COACH_EMAIL, userId: knownUserId };
  }
  if (await hasApplicationData(db)) throw new UnsafeDemoDatabaseError();

  const userId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const hasMembershipTable = await hasClubMembershipTable(tx);
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
    // The local synthetic bootstrap is the explicit first-admin path. It does
    // not infer authority from `coach` or `squad_coach` outside this fixture.
    // The table is absent only while a test constructs a pre-0007 known demo
    // for migration compatibility; bin/demo.ts always migrates before this call.
    if (hasMembershipTable) {
      await tx.insert(schema.clubMembership).values({ clubId: 1, userId, role: 'admin' });
    }
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
    const squads = [
      { id: 1, clubId: 1, seasonId: 1, name: 'Cedar', slug: 'cedar' },
      { id: 2, clubId: 1, seasonId: 2, name: 'Cedar', slug: 'cedar' },
      { id: 3, clubId: 1, seasonId: 2, name: 'Summit', slug: 'summit' },
    ];
    if (hasMembershipTable) {
      await tx.insert(schema.squad).values(squads);
    } else {
      // Only the migration fixture reaches this branch. Current application
      // schema metadata names 0007 columns that a historical table lacks.
      await tx.execute(sql`
        insert into squad (id, club_id, season_id, name, slug) values
          (1, 1, 1, 'Cedar', 'cedar'),
          (2, 1, 2, 'Cedar', 'cedar'),
          (3, 1, 2, 'Summit', 'summit')`);
    }
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
          sourceRowId: String(riderId),
          displayName: `«RIDER-${String.fromCharCode(64 + riderId)}»`,
          scoringTeam: DEMO_SCORING_TEAM,
          categoryRaw: 'HS2 Boys - North',
          categoryLevel: 'HS2',
          categoryGradeBand: 'HS2',
          categoryGender: 'Boys',
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
    await ensureDemoSourceEvidence(tx);
    await alignDemoSerialSequences(tx);
  });

  return { status: 'created', coachEmail: DEMO_COACH_EMAIL, userId };
}

/**
 * The fixture assigns IDs only to these serial-backed tables. Bring each
 * sequence forward in the same transaction, so later local operations never
 * collide with synthetic rows and a rollback leaves no partially seeded state.
 */
async function alignDemoSerialSequences(tx: DemoExecutor): Promise<void> {
  await tx.execute(sql`
    select
      setval(pg_get_serial_sequence('season', 'id'), (select max(id) from season), true),
      setval(pg_get_serial_sequence('round', 'id'), (select max(id) from round), true),
      setval(pg_get_serial_sequence('event', 'id'), (select max(id) from event), true),
      setval(pg_get_serial_sequence('club', 'id'), (select max(id) from club), true),
      setval(pg_get_serial_sequence('rider', 'id'), (select max(id) from rider), true),
      setval(pg_get_serial_sequence('squad', 'id'), (select max(id) from squad), true)
  `);
}

/**
 * A pre-0007 demo has no membership table and may migrate safely. Once that
 * table exists, its one active admin row is part of the exact synthetic
 * signature; a changed role, revocation, or additional member is managed state
 * and must be refused before the command can migrate or reset anything.
 */
async function hasClubMembershipTable(db: DemoExecutor): Promise<boolean> {
  const table = rowsOf(
    await db.execute(sql`select to_regclass('public.club_membership') as relation`),
  )[0];
  return table?.relation !== null;
}

type DemoMembershipState = 'legacy' | 'admin' | 'upgrade-coach' | 'custom';

async function demoMembershipState(db: DemoExecutor, userId: string): Promise<DemoMembershipState> {
  if (!(await hasClubMembershipTable(db))) return 'legacy';

  const memberships = rowsOf(
    await db.execute(sql`select user_id, role, revoked_at from club_membership order by user_id`),
  );
  const membership = memberships[0];
  if (
    memberships.length !== 1 ||
    membership?.user_id !== userId ||
    membership.revoked_at !== null
  ) {
    return 'custom';
  }
  if (membership.role === 'admin') return 'admin';
  if (membership.role === 'coach') return 'upgrade-coach';
  return 'custom';
}

async function hasExpectedDemoMembership(db: Db, userId: string): Promise<boolean> {
  const state = await demoMembershipState(db, userId);
  return state === 'legacy' || state === 'admin';
}

/**
 * 0007 deliberately backfills legacy coaches as coaches. `bin/demo.ts` calls
 * this only after its pre-migration exact-signature check and migration, so the
 * sole transitional coach row can become the demo's explicit first admin.
 * `bootstrapSafeDemo` itself never repairs current managed membership state.
 */
export async function finalizeKnownDemoMigration(db: Db): Promise<void> {
  const userId = await knownDemoUserId(db);
  if (userId === null) return;

  await db.transaction(async (tx) => {
    const state = await demoMembershipState(tx, userId);
    if (state === 'upgrade-coach') {
      await tx
        .update(schema.clubMembership)
        .set({ role: 'admin', updatedAt: new Date() })
        .where(sql`club_id = 1 and user_id = ${userId} and role = 'coach' and revoked_at is null`);
    } else if (state !== 'legacy' && state !== 'admin') {
      throw new UnsafeDemoDatabaseError();
    }
    await ensureDemoSourceEvidence(tx);
  });
}

type DemoSourceEvidenceState = 'unavailable' | 'absent' | 'current' | 'custom';

async function hasEventResultSourceTable(db: DemoExecutor): Promise<boolean> {
  const table = rowsOf(
    await db.execute(sql`select to_regclass('public.event_result_source') as relation`),
  )[0];
  return table?.relation !== null;
}

/**
 * A pre-provenance demo has no binding and can make the one safe synthetic
 * transition. Any other archived source state is managed source data and stays
 * refused, just like changed membership or roster data.
 */
async function demoSourceEvidenceState(db: DemoExecutor): Promise<DemoSourceEvidenceState> {
  if (!(await hasEventResultSourceTable(db))) {
    const rawFetches = await db.select({ id: schema.rawFetch.id }).from(schema.rawFetch);
    return rawFetches.length === 0 ? 'unavailable' : 'custom';
  }

  const rawFetches = await db
    .select({
      id: schema.rawFetch.id,
      season: schema.rawFetch.season,
      eventId: schema.rawFetch.eventId,
      listId: schema.rawFetch.listId,
      listName: schema.rawFetch.listName,
      url: schema.rawFetch.url,
      httpStatus: schema.rawFetch.httpStatus,
      contentHash: schema.rawFetch.contentHash,
    })
    .from(schema.rawFetch);
  const bindings = await db
    .select({
      eventId: schema.eventResultSource.eventId,
      rawFetchId: schema.eventResultSource.rawFetchId,
      listId: schema.eventResultSource.listId,
      hidden: schema.eventResultSource.hidden,
    })
    .from(schema.eventResultSource);
  if (rawFetches.length === 0 && bindings.length === 0) return 'absent';
  if (rawFetches.length !== 1 || bindings.length !== 1) return 'custom';

  const [rawFetch] = rawFetches;
  const [binding] = bindings;
  return rawFetch !== undefined &&
    binding !== undefined &&
    rawFetch.season === 2026 &&
    rawFetch.eventId === DEMO_EVENTS[1] &&
    rawFetch.listId === DEMO_2026_SOURCE_LIST_ID &&
    rawFetch.listName === DEMO_2026_SOURCE_LIST_NAME &&
    rawFetch.url === DEMO_2026_SOURCE_URL &&
    rawFetch.httpStatus === 200 &&
    rawFetch.contentHash === DEMO_2026_SOURCE_HASH &&
    binding.eventId === 2 &&
    binding.rawFetchId === rawFetch.id &&
    binding.listId === DEMO_2026_SOURCE_LIST_ID &&
    binding.hidden === false
    ? 'current'
    : 'custom';
}

async function ensureDemoSourceEvidence(db: DemoExecutor): Promise<void> {
  const state = await demoSourceEvidenceState(db);
  if (state === 'unavailable' || state === 'current') return;
  if (state === 'custom') throw new UnsafeDemoDatabaseError();

  const [rawFetch] = await db
    .insert(schema.rawFetch)
    .values({
      season: 2026,
      eventId: DEMO_EVENTS[1],
      listId: DEMO_2026_SOURCE_LIST_ID,
      listName: DEMO_2026_SOURCE_LIST_NAME,
      url: DEMO_2026_SOURCE_URL,
      httpStatus: 200,
      payload: DEMO_2026_SOURCE_PAYLOAD,
      contentHash: DEMO_2026_SOURCE_HASH,
    })
    .returning({ id: schema.rawFetch.id });
  await db.insert(schema.eventResultSource).values({
    eventId: 2,
    rawFetchId: rawFetch!.id,
    listId: DEMO_2026_SOURCE_LIST_ID,
    hidden: false,
  });
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
