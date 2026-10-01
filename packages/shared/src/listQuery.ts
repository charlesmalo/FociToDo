import { z } from 'zod';

export const TODO_STATUSES = ['all', 'completed', 'incomplete', 'overdue'] as const;
export const TODO_SORT_FIELDS = ['createdAt', 'dueDate', 'title'] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];
export type TodoSortField = (typeof TODO_SORT_FIELDS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

export const ListTodosQuerySchema = z.strictObject({
  status: z.enum(TODO_STATUSES).default('all'),
  sort: z.enum(TODO_SORT_FIELDS).default('createdAt'),
  order: z.enum(SORT_ORDERS).default('desc'),
});

export type ListTodosQuery = z.output<typeof ListTodosQuerySchema>;

export const DEFAULT_LIST_QUERY: ListTodosQuery = ListTodosQuerySchema.parse({});
