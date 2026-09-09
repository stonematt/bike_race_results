/**
 * The test database seam.
 *
 * Every suite that needs real Postgres gets a fresh in-memory PGlite, migrated
 * to the current schema — tables and views both. In-memory means no cleanup, no
 * shared state between suites, and no fixture files on disk, which matters here
 * because the fixture corpus is minors' race results: it sits in the tree at
 * `fixtures/` but is never committed, and only the local-only test lane reads
 * it (see docs/fixtures.md).
 *
 * Migrations resolve relative to this file rather than the working directory,
 * so a suite runs the same from the repo root, from an editor, or from CI.
 */

import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as schema from './schema.ts';
import { createDatabaseRuntime, type DatabaseRuntime } from './runtime.ts';

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

export const migrationsFolder = path.join(import.meta.dirname, 'migrations');

/** A fresh, fully migrated, in-memory database. Nothing to tear down. */
export async function createTestDb(): Promise<TestDatabase> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder });
  return db;
}

/**
 * The disposable loopback PostgreSQL cluster, when one has been offered.
 *
 * Public CI needs no server: a suite that wants native PostgreSQL skips itself
 * when this is `undefined`. When it is set it must be *the* harness cluster and
 * nothing else — an operator who exports a real `DATABASE_URL` here would have a
 * test suite creating and dropping databases next to real athlete data, so the
 * allowlist below refuses anything that is not the tracer, and refuses it
 * without echoing what it was handed.
 */
export const postgresTracerUrl = ((): string | undefined => {
  const offered = process.env.D5_TEST_DATABASE_URL;
  if (!offered) return undefined;
  let location: URL;
  try {
    location = new URL(offered);
  } catch {
    throw new Error('A native database test must use the dedicated loopback tracer cluster.');
  }
  if (
    location.hostname !== '127.0.0.1' ||
    location.port !== '55432' ||
    location.pathname !== '/d5_runtime_tracer' ||
    location.username !== 'd5_runtime'
  ) {
    throw new Error('A native database test must use the dedicated loopback tracer cluster.');
  }
  return offered;
})();

/**
 * A fresh, fully migrated PostgreSQL database of its own, dropped afterwards.
 *
 * Suites share one cluster and vitest runs their files in parallel, so a suite
 * that wrote into the tracer database itself would be reading another suite's
 * rows. Each call mints its own database instead, which is also what makes a
 * "fresh migration" assertion mean anything.
 *
 * Only call it behind `postgresTracerUrl`.
 */
export async function withIsolatedPostgres<T>(
  work: (runtime: DatabaseRuntime) => Promise<T>,
): Promise<T> {
  const location = new URL(postgresTracerUrl!);
  const databaseName = `d5_isolated_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: postgresTracerUrl, max: 1 });
  try {
    await admin.query(`create database ${databaseName}`);
  } finally {
    await admin.end();
  }

  location.pathname = `/${databaseName}`;
  const runtime = createDatabaseRuntime(location.toString());
  try {
    // Narrowed, never cast: the migrator takes the native handle, and the two
    // drivers are not interchangeable behind a shared type.
    if (runtime.kind !== 'postgres') throw new Error('The tracer cluster is not a PGlite runtime.');
    await migratePostgres(runtime.db, { migrationsFolder });
    return await work(runtime);
  } finally {
    await runtime.close();
    const cleanup = new Pool({ connectionString: postgresTracerUrl, max: 1 });
    try {
      await cleanup.query(`drop database if exists ${databaseName} with (force)`);
    } finally {
      await cleanup.end();
    }
  }
}
