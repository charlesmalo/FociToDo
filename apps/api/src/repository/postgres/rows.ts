import type { Pool, PoolClient } from 'pg';
import type { Todo } from '../../domain/todo.js';

export type Queryable = Pool | PoolClient;

export const TODO_COLUMNS = 'id, title, description, due_at, is_completed, created_at, version';

export interface TodoRow {
  id: string;
  title: string;
  description: string | null;
  due_at: Date | null;
  is_completed: boolean;
  created_at: Date;
  version: number;
}

export function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueAt: row.due_at,
    isCompleted: row.is_completed,
    createdAt: row.created_at,
    version: row.version,
  };
}

export function firstTodo(rows: TodoRow[]): Todo | null {
  const row = rows[0];
  return row === undefined ? null : toTodo(row);
}
