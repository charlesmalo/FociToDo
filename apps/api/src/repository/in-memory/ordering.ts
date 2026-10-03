import type { SortOrder, TodoSortField, TodoStatus } from '@foci/shared';
import { isDueSoon, isOverdue, type Todo } from '../../domain/todo.js';

const codePoints = (text: string): number[] =>
  Array.from(text, (character) => character.codePointAt(0) as number);

/** Compares strings by Unicode code point — the same order as Postgres `COLLATE "C"` on UTF-8. */
export function compareCodePoints(a: string, b: string): number {
  const left = codePoints(a);
  const right = codePoints(b);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] as number) - (right[index] as number);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function matchesStatus(status: TodoStatus, now: Date): (todo: Todo) => boolean {
  switch (status) {
    case 'all':
      return () => true;
    case 'completed':
      return (todo) => todo.isCompleted;
    case 'incomplete':
      return (todo) => !todo.isCompleted;
    case 'overdue':
      return (todo) => isOverdue(todo, now);
    case 'due-soon':
      return (todo) => isDueSoon(todo, now);
  }
}

/** Mirrors the Postgres ORDER BY: primary key, then `created_at DESC, id ASC`. */
export function compareTodos(sort: TodoSortField, order: SortOrder): (a: Todo, b: Todo) => number {
  const direction = order === 'asc' ? 1 : -1;
  return (a, b) => comparePrimary(sort, direction, a, b) || compareTieBreak(a, b);
}

function comparePrimary(sort: TodoSortField, direction: number, a: Todo, b: Todo): number {
  switch (sort) {
    case 'createdAt':
      return direction * (a.createdAt.getTime() - b.createdAt.getTime());
    case 'title':
      return direction * compareCodePoints(a.title.toLowerCase(), b.title.toLowerCase());
    case 'dueAt':
      return compareDueAts(a.dueAt, b.dueAt, direction);
  }
}

/** Todos without a deadline sort last regardless of direction (Postgres `NULLS LAST`). */
export function compareDueAts(a: Date | null, b: Date | null, direction: number): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return direction * (a.getTime() - b.getTime());
}

function compareTieBreak(a: Todo, b: Todo): number {
  return b.createdAt.getTime() - a.createdAt.getTime() || compareCodePoints(a.id, b.id);
}
