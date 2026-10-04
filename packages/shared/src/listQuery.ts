import { z } from 'zod';

export const TODO_STATUSES = ['all', 'completed', 'incomplete', 'overdue', 'due-soon'] as const;
export const TODO_SORT_FIELDS = ['createdAt', 'dueAt', 'title'] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];
export type TodoSortField = (typeof TODO_SORT_FIELDS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

export const ListTodosQuerySchema = z.strictObject({
  status: z
    .enum(TODO_STATUSES)
    .describe(
      'Which todos to list: all; completed; incomplete; overdue (incomplete, deadline in the past); due-soon (incomplete, deadline within the next 24 hours).',
    )
    .default('all'),
  sort: z
    .enum([...TODO_SORT_FIELDS, 'dueDate'])
    .default('createdAt')
    .describe("createdAt, dueAt or title; dueDate is accepted as the brief's name for dueAt.")
    .transform((sort): TodoSortField => (sort === 'dueDate' ? 'dueAt' : sort)),
  order: z.enum(SORT_ORDERS).default('desc'),
});

export type ListTodosQuery = z.output<typeof ListTodosQuerySchema>;

export const DEFAULT_LIST_QUERY: ListTodosQuery = ListTodosQuerySchema.parse({});
