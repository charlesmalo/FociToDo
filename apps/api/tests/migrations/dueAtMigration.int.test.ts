import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestPool, resetDatabase, testDatabaseUrl } from '../support/testDatabase.js';
import { todoId } from '../support/fakes.js';

const pool = createTestPool();
const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));
const silentLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

const migrate = (direction: 'up' | 'down', count: number) =>
  runner({
    databaseUrl: testDatabaseUrl(),
    dir: migrationsDir,
    direction,
    migrationsTable: 'pgmigrations',
    count,
    logger: silentLogger,
  });

const cacheBody = (dueDate: string | null) => ({
  id: todoId(1),
  title: 'Cached',
  dueDate,
  isOverdue: false,
});

const bodyOf = async (key: string): Promise<unknown> =>
  (await pool.query('SELECT response_body FROM idempotency_keys WHERE key = $1', [key])).rows[0]
    .response_body;

describe('due-at-instants migration', () => {
  // The database must end at the latest migration whatever happens in the test.
  afterAll(async () => {
    try {
      await migrate('up', Infinity);
      await resetDatabase(pool);
    } finally {
      await pool.end();
    }
  });

  it('backfills deadlines and cached responses forwards and restores them backwards', async () => {
    await resetDatabase(pool);
    await migrate('down', 1);
    await pool.query(
      `INSERT INTO todos (id, title, due_date, created_at) VALUES
         ($1, 'dated', '2026-10-01', now()), ($2, 'undated', NULL, now())`,
      [todoId(1), todoId(2)],
    );
    const original = [cacheBody('2026-10-01'), cacheBody(null)];
    await pool.query(
      `INSERT INTO idempotency_keys (key, request_hash, response_status, response_body, created_at)
       VALUES ('dated', 'h', 201, $1::jsonb, now()), ('undated', 'h', 201, $2::jsonb, now()),
              ('other', 'h', 400, '{"error":"x"}'::jsonb, now())`,
      original.map((body) => JSON.stringify(body)),
    );

    await migrate('up', 1);
    const todos = await pool.query(`SELECT title, due_at FROM todos ORDER BY title`);
    expect(todos.rows).toEqual([
      { title: 'dated', due_at: new Date('2026-10-01T23:59:59.000Z') },
      { title: 'undated', due_at: null },
    ]);
    expect(await bodyOf('dated')).toEqual({
      id: todoId(1),
      title: 'Cached',
      dueAt: '2026-10-01T23:59:59.000Z',
      isOverdue: false,
      isDueSoon: false,
    });
    expect(await bodyOf('undated')).toEqual({
      id: todoId(1),
      title: 'Cached',
      dueAt: null,
      isOverdue: false,
      isDueSoon: false,
    });
    expect(await bodyOf('other')).toEqual({ error: 'x' });

    await migrate('down', 1);
    const restored = await pool.query(
      `SELECT title, to_char(due_date, 'YYYY-MM-DD') AS due_date FROM todos ORDER BY title`,
    );
    expect(restored.rows).toEqual([
      { title: 'dated', due_date: '2026-10-01' },
      { title: 'undated', due_date: null },
    ]);
    expect(await bodyOf('dated')).toEqual(original[0]);
    expect(await bodyOf('undated')).toEqual(original[1]);
    expect(await bodyOf('other')).toEqual({ error: 'x' });

    await migrate('up', 1);
  });

  it('maps instants back to their UTC calendar date, not a local one', async () => {
    await resetDatabase(pool);
    await migrate('up', Infinity);
    await pool.query(
      `INSERT INTO todos (id, title, due_at, created_at) VALUES
         ($1, 'midday', '2026-10-01T05:30:00Z', now()),
         ($2, 'late evening', '2026-10-01T23:30:00-04:00', now())`,
      [todoId(1), todoId(2)],
    );

    await migrate('down', 1);
    const restored = await pool.query(
      `SELECT title, to_char(due_date, 'YYYY-MM-DD') AS due_date FROM todos ORDER BY title`,
    );
    // 23:30 in New York on 10-01 is already 03:30 UTC on 10-02: the UTC date wins.
    expect(restored.rows).toEqual([
      { title: 'late evening', due_date: '2026-10-02' },
      { title: 'midday', due_date: '2026-10-01' },
    ]);

    await migrate('up', 1);
  });
});
