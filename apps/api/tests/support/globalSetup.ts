import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { testDatabaseUrl } from './testDatabase.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const silentLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

async function waitForDatabase(connectionString: string): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const client = new pg.Client({ connectionString });
    try {
      await client.connect();
      await client.end();
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error('Test database did not become reachable');
}

/** Applies the production migrations to the test database once per run. */
export default async function setup(): Promise<void> {
  const databaseUrl = testDatabaseUrl();
  await waitForDatabase(databaseUrl);
  await runner({
    databaseUrl,
    dir: migrationsDir,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    count: Infinity,
    logger: silentLogger,
  });
}
