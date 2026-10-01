import type { ListTodosQuery } from '@foci/shared';
import type { Todo, TodoPatch } from '../../domain/todo.js';
import type { TodoRepository } from '../ports.js';
import type { InMemoryDatabase } from './InMemoryDatabase.js';
import { compareTodos, matchesStatus } from './ordering.js';

export class InMemoryTodoRepository implements TodoRepository {
  constructor(private readonly database: InMemoryDatabase) {}

  async create(todo: Todo): Promise<void> {
    if (this.database.todos.has(todo.id)) throw new Error(`Duplicate todo id ${todo.id}`);
    this.database.todos.set(todo.id, structuredClone(todo));
  }

  async findById(id: string): Promise<Todo | null> {
    const todo = this.database.todos.get(id);
    return todo === undefined ? null : structuredClone(todo);
  }

  async list(query: ListTodosQuery, today: string): Promise<Todo[]> {
    return [...this.database.todos.values()]
      .filter(matchesStatus(query.status, today))
      .sort(compareTodos(query.sort, query.order))
      .map((todo) => structuredClone(todo));
  }

  async update(id: string, expectedVersion: number, patch: TodoPatch): Promise<Todo | null> {
    const current = this.database.todos.get(id);
    if (current === undefined || current.version !== expectedVersion) return null;
    const next: Todo = { ...current, version: current.version + 1 };
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.description !== undefined) next.description = patch.description;
    if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
    this.database.todos.set(id, structuredClone(next));
    return structuredClone(next);
  }

  async setCompleted(id: string, completed: boolean): Promise<Todo | null> {
    const current = this.database.todos.get(id);
    if (current === undefined) return null;
    if (current.isCompleted === completed) return structuredClone(current);
    const next: Todo = { ...current, isCompleted: completed, version: current.version + 1 };
    this.database.todos.set(id, structuredClone(next));
    return structuredClone(next);
  }

  async delete(id: string, expectedVersion: number): Promise<boolean> {
    const current = this.database.todos.get(id);
    if (current === undefined || current.version !== expectedVersion) return false;
    this.database.todos.delete(id);
    return true;
  }
}
