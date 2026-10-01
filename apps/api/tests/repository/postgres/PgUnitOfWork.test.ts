import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { PgUnitOfWork } from '../../../src/repository/postgres/PgUnitOfWork.js';

/** A fake pg client that records SQL and can fail on a chosen statement. */
function fakePool(failOn?: string) {
  const statements: string[] = [];
  const release = vi.fn();
  const client = {
    query: vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql === failOn) throw new Error(`${sql} failed`);
      return { rows: [], rowCount: 0 };
    }),
    release,
  };
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, statements, release };
}

describe('PgUnitOfWork', () => {
  it('wraps the work in BEGIN/COMMIT and releases the client', async () => {
    const { pool, statements, release } = fakePool();
    await expect(new PgUnitOfWork(pool).run(async () => 'ok')).resolves.toBe('ok');
    expect(statements).toEqual(['BEGIN', 'COMMIT']);
    expect(release).toHaveBeenCalledWith(false);
  });

  it('rolls back and rethrows when the work fails', async () => {
    const { pool, statements, release } = fakePool();
    const failure = new Error('work failed');
    await expect(
      new PgUnitOfWork(pool).run(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(statements).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledWith(false);
  });

  it('destroys the client when the rollback itself fails, keeping the original error', async () => {
    const { pool, release } = fakePool('ROLLBACK');
    const failure = new Error('work failed');
    await expect(
      new PgUnitOfWork(pool).run(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(release).toHaveBeenCalledWith(true);
  });
});
