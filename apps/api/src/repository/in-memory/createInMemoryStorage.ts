import type { Storage } from '../ports.js';
import { InMemoryDatabase } from './InMemoryDatabase.js';
import { InMemoryIdempotencyStore } from './InMemoryIdempotencyStore.js';
import { InMemoryTodoRepository } from './InMemoryTodoRepository.js';
import { InMemoryUnitOfWork } from './InMemoryUnitOfWork.js';

export function createInMemoryStorage(): Storage {
  const database = new InMemoryDatabase();
  return {
    todos: new InMemoryTodoRepository(database),
    idempotency: new InMemoryIdempotencyStore(database),
    unitOfWork: new InMemoryUnitOfWork(database),
  };
}
