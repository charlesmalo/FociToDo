import { describe, expect, it } from 'vitest';
import { DEFAULT_LIST_QUERY, ListTodosQuerySchema } from '../src/listQuery.js';

describe('ListTodosQuerySchema', () => {
  it('applies defaults', () => {
    expect(ListTodosQuerySchema.parse({})).toEqual({
      status: 'all',
      sort: 'createdAt',
      order: 'desc',
    });
    expect(DEFAULT_LIST_QUERY).toEqual({ status: 'all', sort: 'createdAt', order: 'desc' });
  });

  it('accepts every documented combination', () => {
    expect(
      ListTodosQuerySchema.parse({ status: 'overdue', sort: 'dueDate', order: 'asc' }),
    ).toEqual({ status: 'overdue', sort: 'dueDate', order: 'asc' });
  });

  it.each([
    [{ status: 'done' }, 'status'],
    [{ sort: 'priority' }, 'sort'],
    [{ order: 'up' }, 'order'],
  ])('rejects unknown values %j', (query, field) => {
    const result = ListTodosQuerySchema.safeParse(query);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });

  it('rejects a repeated parameter (array value)', () => {
    expect(ListTodosQuerySchema.safeParse({ status: ['all', 'completed'] }).success).toBe(false);
  });

  it('rejects unknown parameters', () => {
    const result = ListTodosQuerySchema.safeParse({ page: '2' });
    expect(result.error?.issues[0]).toEqual(
      expect.objectContaining({ code: 'unrecognized_keys', keys: ['page'] }),
    );
  });
});
