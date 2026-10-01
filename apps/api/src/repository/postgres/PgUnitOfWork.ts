import type { Pool } from 'pg';
import type { Repositories, UnitOfWork } from '../ports.js';
import { PgIdempotencyStore } from './PgIdempotencyStore.js';
import { PgTodoRepository } from './PgTodoRepository.js';

/** One transaction (READ COMMITTED) on a dedicated pooled client. */
export class PgUnitOfWork implements UnitOfWork {
  constructor(private readonly pool: Pool) {}

  async run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let clientIsBroken = false;
    try {
      await client.query('BEGIN');
      const result = await work({
        todos: new PgTodoRepository(client),
        idempotency: new PgIdempotencyStore(client),
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The connection is unusable; destroy it instead of returning it to the pool.
        clientIsBroken = true;
      }
      throw error;
    } finally {
      client.release(clientIsBroken);
    }
  }
}
