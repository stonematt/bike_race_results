/**
 * The public D1 bootstrap seam: a persistent PGlite demo is only useful if
 * its own reporting reads continue to work after the process restarts.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveCurrentSeason, resolveDefaultSquad } from '../app/[season]/query.ts';
import { listRaces, loadRaceDetail } from '../app/races/[eventId]/query.ts';
import { bootstrapSafeDemo, DEMO_COACH_EMAIL, UnsafeDemoDatabaseError } from './demo.ts';
import { migrationsFolder } from './db/testing.ts';
import * as schema from './db/schema.ts';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true })),
  );
});

async function openDemoDatabase(directory: string) {
  const client = new PGlite(directory);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { client, db };
}

describe('bootstrapSafeDemo', () => {
  it('keeps a synthetic current season and reporting reads intact across reopen and rerun', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-'));
    directories.push(directory);

    const first = await openDemoDatabase(directory);
    const created = await bootstrapSafeDemo(first.db);
    expect(created).toEqual({
      status: 'created',
      coachEmail: DEMO_COACH_EMAIL,
      userId: expect.any(String),
    });
    await first.client.close();

    const reopened = await openDemoDatabase(directory);
    const again = await bootstrapSafeDemo(reopened.db);
    expect(again).toEqual({
      status: 'already-seeded',
      coachEmail: DEMO_COACH_EMAIL,
      userId: created.userId,
    });

    const current = await resolveCurrentSeason(reopened.db);
    expect(current).toEqual({ id: expect.any(Number), year: 2026 });
    expect(await resolveDefaultSquad(reopened.db, created.userId, current!.id)).toEqual({
      id: expect.any(Number),
      name: 'Cedar',
      slug: 'cedar',
    });
    expect(await listRaces(reopened.db)).toEqual([
      {
        eventId: expect.any(Number),
        sourceEventId: 'demo-2026-round-1',
        name: 'Demo Race 1 — Old Oak',
        seasonYear: 2026,
        roundOrdinal: 1,
      },
      {
        eventId: expect.any(Number),
        sourceEventId: 'demo-2025-checkpoint',
        name: 'Demo Checkpoint — Race 2',
        seasonYear: 2025,
        roundOrdinal: 2,
      },
    ]);

    const report = await loadRaceDetail(reopened.db, 'demo-2026-round-1', created.userId);
    expect(report?.squads.map((squad) => squad.name)).toEqual(['Cedar', 'Summit']);
    expect(report?.starters).toBe(5);
    await reopened.client.close();
  }, 60_000);

  it('refuses a populated database whose data is not this synthetic demo', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'descenders-demo-existing-'));
    directories.push(directory);
    const existing = await openDemoDatabase(directory);
    await existing.db.insert(schema.season).values({ year: 2030 });

    await expect(bootstrapSafeDemo(existing.db)).rejects.toThrow(UnsafeDemoDatabaseError);
    expect(await resolveCurrentSeason(existing.db)).toEqual({ id: expect.any(Number), year: 2030 });
    await existing.client.close();
  }, 60_000);
});
