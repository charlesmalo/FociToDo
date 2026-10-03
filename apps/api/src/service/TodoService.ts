import {
  TodoViewSchema,
  type CreateTodo,
  type ListTodosQuery,
  type TodoView,
  type UpdateTodo,
} from '@foci/shared';
import type { Clock } from '../domain/clock.js';
import {
  IdempotencyKeyReuseError,
  PreconditionRequiredError,
  TodoNotFoundError,
  VersionConflictError,
} from '../domain/errors.js';
import type { IdGenerator } from '../domain/ids.js';
import { toView, type Todo, type TodoPatch } from '../domain/todo.js';
import type { TodoRepository, UnitOfWork } from '../repository/ports.js';
import { hashCreateRequest } from './requestHash.js';

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface TodoServiceDependencies {
  todos: TodoRepository;
  unitOfWork: UnitOfWork;
  clock: Clock;
  ids: IdGenerator;
}

export interface CreateTodoResult {
  todo: TodoView;
  replayed: boolean;
}

function toTodoPatch(patch: UpdateTodo): TodoPatch {
  const { dueAt, ...rest } = patch;
  if (dueAt === undefined) return rest;
  return { ...rest, dueAt: dueAt === null ? null : new Date(dueAt) };
}

export class TodoService {
  constructor(private readonly deps: TodoServiceDependencies) {}

  async create(input: CreateTodo, idempotencyKey?: string): Promise<CreateTodoResult> {
    const now = this.deps.clock.now();
    const todo: Todo = {
      id: this.deps.ids.next(),
      title: input.title,
      description: input.description ?? null,
      dueAt: input.dueAt === undefined || input.dueAt === null ? null : new Date(input.dueAt),
      isCompleted: false,
      createdAt: now,
      version: 1,
    };
    const view = toView(todo, now);

    if (idempotencyKey === undefined) {
      await this.deps.todos.create(todo);
      return { todo: view, replayed: false };
    }

    const requestHash = hashCreateRequest(input);
    const notBefore = new Date(now.getTime() - IDEMPOTENCY_TTL_MS);
    return this.deps.unitOfWork.run(async ({ todos, idempotency }) => {
      // Claim the key first: concurrent requests with the same key serialise here.
      const claimed = await idempotency.claim(
        { key: idempotencyKey, requestHash, status: 201, body: view, createdAt: now },
        notBefore,
      );
      if (claimed) {
        await todos.create(todo);
        return { todo: view, replayed: false };
      }
      const existing = await idempotency.find(idempotencyKey, notBefore);
      if (existing === null) {
        throw new Error(`Idempotency record for ${idempotencyKey} disappeared`);
      }
      if (existing.requestHash !== requestHash) throw new IdempotencyKeyReuseError(idempotencyKey);
      return { todo: TodoViewSchema.parse(existing.body), replayed: true };
    });
  }

  async get(id: string): Promise<TodoView> {
    const todo = await this.deps.todos.findById(id);
    if (todo === null) throw new TodoNotFoundError(id);
    return this.view(todo);
  }

  async list(query: ListTodosQuery): Promise<TodoView[]> {
    const now = this.deps.clock.now();
    const todos = await this.deps.todos.list(query, now);
    return todos.map((todo) => toView(todo, now));
  }

  async update(
    id: string,
    expectedVersion: number | undefined,
    patch: UpdateTodo,
  ): Promise<TodoView> {
    if (expectedVersion === undefined) throw new PreconditionRequiredError();
    const updated = await this.deps.todos.update(id, expectedVersion, toTodoPatch(patch));
    if (updated === null) throw await this.notFoundOrConflict(id);
    return this.view(updated);
  }

  complete(id: string): Promise<TodoView> {
    return this.setCompleted(id, true);
  }

  uncomplete(id: string): Promise<TodoView> {
    return this.setCompleted(id, false);
  }

  async delete(id: string, expectedVersion: number | undefined): Promise<void> {
    if (expectedVersion === undefined) throw new PreconditionRequiredError();
    const deleted = await this.deps.todos.delete(id, expectedVersion);
    if (!deleted) throw await this.notFoundOrConflict(id);
  }

  private async setCompleted(id: string, completed: boolean): Promise<TodoView> {
    const todo = await this.deps.todos.setCompleted(id, completed);
    if (todo === null) throw new TodoNotFoundError(id);
    return this.view(todo);
  }

  /** After a conditional write matched no row: 404 if the todo is gone, otherwise 412. */
  private async notFoundOrConflict(id: string): Promise<Error> {
    const existing = await this.deps.todos.findById(id);
    return existing === null ? new TodoNotFoundError(id) : new VersionConflictError(id);
  }

  private view(todo: Todo): TodoView {
    return toView(todo, this.deps.clock.now());
  }
}
