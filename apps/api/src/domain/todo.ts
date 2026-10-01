import type { TodoView } from '@foci/shared';

export interface Todo {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  isCompleted: boolean;
  createdAt: Date;
  version: number;
}

/** Fields an update may change: absent fields are untouched, `null` clears an optional field. */
export interface TodoPatch {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
}

/** Overdue is derived, never stored: incomplete and due strictly before `today` (YYYY-MM-DD, UTC). */
export function isOverdue(todo: Todo, today: string): boolean {
  return !todo.isCompleted && todo.dueDate !== null && todo.dueDate < today;
}

export function toView(todo: Todo, today: string): TodoView {
  return {
    id: todo.id,
    title: todo.title,
    description: todo.description,
    dueDate: todo.dueDate,
    isCompleted: todo.isCompleted,
    createdAt: todo.createdAt.toISOString(),
    version: todo.version,
    isOverdue: isOverdue(todo, today),
  };
}
