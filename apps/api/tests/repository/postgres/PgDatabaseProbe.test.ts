import { describe, expect, it } from 'vitest';
import { PgDatabaseProbe } from '../../../src/repository/postgres/PgDatabaseProbe.js';

describe('PgDatabaseProbe', () => {
  it('reports no schema version when no migration has run', async () => {
    const pool = { query: async () => ({ rows: [] }) };
    await expect(new PgDatabaseProbe(pool as never).check()).resolves.toEqual({
      schemaVersion: null,
    });
  });

  it('propagates connection failures', async () => {
    const pool = {
      query: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    };
    await expect(new PgDatabaseProbe(pool as never).check()).rejects.toThrow('ECONNREFUSED');
  });
});
