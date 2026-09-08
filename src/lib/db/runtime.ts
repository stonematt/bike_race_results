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
  | { kind: 'postgres'; db: NodePgDatabase<typeof schema>; close(): Promise<void> };

export type RuntimeDatabase = DatabaseRuntime['db'];
export type RuntimeTransaction = Parameters<Parameters<RuntimeDatabase['transaction']>[0]>[0];

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
    return { kind: 'postgres', db: postgresDrizzle(pool, { schema }), close: () => pool.end() };
  }
  if (url !== 'memory://' && /^[a-z][a-z0-9+.-]*:/iu.test(url))
    throw new Error('Database location is invalid.');
  const client = new PGlite(url);
  return { kind: 'pglite', db: drizzle(client, { schema }), close: () => client.close() };
}
