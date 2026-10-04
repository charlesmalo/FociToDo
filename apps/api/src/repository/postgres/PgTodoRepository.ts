import type { ListTodosQuery, SortOrder, TodoSortField, TodoStatus } from '@foci/shared';
import type { Todo, TodoPatch } from '../../domain/todo.js';
import type { TodoRepository } from '../ports.js';
import { TODO_COLUMNS, firstTodo, toTodo, type Queryable, type TodoRow } from './rows.js';

const STATUS_FILTERS: Record<TodoStatus, string> = {
  all: 'TRUE',
  completed: 'is_completed',
  incomplete: 'NOT is_completed',
  overdue: 'NOT is_completed AND due_at < $1::timestamptz',
  'due-soon': `NOT is_completed AND due_at >= $1::timestamptz
    AND due_at < $1::timestamptz + interval '24 hours'`,
};

const SORT_EXPRESSIONS: Record<TodoSortField, string> = {
  createdAt: 'created_at',
  dueAt: 'due_at',
  title: 'lower(title) COLLATE "C"',
};

/** Primary order, then deterministic tie-breakers shared with the in-memory adapter. */
function orderBy(sort: TodoSortField, order: SortOrder): string {
  const direction = order === 'asc' ? 'ASC' : 'DESC';
  const nulls = sort === 'dueAt' ? ' NULLS LAST' : '';
  return `${SORT_EXPRESSIONS[sort]} ${direction}${nulls}, created_at DESC, id ASC`;
}

export class PgTodoRepository implements TodoRepository {
  constructor(private readonly db: Queryable) {}

  async create(todo: Todo): Promise<void> {
    await this.db.query(
      `INSERT INTO todos (id, title, description, due_at, is_completed, created_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        todo.id,
        todo.title,
        todo.description,
        todo.dueAt,
        todo.isCompleted,
        todo.createdAt,
        todo.version,
      ],
    );
  }

  async findById(id: string): Promise<Todo | null> {
    const { rows } = await this.db.query<TodoRow>(
      `SELECT ${TODO_COLUMNS} FROM todos WHERE id = $1`,
      [id],
    );
    return firstTodo(rows);
  }

  // Returns the whole filtered list by design; pagination is deferred (ADR 0019).
  async list(query: ListTodosQuery, now: Date): Promise<Todo[]> {
    const values = query.status === 'overdue' || query.status === 'due-soon' ? [now] : [];
    const { rows } = await this.db.query<TodoRow>(
      `SELECT ${TODO_COLUMNS} FROM todos WHERE ${STATUS_FILTERS[query.status]}
       ORDER BY ${orderBy(query.sort, query.order)}`,
      values,
    );
    return rows.map(toTodo);
  }

  async update(id: string, expectedVersion: number, patch: TodoPatch): Promise<Todo | null> {
    const values: unknown[] = [id, expectedVersion];
    const assignments: string[] = [];
    const assign = (column: string, value: unknown): void => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };
    if (patch.title !== undefined) assign('title', patch.title);
    if (patch.description !== undefined) assign('description', patch.description);
    if (patch.dueAt !== undefined) assign('due_at', patch.dueAt);
    assignments.push('version = version + 1');
    const { rows } = await this.db.query<TodoRow>(
      `UPDATE todos SET ${assignments.join(', ')}
       WHERE id = $1 AND version = $2
       RETURNING ${TODO_COLUMNS}`,
      values,
    );
    return firstTodo(rows);
  }

  async setCompleted(id: string, completed: boolean): Promise<Todo | null> {
    const { rows } = await this.db.query<TodoRow>(
      `UPDATE todos SET is_completed = $2, version = version + 1
       WHERE id = $1 AND is_completed <> $2
       RETURNING ${TODO_COLUMNS}`,
      [id, completed],
    );
    // No row changed: either it is already in the requested state, or it does not exist.
    return firstTodo(rows) ?? this.findById(id);
  }

  async delete(id: string, expectedVersion: number): Promise<boolean> {
    const result = await this.db.query('DELETE FROM todos WHERE id = $1 AND version = $2', [
      id,
      expectedVersion,
    ]);
    return result.rowCount === 1;
  }
}
