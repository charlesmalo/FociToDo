# PR 3 — Postgres Storage

> Read `00-index.md` first. Branch: `feat/api-postgres`.

**Delivers:** SQL migrations (run by `node-pg-migrate`), the Postgres todo repository, idempotency store, unit of work and database probe, the `api-db` Vitest project with its migration global setup, and the contract suite running against real Postgres.

**Spec sections:** §5.1, §5.3, §6 (atomic writes), §9.1–9.2.

---

### Task 1: Migrations and the database test harness

**Files:**
- Create: `apps/api/migrations/1759190400000_create-todos.sql`, `apps/api/migrations/1759190400001_create-idempotency-keys.sql`
- Create: `apps/api/tests/support/testDatabase.ts`, `apps/api/tests/support/globalSetup.ts`
- Modify: `vitest.config.ts` (api-db project), `apps/api/package.json` (dependencies)
- Test: `apps/api/tests/migrations/schema.int.test.ts`

**Interfaces:**
- Produces: tables `todos`, `idempotency_keys`, migrations table `pgmigrations`; test helpers `testDatabaseUrl(): string`, `createTestPool(): Pool`, `resetDatabase(pool: Pool): Promise<void>`; Vitest project `api-db` (runs `*.int.test.ts` and `*.concurrency.test.ts` sequentially after applying migrations).

- [ ] **Step 1: Add dependencies**

Run: `dev npm install -w @foci/api pg@^8.23.1 node-pg-migrate@^9.0.0` then `dev npm install -w @foci/api -D @types/pg@^8.23.1`

- [ ] **Step 2: Write the migrations**

`apps/api/migrations/1759190400000_create-todos.sql`:
```sql
-- Up Migration
CREATE TABLE todos (
  id            uuid          PRIMARY KEY,
  title         varchar(200)  NOT NULL CHECK (length(btrim(title)) > 0),
  description   varchar(2000),
  due_date      date,
  is_completed  boolean       NOT NULL DEFAULT false,
  created_at    timestamptz   NOT NULL,
  version       integer       NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE INDEX todos_created_at_idx ON todos (created_at DESC, id);

-- Down Migration
DROP TABLE todos;
```

`apps/api/migrations/1759190400001_create-idempotency-keys.sql`:
```sql
-- Up Migration
CREATE TABLE idempotency_keys (
  key              varchar(255)  PRIMARY KEY,
  request_hash     varchar(64)   NOT NULL,
  response_status  smallint      NOT NULL,
  response_body    jsonb         NOT NULL,
  created_at       timestamptz   NOT NULL
);

-- Down Migration
DROP TABLE idempotency_keys;
```

(`request_hash` is `varchar(64)` rather than `char(64)` so values are never space-padded.)

- [ ] **Step 3: Create the test database helpers and global setup**

`apps/api/tests/support/testDatabase.ts`:
```ts
import pg from 'pg';

/** The test database URL; refuses anything whose database name does not end in `_test`. */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined) throw new Error('DATABASE_URL must point at the test database');
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run destructive tests against database "${name}"`);
  }
  return url;
}

export function createTestPool(): pg.Pool {
  return new pg.Pool({ connectionString: testDatabaseUrl(), max: 20 });
}

export async function resetDatabase(pool: pg.Pool): Promise<void> {
  await pool.query('TRUNCATE todos, idempotency_keys');
}
```

`apps/api/tests/support/globalSetup.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { testDatabaseUrl } from './testDatabase.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

async function waitForDatabase(connectionString: string): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const client = new pg.Client({ connectionString });
    try {
      await client.connect();
      await client.end();
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error('Test database did not become reachable');
}

/** Applies the production migrations to the test database once per run. */
export default async function setup(): Promise<void> {
  const databaseUrl = testDatabaseUrl();
  await waitForDatabase(databaseUrl);
  await runner({
    databaseUrl,
    dir: migrationsDir,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    count: Infinity,
    log: () => undefined,
  });
}
```

In `vitest.config.ts`, add to `projects`:
```ts
      {
        extends: true,
        test: {
          name: 'api-db',
          environment: 'node',
          include: ['apps/api/tests/**/*.int.test.ts', 'apps/api/tests/**/*.concurrency.test.ts'],
          globalSetup: ['apps/api/tests/support/globalSetup.ts'],
          // Files share one database: run them one after another; tests inside a file may still
          // issue concurrent requests on purpose.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
```

- [ ] **Step 4: Write the failing schema test (defence in depth)**

`apps/api/tests/migrations/schema.int.test.ts`:
```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPool, resetDatabase } from '../support/testDatabase.js';
import { todoId } from '../support/fakes.js';

const pool = createTestPool();

const insert = (title: string, description: string | null = null) =>
  pool.query(
    'INSERT INTO todos (id, title, description, created_at) VALUES ($1, $2, $3, now())',
    [todoId(1), title, description],
  );

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
```

- [ ] **Step 5: Run it to verify it fails, then passes once migrations exist**

Run: `dev npx vitest run --project api-db`
Expected before Step 2 files existed: FAIL (`relation "todos" does not exist`). With the migrations from Step 2 in place: PASS. (If you wrote the migrations first, temporarily rename the folder to observe the failure, then restore it.)

- [ ] **Step 6: Format, gate, commit**

Run: `dev npx prettier --write apps/api vitest.config.ts` then `docker compose --profile test run --rm --build test`.
```bash
git add apps/api vitest.config.ts package.json package-lock.json
git commit -F - <<'EOF'
feat(api): add SQL migrations and the Postgres test harness

Plain-SQL node-pg-migrate migrations with CHECK constraints mirroring
validation rules. DB tests run in their own Vitest project against the
RAM-backed db-test, migrated with the production runner, refusing any
database not named *_test.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Postgres todo repository and idempotency store

**Files:**
- Create: `apps/api/src/repository/postgres/rows.ts`, `PgTodoRepository.ts`, `PgIdempotencyStore.ts` (under `apps/api/src/repository/postgres/`)
- Test: covered by the contract suite in Task 3 (this task's commit includes Task 3's runner, see Step 3).

**Interfaces:**
- Consumes: ports from PR 2; `Todo`, `TodoPatch`.
- Produces: `type Queryable = Pool | PoolClient`; `class PgTodoRepository implements TodoRepository` (`constructor(db: Queryable)`); `class PgIdempotencyStore implements IdempotencyStore` (`constructor(db: Queryable)`); `TODO_COLUMNS`, `TodoRow`, `toTodo(row)`, `firstTodo(rows)`.

- [ ] **Step 1: Implement row mapping**

`apps/api/src/repository/postgres/rows.ts`:
```ts
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
```

- [ ] **Step 2: Implement the repository and the idempotency store**

`apps/api/src/repository/postgres/PgTodoRepository.ts`:
```ts
import type { ListTodosQuery, SortOrder, TodoSortField, TodoStatus } from '@foci/shared';
import type { Todo, TodoPatch } from '../../domain/todo.js';
import type { TodoRepository } from '../ports.js';
import { TODO_COLUMNS, firstTodo, toTodo, type Queryable, type TodoRow } from './rows.js';

const STATUS_FILTERS: Record<TodoStatus, string> = {
  all: 'TRUE',
  completed: 'is_completed',
  incomplete: 'NOT is_completed',
  overdue: 'NOT is_completed AND due_date < $1::date',
};

const SORT_EXPRESSIONS: Record<TodoSortField, string> = {
  createdAt: 'created_at',
  dueDate: 'due_date',
  title: 'lower(title) COLLATE "C"',
};

/** Primary order, then deterministic tie-breakers shared with the in-memory adapter. */
function orderBy(sort: TodoSortField, order: SortOrder): string {
  const direction = order === 'asc' ? 'ASC' : 'DESC';
  const nulls = sort === 'dueDate' ? ' NULLS LAST' : '';
  return `${SORT_EXPRESSIONS[sort]} ${direction}${nulls}, created_at DESC, id ASC`;
}

export class PgTodoRepository implements TodoRepository {
  constructor(private readonly db: Queryable) {}

  async create(todo: Todo): Promise<void> {
    await this.db.query(
      `INSERT INTO todos (id, title, description, due_date, is_completed, created_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        todo.id,
        todo.title,
        todo.description,
        todo.dueDate,
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

  async list(query: ListTodosQuery, today: string): Promise<Todo[]> {
    const values = query.status === 'overdue' ? [today] : [];
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
    if (patch.dueDate !== undefined) assign('due_date', patch.dueDate);
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
```

`apps/api/src/repository/postgres/PgIdempotencyStore.ts`:
```ts
import type { IdempotencyStore, StoredResponse } from '../ports.js';
import type { Queryable } from './rows.js';

interface StoredResponseRow {
  key: string;
  request_hash: string;
  response_status: number;
  response_body: unknown;
  created_at: Date;
}

export class PgIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: Queryable) {}

  async find(key: string, notBefore: Date): Promise<StoredResponse | null> {
    const { rows } = await this.db.query<StoredResponseRow>(
      `SELECT key, request_hash, response_status, response_body, created_at
       FROM idempotency_keys WHERE key = $1 AND created_at >= $2`,
      [key, notBefore],
    );
    const row = rows[0];
    return row === undefined
      ? null
      : {
          key: row.key,
          requestHash: row.request_hash,
          status: row.response_status,
          body: row.response_body,
          createdAt: row.created_at,
        };
  }

  /**
   * Inserts the record, or replaces an expired one. A concurrent claim for the same key blocks on
   * the primary key until the first transaction finishes, then sees the live record and updates
   * nothing — so exactly one caller wins.
   */
  async claim(record: StoredResponse, notBefore: Date): Promise<boolean> {
    const result = await this.db.query(
      `INSERT INTO idempotency_keys (key, request_hash, response_status, response_body, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (key) DO UPDATE SET
         request_hash = EXCLUDED.request_hash,
         response_status = EXCLUDED.response_status,
         response_body = EXCLUDED.response_body,
         created_at = EXCLUDED.created_at
       WHERE idempotency_keys.created_at < $6`,
      [
        record.key,
        record.requestHash,
        record.status,
        JSON.stringify(record.body),
        record.createdAt,
        notBefore,
      ],
    );
    return result.rowCount === 1;
  }
}
```

- [ ] **Step 3: Continue directly with Task 3** (the contract runner that tests this code is created there; commit both together).

---

### Task 3: Unit of work, probe, and the contract suite on Postgres

**Files:**
- Create: `apps/api/src/repository/postgres/PgUnitOfWork.ts`, `PgDatabaseProbe.ts`, `createPostgresStorage.ts` (under `apps/api/src/repository/postgres/`)
- Test: `apps/api/tests/repository/postgres/createPostgresStorage.int.test.ts`, `apps/api/tests/repository/postgres/PgUnitOfWork.test.ts`, `apps/api/tests/repository/postgres/PgDatabaseProbe.test.ts`, `apps/api/tests/repository/postgres/PgDatabaseProbe.int.test.ts`

**Interfaces:**
- Consumes: Task 2 classes; `Storage` from `repository/ports.ts` (PR 2).
- Produces: `class PgUnitOfWork implements UnitOfWork` (`constructor(pool: Pool)`); `class PgDatabaseProbe implements DatabaseProbe` (`constructor(pool: Pick<Pool, 'query'>)`); `createPostgresStorage(pool: Pool): Storage`.

- [ ] **Step 1: Write the failing tests**

`apps/api/tests/repository/postgres/createPostgresStorage.int.test.ts`:
```ts
import { afterAll } from 'vitest';
import { createPostgresStorage } from '../../../src/repository/postgres/createPostgresStorage.js';
import { createTestPool, resetDatabase } from '../../support/testDatabase.js';
import { describeRepositoryContract } from '../repository.contract.js';

const pool = createTestPool();
afterAll(() => pool.end());

describeRepositoryContract('postgres', async () => {
  await resetDatabase(pool);
  return createPostgresStorage(pool);
});
```

`apps/api/tests/repository/postgres/PgUnitOfWork.test.ts`:
```ts
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
```

`apps/api/tests/repository/postgres/PgDatabaseProbe.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PgDatabaseProbe } from '../../../src/repository/postgres/PgDatabaseProbe.js';

describe('PgDatabaseProbe', () => {
  it('reports no schema version when no migration has run', async () => {
    const pool = { query: async () => ({ rows: [] }) };
    await expect(new PgDatabaseProbe(pool as never).check()).resolves.toEqual({
      schemaVersion: null,
    });
  });

  it('propagates connection failures', async () => {
    const pool = {
      query: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    };
    await expect(new PgDatabaseProbe(pool as never).check()).rejects.toThrow('ECONNREFUSED');
  });
});
```

`apps/api/tests/repository/postgres/PgDatabaseProbe.int.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { PgDatabaseProbe } from '../../../src/repository/postgres/PgDatabaseProbe.js';
import { createTestPool } from '../../support/testDatabase.js';

const pool = createTestPool();
afterAll(() => pool.end());

describe('PgDatabaseProbe against Postgres', () => {
  it('reports the latest applied migration', async () => {
    await expect(new PgDatabaseProbe(pool).check()).resolves.toEqual({
      schemaVersion: '1759190400001_create-idempotency-keys',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dev npx vitest run apps/api/tests/repository/postgres`
Expected: FAIL — `createPostgresStorage.js`, `PgUnitOfWork.js`, `PgDatabaseProbe.js` not found.

- [ ] **Step 3: Implement**

`apps/api/src/repository/postgres/PgUnitOfWork.ts`:
```ts
import type { Pool } from 'pg';
import type { Repositories, UnitOfWork } from '../ports.js';
import { PgIdempotencyStore } from './PgIdempotencyStore.js';
import { PgTodoRepository } from './PgTodoRepository.js';

/** One transaction (READ COMMITTED) on a dedicated pooled client. */
export class PgUnitOfWork implements UnitOfWork {
  constructor(private readonly pool: Pool) {}

  async run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let clientIsBroken = false;
    try {
      await client.query('BEGIN');
      const result = await work({
        todos: new PgTodoRepository(client),
        idempotency: new PgIdempotencyStore(client),
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The connection is unusable; destroy it instead of returning it to the pool.
        clientIsBroken = true;
      }
      throw error;
    } finally {
      client.release(clientIsBroken);
    }
  }
}
```

`apps/api/src/repository/postgres/PgDatabaseProbe.ts`:
```ts
import type { Pool } from 'pg';
import type { DatabaseProbe, DatabaseStatus } from '../ports.js';

export class PgDatabaseProbe implements DatabaseProbe {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async check(): Promise<DatabaseStatus> {
    const { rows } = await this.pool.query<{ name: string }>(
      'SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1',
    );
    return { schemaVersion: rows[0]?.name ?? null };
  }
}
```

`apps/api/src/repository/postgres/createPostgresStorage.ts`:
```ts
import type { Pool } from 'pg';
import type { Storage } from '../ports.js';
import { PgIdempotencyStore } from './PgIdempotencyStore.js';
import { PgTodoRepository } from './PgTodoRepository.js';
import { PgUnitOfWork } from './PgUnitOfWork.js';

export function createPostgresStorage(pool: Pool): Storage {
  return {
    todos: new PgTodoRepository(pool),
    idempotency: new PgIdempotencyStore(pool),
    unitOfWork: new PgUnitOfWork(pool),
  };
}
```


- [ ] **Step 4: Run the tests to verify they pass**

Run: `dev npx vitest run apps/api/tests/repository`
Expected: PASS — the contract suite passes for **both** `in-memory` and `postgres`, plus the fake-client unit-of-work and probe tests.

- [ ] **Step 5: Format, gate, commit (includes Task 2)**

Run: `dev npx prettier --write apps/api` then `docker compose --profile test run --rm --build test` (100%).
```bash
git add apps/api
git commit -F - <<'EOF'
feat(api): add Postgres storage passing the repository contract

Single-statement writes with optimistic version checks, conditional
completion updates that bump the version only on change, a claim-first
idempotency upsert that replaces expired keys, a READ COMMITTED unit of
work that destroys broken clients, and a schema-version probe.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Then follow the per-PR procedure. PR title: `feat(api): Postgres storage and migrations`.
