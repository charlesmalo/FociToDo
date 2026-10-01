import pg from 'pg';

/** The test database URL; refuses anything whose database name does not end in `_test`. */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined) throw new Error('DATABASE_URL must point at the test database');
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run destructive tests against database "${name}"`);
  }
  return url;
}

export function createTestPool(): pg.Pool {
  return new pg.Pool({ connectionString: testDatabaseUrl(), max: 20 });
}

export async function resetDatabase(pool: pg.Pool): Promise<void> {
  await pool.query('TRUNCATE todos, idempotency_keys');
}
