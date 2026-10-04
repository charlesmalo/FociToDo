import { afterAll, describe, expect, it } from 'vitest';
import { createTestPool, resetDatabase } from '../support/testDatabase.js';
import { todoId } from '../support/fakes.js';
import { migrate, migrateDownThrough } from '../support/migrations.js';

const pool = createTestPool();

const bodyOf = async (key: string): Promise<unknown> =>
  (await pool.query('SELECT response_body FROM idempotency_keys WHERE key = $1', [key])).rows[0]
    .response_body;

describe('due-date-in-cached-responses migration', () => {
  // The database must end at the latest migration whatever happens in the test.
  afterAll(async () => {
    try {
      await migrate('up', Infinity);
      await resetDatabase(pool);
    } finally {
      await pool.end();
    }
  });

  it('adds dueDate to cached bodies forwards and removes it backwards', async () => {
    await resetDatabase(pool);
    await migrateDownThrough(pool, '1759190400003_due-date-in-cached-responses');
    const dated = {
      id: todoId(1),
      title: 'Cached',
      dueAt: '2026-10-01T23:59:59.000Z',
      isDueSoon: false,
    };
    const undated = { id: todoId(2), title: 'Cached', dueAt: null, isDueSoon: false };
    await pool.query(
      `INSERT INTO idempotency_keys (key, request_hash, response_status, response_body, created_at)
       VALUES ('dated', 'h', 201, $1::jsonb, now()), ('undated', 'h', 201, $2::jsonb, now()),
              ('other', 'h', 400, '{"error":"x"}'::jsonb, now())`,
      [JSON.stringify(dated), JSON.stringify(undated)],
    );

    await migrate('up', 1);
    expect(await bodyOf('dated')).toEqual({ ...dated, dueDate: '2026-10-01' });
    expect(await bodyOf('undated')).toEqual({ ...undated, dueDate: null });
    expect(await bodyOf('other')).toEqual({ error: 'x' });

    await migrate('down', 1);
    expect(await bodyOf('dated')).toEqual(dated);
    expect(await bodyOf('undated')).toEqual(undated);
    expect(await bodyOf('other')).toEqual({ error: 'x' });
  });
});
