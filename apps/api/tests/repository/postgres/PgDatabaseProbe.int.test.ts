import { afterAll, describe, expect, it } from 'vitest';
import { PgDatabaseProbe } from '../../../src/repository/postgres/PgDatabaseProbe.js';
import { createTestPool } from '../../support/testDatabase.js';

const pool = createTestPool();
afterAll(() => pool.end());

describe('PgDatabaseProbe against Postgres', () => {
  it('reports the latest applied migration', async () => {
    await expect(new PgDatabaseProbe(pool).check()).resolves.toEqual({
      schemaVersion: '1759190400001_create-idempotency-keys',
    });
  });
});
