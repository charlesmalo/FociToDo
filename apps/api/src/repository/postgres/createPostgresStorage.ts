import type { Pool } from 'pg';
import type { Storage } from '../ports.js';
import { PgIdempotencyStore } from './PgIdempotencyStore.js';
import { PgTodoRepository } from './PgTodoRepository.js';
import { PgUnitOfWork } from './PgUnitOfWork.js';

export function createPostgresStorage(pool: Pool): Storage {
  return {
    todos: new PgTodoRepository(pool),
    idempotency: new PgIdempotencyStore(pool),
    unitOfWork: new PgUnitOfWork(pool),
  };
}
