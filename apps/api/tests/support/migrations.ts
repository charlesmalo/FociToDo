import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { testDatabaseUrl } from './testDatabase.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));
const silentLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

export const migrate = (direction: 'up' | 'down', count: number) =>
  runner({
    databaseUrl: testDatabaseUrl(),
    dir: migrationsDir,
    direction,
    migrationsTable: 'pgmigrations',
    count,
    logger: silentLogger,
  });

/** Rolls back `name` and every later migration, so `migrate('up', 1)` re-applies `name` alone. */
export async function migrateDownThrough(pool: Pool, name: string): Promise<void> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT count(*) FROM pgmigrations WHERE name >= $1',
    [name],
  );
  await migrate('down', Number(rows[0]?.count ?? 0));
}
