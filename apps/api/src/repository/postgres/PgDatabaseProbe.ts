import type { Pool } from 'pg';
import type { DatabaseProbe, DatabaseStatus } from '../ports.js';

export class PgDatabaseProbe implements DatabaseProbe {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async check(): Promise<DatabaseStatus> {
    const { rows } = await this.pool.query<{ name: string }>(
      'SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1',
    );
    return { schemaVersion: rows[0]?.name ?? null };
  }
}
