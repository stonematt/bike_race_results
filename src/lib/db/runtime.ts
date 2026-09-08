import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { drizzle as postgresDrizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema.ts';
import { resolveDatabaseUrl } from './url.ts';

export type DatabaseRuntime =
  | {
      kind: 'pglite';
      db: PgliteDatabase<typeof schema>;
      close(): Promise<void>;
    }
  | {
      kind: 'postgres';
      db: NodePgDatabase<typeof schema>;
      /**
       * Serialize schema changes across every process connected to this
       * database. The lock belongs to one dedicated pg session, not a pooled
       * query used by the migrator, and is released even when migration fails.
       */
      withMigrationLock<T>(work: (db: NodePgDatabase<typeof schema>) => Promise<T>): Promise<T>;
      close(): Promise<void>;
    };

export type RuntimeDatabase = DatabaseRuntime['db'];
export type RuntimeTransaction = Parameters<Parameters<RuntimeDatabase['transaction']>[0]>[0];

const migrationLock = "select pg_advisory_lock(hashtext('descenders:drizzle-migrate'))";
const migrationUnlock = "select pg_advisory_unlock(hashtext('descenders:drizzle-migrate'))";

function errorForPool(error: unknown): Error {
  return error instanceof Error ? error : new Error('Database migration lock failed.');
}

export function createDatabaseRuntime(url = resolveDatabaseUrl()): DatabaseRuntime {
  if (typeof url !== 'string' || url.trim() === '' || /[\u0000-\u001f\u007f]/u.test(url))
    throw new Error('Database location is invalid.');
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname || parsed.pathname.length <= 1 || parsed.hash || url.trim() !== url)
        throw new Error();
      decodeURIComponent(parsed.username);
      decodeURIComponent(parsed.password);
      decodeURIComponent(parsed.pathname);
    } catch {
      throw new Error('Database location is invalid.');
    }
    const pool = new Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    pool.on('error', () => {
      console.error('Database background connection failed.');
    });
    return {
      kind: 'postgres',
      db: postgresDrizzle(pool, { schema }),
      async withMigrationLock<T>(
        work: (db: NodePgDatabase<typeof schema>) => Promise<T>,
      ): Promise<T> {
        const client = await pool.connect();
        let locked = false;
        let failed = false;
        let poolError: Error | undefined;
        let clientLost = false;
        const onClientError = (error: Error) => {
          clientLost = true;
          poolError ??= errorForPool(error);
        };
        // A checked-out client is not covered by the pool's idle-client error
        // listener. Keep this handler attached until we destroy or release it.
        client.on('error', onClientError);
        try {
          await client.query(migrationLock);
          locked = true;
          const result = await work(postgresDrizzle(client, { schema }));
          if (clientLost) throw poolError;
          return result;
        } catch (error) {
          failed = true;
          poolError = errorForPool(error);
          throw error;
        } finally {
          let unlockError: Error | undefined;
          if (locked) {
            try {
              await client.query(migrationUnlock);
            } catch (error) {
              unlockError = errorForPool(error);
              poolError ??= unlockError;
            }
          }
          // Destroy a session that lost its lock/unlock command. Releasing it
          // normally could retain a session-scoped advisory lock in the pool.
          client.removeListener('error', onClientError);
          client.release(poolError);
          // A successful migration must still surface a failed unlock, but only
          // after the borrowed connection has been released or destroyed.
          if (!failed && unlockError) throw unlockError;
        }
      },
      close: () => pool.end(),
    };
  }
  if (url !== 'memory://' && /^[a-z][a-z0-9+.-]*:/iu.test(url))
    throw new Error('Database location is invalid.');
  const client = new PGlite(url);
  return { kind: 'pglite', db: drizzle(client, { schema }), close: () => client.close() };
}
