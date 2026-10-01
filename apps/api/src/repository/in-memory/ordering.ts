import type { SortOrder, TodoSortField, TodoStatus } from '@foci/shared';
import { isOverdue, type Todo } from '../../domain/todo.js';

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

export function matchesStatus(status: TodoStatus, today: string): (todo: Todo) => boolean {
  switch (status) {
    case 'all':
      return () => true;
    case 'completed':
      return (todo) => todo.isCompleted;
    case 'incomplete':
      return (todo) => !todo.isCompleted;
    case 'overdue':
      return (todo) => isOverdue(todo, today);
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
    case 'dueDate':
      return compareDueDates(a.dueDate, b.dueDate, direction);
  }
}

/** Todos without a due date sort last regardless of direction (Postgres `NULLS LAST`). */
function compareDueDates(a: string | null, b: string | null, direction: number): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction * (a < b ? -1 : 1);
}

function compareTieBreak(a: Todo, b: Todo): number {
  return b.createdAt.getTime() - a.createdAt.getTime() || compareCodePoints(a.id, b.id);
}
