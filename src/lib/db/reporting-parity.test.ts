import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { describe, expect, it } from 'vitest';
import { loadCategoryField } from './category-query.ts';
import { createDatabaseRuntime, type DatabaseRuntime } from './runtime.ts';
import { loadRaceDetail } from '../../app/races/[eventId]/query.ts';
import { loadSeasonDispatch } from './editorial-query.ts';
import { resolveSquadBySlug } from '../../app/[season]/query.ts';
import { archiveSquad, createSquad, setPreferredSquad } from '../club-operations.ts';
import {
  createClubInvitation,
  revokeClubInvitation,
  revokeClubMembership,
} from '../club-membership-operations.ts';
import { canStartEmailSignIn, requireClubRole } from '../authz/access.ts';
import { migrationsFolder } from './testing.ts';

const postgresLocation = process.env.D5_TEST_DATABASE_URL;

if (postgresLocation) {
  const location = new URL(postgresLocation);
  if (
    location.hostname !== '127.0.0.1' ||
    location.port !== '55432' ||
    location.pathname !== '/d5_runtime_tracer' ||
    location.username !== 'd5_runtime'
  ) {
    throw new Error('D5 parity requires the dedicated loopback tracer cluster.');
  }
}

async function migrate(runtime: DatabaseRuntime): Promise<void> {
  if (runtime.kind === 'postgres') await migratePostgres(runtime.db, { migrationsFolder });
  else await migratePglite(runtime.db, { migrationsFolder });
}

async function withRuntime<T>(
  kind: 'pglite' | 'postgres',
  work: (runtime: DatabaseRuntime) => Promise<T>,
): Promise<T> {
  const directory = kind === 'pglite' ? await mkdtemp(join(tmpdir(), 'descenders-parity-')) : null;
  const runtime = createDatabaseRuntime(directory ?? postgresLocation!);
  try {
    await migrate(runtime);
    return await work(runtime);
  } finally {
    await runtime.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

type RaceProjection = {
  north: { fieldSize: number; pctBack: number | null; place: string; headline: unknown };
  south: { fieldSize: number; pctBack: number | null; place: string };
  state: { fieldSize: number; headline: unknown };
  deficit: { headline: unknown; field: (number | null)[] };
  dnf: { headline: unknown; points: string | undefined };
  selectedTimeTrial: { headline: unknown; field: (number | null)[] };
  checkpoint: { currentStarts: number; laterAvailability: string; laterStarts: number | null };
};

/**
 * Public output only: generated ids, dates and driver result metadata stay out
 * of this projection. The fixture deliberately combines conference fields,
 * an unsuffixed state field, a short-lap row and a DNF.
 */
async function raceProjection(runtime: DatabaseRuntime, suffix: string): Promise<RaceProjection> {
  const db = runtime.db;
  const season = await db.execute(
    sql`insert into season (year) values (${3000 + Number(suffix.slice(0, 3))}) returning id`,
  );
  const seasonId = Number(season.rows[0]?.id);
  const rounds = await db.execute(sql`
    insert into round (season_id, ordinal, name)
    values (${seasonId}, 1, 'Combined'), (${seasonId}, 2, 'State') returning id`);
  const combinedRoundId = Number(rounds.rows[0]?.id);
  const stateRoundId = Number(rounds.rows[1]?.id);
  const events = await db.execute(sql`
    insert into event (round_id, source_event_id, name)
    values (${combinedRoundId}, ${'parity-combined-' + suffix}, 'Combined'),
           (${stateRoundId}, ${'parity-state-' + suffix}, 'State'),
           (${combinedRoundId}, ${'parity-time-trial-' + suffix}, 'Time trial') returning id`);
  const combinedEventId = Number(events.rows[0]?.id);
  const stateEventId = Number(events.rows[1]?.id);
  const timeTrialEventId = Number(events.rows[2]?.id);
  const club = await db.execute(
    sql`insert into club (name, slug) values (${`Parity Club ${suffix}`}, ${'parity-' + suffix}) returning id`,
  );
  const clubId = Number(club.rows[0]?.id);
  const squad = await db.execute(sql`
    insert into squad (club_id, season_id, name, slug)
    values (${clubId}, ${seasonId}, 'Parity', ${'parity-squad-' + suffix}) returning id`);
  const squadId = Number(squad.rows[0]?.id);
  const riders = await db.execute(sql`
    insert into rider (display_name) values ('NORTH'), ('SOUTH'), ('SHORT'), ('DNF'), ('STATE'), ('TT') returning id`);
  const riderIds = riders.rows.map((row) => Number((row as { id: unknown }).id));
  const plates = ['north', 'south', 'short', 'dnf', 'state', 'tt'].map(
    (plate) => `${plate}-${suffix}`,
  );
  for (let index = 0; index < riderIds.length; index++) {
    await db.execute(sql`insert into rider_plate (rider_id, season_id, plate)
      values (${riderIds[index]}, ${seasonId}, ${plates[index]})`);
    await db.execute(
      sql`insert into squad_member (squad_id, rider_id) values (${squadId}, ${riderIds[index]})`,
    );
    await db.execute(sql`insert into club_member (club_id, season_id, rider_id)
      values (${clubId}, ${seasonId}, ${riderIds[index]})`);
  }
  const result = async (
    eventId: number,
    plate: string,
    category: string,
    place: string,
    seconds: string | null,
    laps: number | null,
    status: 'finished' | 'dnf' = 'finished',
    points: number | null = null,
  ) =>
    db.execute(sql`
      insert into individual_result
        (event_id, plate, display_name, scoring_team, category_raw, place, status, time_raw, time_seconds, laps, points)
      values (${eventId}, ${plate}, ${plate}, 'Parity School', ${category}, ${place}, ${status},
              ${seconds ?? 'DNF'}, ${seconds}, ${laps}, ${points})`);
  await result(combinedEventId, `north-winner-${suffix}`, 'HS2 Girls - North', '1', '1000', 3);
  await result(combinedEventId, plates[0]!, 'HS2 Girls - North', '2', '1100', 3);
  await result(combinedEventId, `north-fill-${suffix}`, 'HS2 Girls - North', '3', '1200', 3);
  await result(combinedEventId, `south-winner-${suffix}`, 'HS2 Girls - South', '1', '900', 2);
  await result(combinedEventId, plates[1]!, 'HS2 Girls - South', '2', '990', 2);
  await result(combinedEventId, plates[2]!, 'HS2 Girls - North', '4', '950', 2);
  await result(combinedEventId, plates[3]!, 'HS2 Girls - North', 'DNF', null, 1, 'dnf', 100);
  await result(stateEventId, `state-winner-${suffix}`, 'HS2 Girls', '1', '1200', 3);
  await result(stateEventId, plates[4]!, 'HS2 Girls', '2', '1320', 3);
  await result(timeTrialEventId, `tt-winner-${suffix}`, 'HS2 Girls - North', '1', '1000', null);
  await result(timeTrialEventId, plates[5]!, 'HS2 Girls - North', '2', '1100', null);
  const selectedSource = await db.execute(sql`
    insert into raw_fetch (season, event_id, list_id, list_name, url, http_status, payload, content_hash)
    values (${3000 + Number(suffix.slice(0, 3))}, ${'parity-time-trial-' + suffix}, 'selected-tt', 'Selected TT',
      'synthetic://selected-tt', 200, ${JSON.stringify({ DataFields: ['RankOrStatusTT', 'Start.TOD', 'End.TOD'] })}::jsonb,
      ${'selected-tt-' + suffix}) returning id`);
  await db.execute(sql`
    insert into raw_fetch (season, event_id, list_id, list_name, url, http_status, payload, content_hash)
    values (${3000 + Number(suffix.slice(0, 3))}, ${'parity-time-trial-' + suffix}, 'later-laps', 'Later lap list',
      'synthetic://later-laps', 200, ${JSON.stringify({ DataFields: ['NumberOfLaps', 'Lap1'] })}::jsonb,
      ${'later-laps-' + suffix})`);
  await db.execute(sql`insert into event_result_source (event_id, raw_fetch_id, list_id, hidden)
    values (${timeTrialEventId}, ${Number(selectedSource.rows[0]?.id)}, 'selected-tt', false)`);

  const [northField, northDetail, southField, stateDetail, timeTrialDetail, dispatch] =
    await Promise.all([
      loadCategoryField(db, riderIds[0]!, combinedRoundId, squadId),
      loadRaceDetail(db, `parity-combined-${suffix}`, clubId),
      loadCategoryField(db, riderIds[1]!, combinedRoundId, squadId),
      loadRaceDetail(db, `parity-state-${suffix}`, clubId),
      loadRaceDetail(db, `parity-time-trial-${suffix}`, clubId),
      loadSeasonDispatch(db, {
        seasonId,
        clubId,
        userId: null,
        checkpoint: { kind: 'through', ordinal: 1 },
      }),
    ]);
  const find = (detail: NonNullable<typeof northDetail>, plate: string) =>
    detail.squads[0]!.riders.find((rider) => rider.card.plate === plate)!;
  const north = find(northDetail!, plates[0]!);
  const south = find(northDetail!, plates[1]!);
  const short = find(northDetail!, plates[2]!);
  const dnf = find(northDetail!, plates[3]!);
  const state = find(stateDetail!, plates[4]!);
  const timeTrial = find(timeTrialDetail!, plates[5]!);
  if (!dispatch || dispatch.schedule.kind !== 'available') {
    throw new Error('Synthetic checkpoint dispatch unavailable');
  }
  return {
    north: {
      fieldSize: northField!.fieldSize,
      pctBack: northField!.rows.find((row) => row.plate === plates[0])!.pctBack,
      place: north.card.stats.find((stat) => stat.label === 'Place')!.value,
      headline: north.card.headline,
    },
    south: {
      fieldSize: southField!.fieldSize,
      pctBack: southField!.rows.find((row) => row.plate === plates[1])!.pctBack,
      place: south.card.stats.find((stat) => stat.label === 'Place')!.value,
    },
    state: { fieldSize: state.field.length, headline: state.card.headline },
    deficit: { headline: short.card.headline, field: short.field.map((mark) => mark.pct) },
    dnf: {
      headline: dnf.card.headline,
      points: dnf.card.stats.find((stat) => stat.label === 'Points')?.value,
    },
    selectedTimeTrial: {
      headline: timeTrial.card.headline,
      field: timeTrial.field.map((mark) => mark.pct),
    },
    checkpoint: {
      currentStarts: dispatch.schedule.rounds[0]!.clubStarts!,
      laterAvailability: dispatch.schedule.rounds[1]!.availability,
      laterStarts: dispatch.schedule.rounds[1]!.clubStarts,
    },
  };
}

describe('public race reporting transport parity', () => {
  it('keeps conference, null-conference, deficit and DNF projections identical', async () => {
    const suffix = String(Date.now()).slice(-6);
    const pglite = await withRuntime('pglite', (runtime) => raceProjection(runtime, suffix));
    expect(pglite).toMatchObject({
      north: { fieldSize: 5, pctBack: 10, place: '2 / 5' },
      south: { fieldSize: 2, pctBack: 10, place: '2 / 2' },
      state: { fieldSize: 2, headline: { kind: 'pct-back', value: '10%', caption: 'back' } },
      deficit: { headline: { kind: 'place-deficit', value: '4', caption: 'of 5 · −1 lap' } },
      dnf: { headline: { kind: 'dnf' }, points: '100' },
      selectedTimeTrial: {
        headline: { kind: 'pct-back', value: '10%', caption: 'back' },
        field: [0, 10],
      },
      checkpoint: { currentStarts: 5, laterAvailability: 'after-checkpoint', laterStarts: null },
    });
    if (postgresLocation) {
      await expect(
        withRuntime('postgres', (runtime) => raceProjection(runtime, suffix + 'p')),
      ).resolves.toEqual(
        expect.objectContaining({
          north: pglite.north,
          south: pglite.south,
          state: pglite.state,
          deficit: pglite.deficit,
          dnf: pglite.dnf,
          selectedTimeTrial: pglite.selectedTimeTrial,
          checkpoint: pglite.checkpoint,
        }),
      );
    }
  }, 30000);
});

type AuthorizationProjection = {
  address: { name: string; slug: string } | null;
  preferenceRows: number;
  malformedInvitationRows: number;
  invitationAdmission: boolean;
  revokedInvitationAdmission: boolean;
  revokedMemberDenied: boolean;
};

async function authorizationProjection(
  runtime: DatabaseRuntime,
  suffix: string,
): Promise<AuthorizationProjection> {
  const db = runtime.db;
  const club = await db.execute(sql`
    insert into club (name, slug) values (${`Parity Authority ${suffix}`}, ${'authority-' + suffix}) returning id`);
  const clubId = Number(club.rows[0]?.id);
  const season = await db.execute(
    sql`insert into season (year) values (${3100 + Number(suffix.slice(0, 3))}) returning id`,
  );
  const seasonId = Number(season.rows[0]?.id);
  const adminId = `admin-${suffix}`;
  const memberId = `member-${suffix}`;
  const invitee = `invitee-${suffix}@example.test`;
  await db.execute(sql`
    insert into "user" (id, email) values
      (${adminId}, ${adminId + '@example.test'}), (${memberId}, ${memberId + '@example.test'})`);
  await db.execute(sql`
    insert into club_membership (club_id, user_id, role) values
      (${clubId}, ${adminId}, 'admin'), (${clubId}, ${memberId}, 'member')`);
  const squad = await createSquad(db, { actorId: adminId, clubId, seasonId, name: 'Cedar' });
  await setPreferredSquad(db, { actorId: memberId, clubId, seasonId, squadId: squad.id });
  await expect(
    createClubInvitation(db, { actorId: adminId, clubId, email: 'not-an-address', role: 'member' }),
  ).rejects.toThrow('Invitation email is invalid.');
  const malformedInvitationRows = Number(
    (await db.execute(sql`select count(*)::int as count from club_invitation`)).rows[0]?.count,
  );
  const issued = await createClubInvitation(db, {
    actorId: adminId,
    clubId,
    email: invitee,
    role: 'member',
  });
  const invitationAdmission = await canStartEmailSignIn(db, invitee);
  await revokeClubInvitation(db, { actorId: adminId, clubId, invitationId: issued.id });
  const revokedInvitationAdmission = await canStartEmailSignIn(db, invitee);
  await archiveSquad(db, { actorId: adminId, clubId, seasonId, squadId: squad.id });
  await revokeClubMembership(db, { actorId: adminId, clubId, userId: memberId });
  let revokedMemberDenied = false;
  try {
    await requireClubRole(db, memberId, clubId, ['member']);
  } catch {
    revokedMemberDenied = true;
  }
  const preferenceRows = Number(
    (await db.execute(sql`select count(*)::int as count from user_squad_preference`)).rows[0]
      ?.count,
  );
  const address = await resolveSquadBySlug(db, seasonId, squad.slug, clubId);
  return {
    address: address ? { name: address.name, slug: address.slug } : null,
    preferenceRows,
    malformedInvitationRows,
    invitationAdmission,
    revokedInvitationAdmission,
    revokedMemberDenied,
  };
}

describe('public authorization-state transport parity', () => {
  it('preserves archived addresses and denies revoked invitation or membership on the next read', async () => {
    const suffix = String(Date.now()).slice(-6);
    const pglite = await withRuntime('pglite', (runtime) =>
      authorizationProjection(runtime, suffix),
    );
    expect(pglite).toEqual({
      address: { name: 'Cedar', slug: 'cedar' },
      preferenceRows: 0,
      malformedInvitationRows: 0,
      invitationAdmission: true,
      revokedInvitationAdmission: false,
      revokedMemberDenied: true,
    });
    if (postgresLocation) {
      await expect(
        withRuntime('postgres', (runtime) => authorizationProjection(runtime, suffix + 'p')),
      ).resolves.toEqual(pglite);
    }
  }, 30000);
});
