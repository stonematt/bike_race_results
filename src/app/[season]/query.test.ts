/**
 * The `[season]` segment's own reads: which years exist, which one a URL
 * segment names, and explicit squad addresses (issue #88).
 *
 * Synthetic rows only, no corpus — the CI lane. Two seasons, two coaches, one
 * of whom holds more than one squad, so assignment reads retain all choices.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../lib/db/schema.ts';
import { createTestDb, type TestDatabase } from '../../lib/db/testing.ts';
import {
  listCoachSquads,
  listSeasonYears,
  resolveCurrentSeason,
  resolveSeasonByYear,
  resolveSquadBySlug,
} from './query.ts';

let db: TestDatabase;

const SOLO_COACH = 'coach-solo';
const MULTI_COACH = 'coach-multi';
const UNSQUADDED_COACH = 'coach-unsquadded';

beforeAll(async () => {
  db = await createTestDb();

  await db.insert(schema.season).values([
    { id: 1, year: 2025 },
    { id: 2, year: 2026 },
  ]);
  await db
    .insert(schema.club)
    .values({ id: 1, name: 'Salem Composite Descenders', slug: 'descenders' });

  // 2025: one squad, one coach with exactly one squad.
  await db
    .insert(schema.squad)
    .values({ id: 1, clubId: 1, seasonId: 1, name: 'Descenders', slug: 'descenders' });
  await db.insert(schema.squadCoach).values({ squadId: 1, userId: SOLO_COACH });

  // 2026: three squads. MULTI_COACH holds two of them, named so alphabetical
  // order does not match insertion order — the tiebreak has to actually sort.
  await db.insert(schema.squad).values([
    { id: 2, clubId: 1, seasonId: 2, name: 'Wolf Pack', slug: 'wolf-pack' },
    { id: 3, clubId: 1, seasonId: 2, name: 'Alpha Squad', slug: 'alpha-squad' },
    { id: 4, clubId: 1, seasonId: 2, name: 'Descenders', slug: 'descenders' },
  ]);
  await db.insert(schema.squadCoach).values([
    { squadId: 2, userId: MULTI_COACH },
    { squadId: 3, userId: MULTI_COACH },
    { squadId: 4, userId: SOLO_COACH },
  ]);
});

describe('which years exist', () => {
  it('lists every season year, newest first', async () => {
    expect(await listSeasonYears(db)).toEqual([2026, 2025]);
  });
});

describe('the current season', () => {
  it('uses a configured recorded year while an empty setting keeps the latest default', async () => {
    expect(await resolveCurrentSeason(db, '2025')).toEqual({ id: 1, year: 2025 });
    expect(await resolveCurrentSeason(db, '')).toEqual({ id: 2, year: 2026 });
  });

  it('rejects a malformed configured year instead of presenting it as a season', async () => {
    await expect(resolveCurrentSeason(db, '2026-next')).rejects.toThrow(
      'CURRENT_SEASON must be a four-digit year.',
    );
  });

  it('does not substitute historical data for a configured season with no records', async () => {
    expect(await resolveCurrentSeason(db, '2027')).toBeNull();
  });

  it('is the latest year on record', async () => {
    expect(await resolveCurrentSeason(db)).toEqual({ id: 2, year: 2026 });
  });

  it('is null before anything is seeded', async () => {
    const empty = await createTestDb();
    expect(await resolveCurrentSeason(empty)).toBeNull();
  });
});

describe('resolving a URL segment to a season', () => {
  it('finds the season named by a real year', async () => {
    expect(await resolveSeasonByYear(db, '2025')).toEqual({ id: 1, year: 2025 });
  });

  it('is null for a year nothing was seeded under', async () => {
    expect(await resolveSeasonByYear(db, '1999')).toBeNull();
  });

  it('is null for a segment that is not a plain integer', async () => {
    expect(await resolveSeasonByYear(db, '2025abc')).toBeNull();
    expect(await resolveSeasonByYear(db, 'wolf-pack')).toBeNull();
    expect(await resolveSeasonByYear(db, '-2025')).toBeNull();
    expect(await resolveSeasonByYear(db, '')).toBeNull();
  });
});

describe('resolving a URL segment to a squad (issue #114)', () => {
  it('finds the squad named by its slug in that season', async () => {
    expect(await resolveSquadBySlug(db, 2, 'wolf-pack')).toEqual({
      id: 2,
      name: 'Wolf Pack',
      slug: 'wolf-pack',
    });
  });

  it('is null for a slug nothing was seeded under', async () => {
    expect(await resolveSquadBySlug(db, 2, 'no-such-squad')).toBeNull();
  });

  it('does not cross seasons: the same slug in a different season is a different squad', async () => {
    expect(await resolveSquadBySlug(db, 1, 'descenders')).toEqual({
      id: 1,
      name: 'Descenders',
      slug: 'descenders',
    });
    expect(await resolveSquadBySlug(db, 2, 'descenders')).toEqual({
      id: 4,
      name: 'Descenders',
      slug: 'descenders',
    });
  });

  it('is null when two clubs in one season share a slug — genuinely ambiguous with no club segment', async () => {
    const ambiguous = await createTestDb();
    await ambiguous.insert(schema.season).values({ id: 1, year: 2025 });
    await ambiguous.insert(schema.club).values([
      { id: 1, name: 'Club One', slug: 'club-one' },
      { id: 2, name: 'Club Two', slug: 'club-two' },
    ]);
    await ambiguous.insert(schema.squad).values([
      { id: 1, clubId: 1, seasonId: 1, name: 'Descenders', slug: 'descenders' },
      { id: 2, clubId: 2, seasonId: 1, name: 'Descenders Too', slug: 'descenders' },
    ]);

    expect(await resolveSquadBySlug(ambiguous, 1, 'descenders')).toBeNull();
    expect(await resolveSquadBySlug(ambiguous, 1, 'descenders', 1)).toEqual({
      id: 1,
      name: 'Descenders',
      slug: 'descenders',
    });
    expect(await resolveSquadBySlug(ambiguous, 1, 'descenders', 2)).toEqual({
      id: 2,
      name: 'Descenders Too',
      slug: 'descenders',
    });
  });
});

describe('listCoachSquads', () => {
  it('is empty for a coach who holds no squad this season', async () => {
    expect(await listCoachSquads(db, UNSQUADDED_COACH, 2)).toEqual([]);
  });

  it('lists every squad a coach holds, lowest name first', async () => {
    expect(await listCoachSquads(db, MULTI_COACH, 2)).toEqual([
      { id: 3, name: 'Alpha Squad', slug: 'alpha-squad' },
      { id: 2, name: 'Wolf Pack', slug: 'wolf-pack' },
    ]);
  });

  it('does not cross seasons', async () => {
    expect(await listCoachSquads(db, SOLO_COACH, 1)).toEqual([
      { id: 1, name: 'Descenders', slug: 'descenders' },
    ]);
    expect(await listCoachSquads(db, SOLO_COACH, 2)).toEqual([
      { id: 4, name: 'Descenders', slug: 'descenders' },
    ]);
  });

  it('does not list a coach assignment from another Club when scope is resolved', async () => {
    const scoped = await createTestDb();
    await scoped.insert(schema.season).values({ id: 1, year: 2025 });
    await scoped.insert(schema.club).values([
      { id: 1, name: 'Club One', slug: 'club-one' },
      { id: 2, name: 'Club Two', slug: 'club-two' },
    ]);
    await scoped.insert(schema.squad).values([
      { id: 1, clubId: 1, seasonId: 1, name: 'Home Squad', slug: 'home' },
      { id: 2, clubId: 2, seasonId: 1, name: 'Foreign Squad', slug: 'foreign' },
    ]);
    await scoped.insert(schema.squadCoach).values([
      { squadId: 1, userId: MULTI_COACH },
      { squadId: 2, userId: MULTI_COACH },
    ]);

    expect(await listCoachSquads(scoped, MULTI_COACH, 1, 1)).toEqual([
      { id: 1, name: 'Home Squad', slug: 'home' },
    ]);
  });
});
