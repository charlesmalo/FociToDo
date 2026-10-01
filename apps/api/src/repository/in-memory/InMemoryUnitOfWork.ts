import type { UnitOfWork, Repositories } from '../ports.js';
import { InMemoryIdempotencyStore } from './InMemoryIdempotencyStore.js';
import type { InMemoryDatabase } from './InMemoryDatabase.js';
import { InMemoryTodoRepository } from './InMemoryTodoRepository.js';

/** Serialises units of work and restores the previous state if one fails. */
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(private readonly database: InMemoryDatabase) {}

  run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> {
    return this.database.transactions.runExclusive(async () => {
      const rollback = this.database.snapshot();
      try {
        return await work({
          todos: new InMemoryTodoRepository(this.database),
          idempotency: new InMemoryIdempotencyStore(this.database),
        });
      } catch (error) {
        rollback();
        throw error;
      }
    });
  }
}
