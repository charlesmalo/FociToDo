import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPool, resetDatabase } from '../support/testDatabase.js';
import { todoId } from '../support/fakes.js';

const pool = createTestPool();

const insert = (title: string, description: string | null = null) =>
  pool.query('INSERT INTO todos (id, title, description, created_at) VALUES ($1, $2, $3, now())', [
    todoId(1),
    title,
    description,
  ]);

describe('database schema', () => {
  beforeEach(() => resetDatabase(pool));
  afterAll(() => pool.end());

  it('accepts a valid row with defaults', async () => {
    await insert('Buy milk');
    const { rows } = await pool.query('SELECT is_completed, version FROM todos');
    expect(rows).toEqual([{ is_completed: false, version: 1 }]);
  });

  it('rejects a blank title', async () => {
    await expect(insert('   ')).rejects.toThrow(/check constraint/);
  });

  it('rejects a title longer than 200 characters', async () => {
    await expect(insert('a'.repeat(201))).rejects.toThrow(/too long/);
  });

  it('rejects a description longer than 2000 characters', async () => {
    await expect(insert('x', 'd'.repeat(2001))).rejects.toThrow(/too long/);
  });

  it('rejects a non-positive version', async () => {
    await insert('x');
    await expect(pool.query('UPDATE todos SET version = 0')).rejects.toThrow(/check constraint/);
  });
});
