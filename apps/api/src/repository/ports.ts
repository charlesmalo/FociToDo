import type { ListTodosQuery } from '@foci/shared';
import type { Todo, TodoPatch } from '../domain/todo.js';

export interface TodoRepository {
  create(todo: Todo): Promise<void>;
  findById(id: string): Promise<Todo | null>;
  /** Filters and sorts in storage; `now` defines "overdue" and "due soon". */
  list(query: ListTodosQuery, now: Date): Promise<Todo[]>;
  /** Applies the patch only if the stored version equals `expectedVersion`; bumps the version. `null` = no row updated. */
  update(id: string, expectedVersion: number, patch: TodoPatch): Promise<Todo | null>;
  /** Sets the flag; bumps the version only when the value actually changes. `null` = not found. */
  setCompleted(id: string, completed: boolean): Promise<Todo | null>;
  /** Deletes only if the stored version equals `expectedVersion`. */
  delete(id: string, expectedVersion: number): Promise<boolean>;
}

export interface StoredResponse {
  key: string;
  requestHash: string;
  status: number;
  body: unknown;
  createdAt: Date;
}

export interface IdempotencyStore {
  /** Returns the record only if it was created at or after `notBefore` (not expired). */
  find(key: string, notBefore: Date): Promise<StoredResponse | null>;
  /** Stores the record unless a live (non-expired) record exists; returns whether it was stored. */
  claim(record: StoredResponse, notBefore: Date): Promise<boolean>;
}

export interface Repositories {
  todos: TodoRepository;
  idempotency: IdempotencyStore;
}

export interface UnitOfWork {
  /** Runs `work` atomically: all writes commit together or none do. */
  run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T>;
}

/** Everything a storage adapter provides; each adapter has a factory returning one. */
export interface Storage {
  todos: TodoRepository;
  idempotency: IdempotencyStore;
  unitOfWork: UnitOfWork;
}

export interface DatabaseStatus {
  schemaVersion: string | null;
}

export interface DatabaseProbe {
  /** Resolves with the applied schema version; rejects when the database is unreachable. */
  check(): Promise<DatabaseStatus>;
}
