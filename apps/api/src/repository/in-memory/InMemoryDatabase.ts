import type { Todo } from '../../domain/todo.js';
import type { StoredResponse } from '../ports.js';
import { AsyncMutex } from './AsyncMutex.js';

/**
 * Shared state for the in-memory adapters. Stored objects are never mutated in place
 * (updates replace them), so a shallow map copy is a complete snapshot.
 */
export class InMemoryDatabase {
  todos = new Map<string, Todo>();
  idempotency = new Map<string, StoredResponse>();
  readonly transactions = new AsyncMutex();

  /** Captures the current state and returns a function that restores it. */
  snapshot(): () => void {
    const todos = new Map(this.todos);
    const idempotency = new Map(this.idempotency);
    return () => {
      this.todos = todos;
      this.idempotency = idempotency;
    };
  }
}
