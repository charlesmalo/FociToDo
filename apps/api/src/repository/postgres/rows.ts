import type { Pool, PoolClient } from 'pg';
import type { Todo } from '../../domain/todo.js';

export type Queryable = Pool | PoolClient;

/** `due_date` is selected as text so it never passes through a JS Date (no timezone shift). */
export const TODO_COLUMNS = `id, title, description, to_char(due_date, 'YYYY-MM-DD') AS due_date,
  is_completed, created_at, version`;

export interface TodoRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  is_completed: boolean;
  created_at: Date;
  version: number;
}

export function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    isCompleted: row.is_completed,
    createdAt: row.created_at,
    version: row.version,
  };
}

export function firstTodo(rows: TodoRow[]): Todo | null {
  const row = rows[0];
  return row === undefined ? null : toTodo(row);
}
