import type { TodoView } from '@foci/shared';

export interface Todo {
  id: string;
  title: string;
  description: string | null;
  dueAt: Date | null;
  isCompleted: boolean;
  createdAt: Date;
  version: number;
}

/** Fields an update may change: absent fields are untouched, `null` clears an optional field. */
export interface TodoPatch {
  title?: string;
  description?: string | null;
  dueAt?: Date | null;
}

export const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Overdue: incomplete and the deadline moment has passed. Identical in every timezone. */
export function isOverdue(todo: Todo, now: Date): boolean {
  return !todo.isCompleted && todo.dueAt !== null && todo.dueAt.getTime() < now.getTime();
}

/** Due soon: incomplete and the deadline is now or within the next 24 hours. */
export function isDueSoon(todo: Todo, now: Date): boolean {
  if (todo.isCompleted || todo.dueAt === null) return false;
  const remaining = todo.dueAt.getTime() - now.getTime();
  return remaining >= 0 && remaining < DUE_SOON_WINDOW_MS;
}

export function toView(todo: Todo, now: Date): TodoView {
  return {
    id: todo.id,
    title: todo.title,
    description: todo.description,
    dueAt: todo.dueAt === null ? null : todo.dueAt.toISOString(),
    isCompleted: todo.isCompleted,
    createdAt: todo.createdAt.toISOString(),
    version: todo.version,
    isOverdue: isOverdue(todo, now),
    isDueSoon: isDueSoon(todo, now),
  };
}
