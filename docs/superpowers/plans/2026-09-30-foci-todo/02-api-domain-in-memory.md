# PR 2 — API Domain & In-Memory Storage

> Read `00-index.md` first. Branch: `feat/api-domain-in-memory`.

**Delivers:** the `@foci/api` workspace, the pure domain layer (todo rules, errors, clock and id ports), the repository ports, the in-memory adapters, and the **repository contract suite** that every adapter must pass.

**Spec sections:** §4.3–4.4, §5.2, §5.3, §9.1 (contract layer).

---

### Task 1: API workspace and domain layer

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`
- Create: `apps/api/src/domain/todo.ts`, `apps/api/src/domain/clock.ts`, `apps/api/src/domain/ids.ts`, `apps/api/src/domain/errors.ts`
- Create: `apps/api/tests/support/fakes.ts`, `apps/api/tests/support/todoFactory.ts`
- Modify: `Dockerfile` (deps stage), `vitest.config.ts` (api-unit project)
- Test: `apps/api/tests/domain/todo.test.ts`, `apps/api/tests/domain/clock.test.ts`, `apps/api/tests/domain/ids.test.ts`, `apps/api/tests/domain/errors.test.ts`

**Interfaces:**
- Consumes: `TodoView` from `@foci/shared`.
- Produces:
  - `interface Todo { id: string; title: string; description: string | null; dueDate: string | null; isCompleted: boolean; createdAt: Date; version: number }`
  - `interface TodoPatch { title?: string; description?: string | null; dueDate?: string | null }`
  - `isOverdue(todo: Todo, today: string): boolean`, `toView(todo: Todo, today: string): TodoView`
  - `interface Clock { now(): Date }`, `systemClock: Clock`, `utcDate(instant: Date): string`
  - `interface IdGenerator { next(): string }`, `uuidGenerator: IdGenerator`
  - `TodoNotFoundError(todoId)`, `VersionConflictError(todoId)`, `PreconditionRequiredError()`, `IdempotencyKeyReuseError(key)` — each `extends Error` with a matching `name`.
  - Test support: `FixedClock` (`now()`, `set(date)`, `advance(ms)`), `SequentialIds` (`next()` → `00000000-0000-4000-8000-000000000001`, …), `todoId(n: number): string`, `makeTodo(overrides?: Partial<Todo>): Todo`.

- [ ] **Step 1: Create the workspace**

`apps/api/package.json`:
```json
{
  "name": "@foci/api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@foci/shared": "*"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"],
    "customConditions": ["@foci/source"]
  },
  "include": ["src", "tests"]
}
```

`apps/api/tsconfig.build.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": false,
    "types": ["node"]
  },
  "include": ["src"]
}
```

In `Dockerfile`, in the `deps` stage, add after the shared manifest line:
```dockerfile
COPY apps/api/package.json apps/api/
```

In `vitest.config.ts`, add to `projects`:
```ts
      {
        extends: true,
        test: {
          name: 'api-unit',
          environment: 'node',
          include: ['apps/api/tests/**/*.test.ts'],
          exclude: ['apps/api/tests/**/*.int.test.ts', 'apps/api/tests/**/*.concurrency.test.ts'],
        },
      },
```

Run: `dev npm install` (links the new workspace and updates `package-lock.json`).

- [ ] **Step 2: Create test support**

`apps/api/tests/support/fakes.ts`:
```ts
import type { Clock } from '../../src/domain/clock.js';
import type { IdGenerator } from '../../src/domain/ids.js';

/** Deterministic clock for tests. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(initial: Date | string = '2026-09-30T12:00:00.000Z') {
    this.current = new Date(initial);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(instant: Date | string): void {
    this.current = new Date(instant);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

/** Valid, predictable UUIDs: todoId(1) = 00000000-0000-4000-8000-000000000001. */
export function todoId(sequence: number): string {
  return `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
}

export class SequentialIds implements IdGenerator {
  private sequence = 0;

  next(): string {
    this.sequence += 1;
    return todoId(this.sequence);
  }
}
```

`apps/api/tests/support/todoFactory.ts`:
```ts
import type { Todo } from '../../src/domain/todo.js';
import { todoId } from './fakes.js';

let sequence = 1000;

export function makeTodo(overrides: Partial<Todo> = {}): Todo {
  sequence += 1;
  return {
    id: todoId(sequence),
    title: `Task ${sequence}`,
    description: null,
    dueDate: null,
    isCompleted: false,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    version: 1,
    ...overrides,
  };
}
```

- [ ] **Step 3: Write the failing domain tests**

`apps/api/tests/domain/todo.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isOverdue, toView } from '../../src/domain/todo.js';
import { makeTodo } from '../support/todoFactory.js';

const TODAY = '2026-09-30';

describe('isOverdue', () => {
  it('is true for an incomplete todo due before today', () => {
    expect(isOverdue(makeTodo({ dueDate: '2026-09-29' }), TODAY)).toBe(true);
  });

  it('is false for a todo due today', () => {
    expect(isOverdue(makeTodo({ dueDate: TODAY }), TODAY)).toBe(false);
  });

  it('is false for a completed todo even when past due', () => {
    expect(isOverdue(makeTodo({ dueDate: '2026-01-01', isCompleted: true }), TODAY)).toBe(false);
  });

  it('is false without a due date', () => {
    expect(isOverdue(makeTodo({ dueDate: null }), TODAY)).toBe(false);
  });
});

describe('toView', () => {
  it('serialises every field and derives isOverdue', () => {
    const todo = makeTodo({
      title: 'File taxes',
      description: 'Receipts in the blue folder',
      dueDate: '2026-09-01',
      createdAt: new Date('2026-08-15T09:30:00.000Z'),
      version: 4,
    });
    expect(toView(todo, TODAY)).toEqual({
      id: todo.id,
      title: 'File taxes',
      description: 'Receipts in the blue folder',
      dueDate: '2026-09-01',
      isCompleted: false,
      createdAt: '2026-08-15T09:30:00.000Z',
      version: 4,
      isOverdue: true,
    });
  });
});
```

`apps/api/tests/domain/clock.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { systemClock, utcDate } from '../../src/domain/clock.js';

describe('systemClock', () => {
  it('returns the current instant', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe('utcDate', () => {
  it('returns the UTC calendar date', () => {
    expect(utcDate(new Date('2026-09-30T12:00:00.000Z'))).toBe('2026-09-30');
  });

  it('uses UTC, not the local offset, near midnight', () => {
    expect(utcDate(new Date('2026-09-30T23:30:00-04:00'))).toBe('2026-10-01');
  });
});
```

`apps/api/tests/domain/ids.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { TodoIdSchema } from '@foci/shared';
import { uuidGenerator } from '../../src/domain/ids.js';

describe('uuidGenerator', () => {
  it('generates distinct valid UUIDs', () => {
    const first = uuidGenerator.next();
    const second = uuidGenerator.next();
    expect(TodoIdSchema.parse(first)).toBe(first);
    expect(second).not.toBe(first);
  });
});
```

`apps/api/tests/domain/errors.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  IdempotencyKeyReuseError,
  PreconditionRequiredError,
  TodoNotFoundError,
  VersionConflictError,
} from '../../src/domain/errors.js';

describe('domain errors', () => {
  it.each([
    [new TodoNotFoundError('abc'), 'TodoNotFoundError', 'Todo abc was not found'],
    [new VersionConflictError('abc'), 'VersionConflictError', 'Todo abc was modified by another request'],
    [new PreconditionRequiredError(), 'PreconditionRequiredError', 'If-Match header is required'],
    [
      new IdempotencyKeyReuseError('k1'),
      'IdempotencyKeyReuseError',
      'Idempotency-Key k1 was already used with a different request',
    ],
  ])('%s has a stable name and message', (error, name, message) => {
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
    expect(error.message).toBe(message);
  });

  it('keeps the identifiers for error mapping', () => {
    expect(new TodoNotFoundError('abc').todoId).toBe('abc');
    expect(new VersionConflictError('abc').todoId).toBe('abc');
    expect(new IdempotencyKeyReuseError('k1').key).toBe('k1');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `dev npx vitest run --project api-unit`
Expected: FAIL — `Cannot find module '../../src/domain/todo.js'` (and the other domain modules).

- [ ] **Step 5: Implement the domain layer**

`apps/api/src/domain/todo.ts`:
```ts
import type { TodoView } from '@foci/shared';

export interface Todo {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  isCompleted: boolean;
  createdAt: Date;
  version: number;
}

/** Fields an update may change: absent fields are untouched, `null` clears an optional field. */
export interface TodoPatch {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
}

/** Overdue is derived, never stored: incomplete and due strictly before `today` (YYYY-MM-DD, UTC). */
export function isOverdue(todo: Todo, today: string): boolean {
  return !todo.isCompleted && todo.dueDate !== null && todo.dueDate < today;
}

export function toView(todo: Todo, today: string): TodoView {
  return {
    id: todo.id,
    title: todo.title,
    description: todo.description,
    dueDate: todo.dueDate,
    isCompleted: todo.isCompleted,
    createdAt: todo.createdAt.toISOString(),
    version: todo.version,
    isOverdue: isOverdue(todo, today),
  };
}
```

`apps/api/src/domain/clock.ts`:
```ts
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Calendar date (YYYY-MM-DD) of an instant in UTC. */
export function utcDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}
```

`apps/api/src/domain/ids.ts`:
```ts
import { randomUUID } from 'node:crypto';

export interface IdGenerator {
  next(): string;
}

export const uuidGenerator: IdGenerator = {
  next: () => randomUUID(),
};
```

`apps/api/src/domain/errors.ts`:
```ts
export class TodoNotFoundError extends Error {
  override readonly name = 'TodoNotFoundError';

  constructor(readonly todoId: string) {
    super(`Todo ${todoId} was not found`);
  }
}

export class VersionConflictError extends Error {
  override readonly name = 'VersionConflictError';

  constructor(readonly todoId: string) {
    super(`Todo ${todoId} was modified by another request`);
  }
}

export class PreconditionRequiredError extends Error {
  override readonly name = 'PreconditionRequiredError';

  constructor() {
    super('If-Match header is required');
  }
}

export class IdempotencyKeyReuseError extends Error {
  override readonly name = 'IdempotencyKeyReuseError';

  constructor(readonly key: string) {
    super(`Idempotency-Key ${key} was already used with a different request`);
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dev npx vitest run --project api-unit`
Expected: PASS.

- [ ] **Step 7: Format, gate, commit**

Run: `dev npx prettier --write apps/api vitest.config.ts` then `docker compose --profile test run --rm --build test` (100%).
```bash
git add apps/api Dockerfile vitest.config.ts package-lock.json package.json
git commit -F - <<'EOF'
feat(api): add domain model, errors and clock/id ports

Todo entity with derived UTC overdue flag and view mapping, HTTP-agnostic
domain errors, and injectable Clock/IdGenerator ports for deterministic
tests.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Repository ports and in-memory ordering rules

**Files:**
- Create: `apps/api/src/repository/ports.ts`, `apps/api/src/repository/in-memory/ordering.ts`
- Test: `apps/api/tests/repository/in-memory/ordering.test.ts`

**Interfaces:**
- Consumes: `Todo`, `TodoPatch`, `isOverdue` (Task 1); `ListTodosQuery`, `TodoStatus`, `TodoSortField`, `SortOrder` from `@foci/shared`.
- Produces:
  - `interface TodoRepository { create(todo: Todo): Promise<void>; findById(id: string): Promise<Todo | null>; list(query: ListTodosQuery, today: string): Promise<Todo[]>; update(id: string, expectedVersion: number, patch: TodoPatch): Promise<Todo | null>; setCompleted(id: string, completed: boolean): Promise<Todo | null>; delete(id: string, expectedVersion: number): Promise<boolean> }`
  - `interface StoredResponse { key: string; requestHash: string; status: number; body: unknown; createdAt: Date }`
  - `interface IdempotencyStore { find(key: string, notBefore: Date): Promise<StoredResponse | null>; claim(record: StoredResponse, notBefore: Date): Promise<boolean> }`
  - `interface Repositories { todos: TodoRepository; idempotency: IdempotencyStore }`
  - `interface UnitOfWork { run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> }`
  - `interface Storage { todos: TodoRepository; idempotency: IdempotencyStore; unitOfWork: UnitOfWork }`
  - `interface DatabaseStatus { schemaVersion: string | null }`, `interface DatabaseProbe { check(): Promise<DatabaseStatus> }` (throws when the database is unreachable)
  - `compareCodePoints(a: string, b: string): number`, `matchesStatus(status: TodoStatus, today: string): (todo: Todo) => boolean`, `compareTodos(sort: TodoSortField, order: SortOrder): (a: Todo, b: Todo) => number`

- [ ] **Step 1: Write the ports (types only, no behaviour to test)**

`apps/api/src/repository/ports.ts`:
```ts
import type { ListTodosQuery } from '@foci/shared';
import type { Todo, TodoPatch } from '../domain/todo.js';

export interface TodoRepository {
  create(todo: Todo): Promise<void>;
  findById(id: string): Promise<Todo | null>;
  /** Filters and sorts in storage; `today` (YYYY-MM-DD, UTC) defines "overdue". */
  list(query: ListTodosQuery, today: string): Promise<Todo[]>;
  /** Applies the patch only if the stored version equals `expectedVersion`; bumps the version. `null` = no row updated. */
  update(id: string, expectedVersion: number, patch: TodoPatch): Promise<Todo | null>;
  /** Sets the flag; bumps the version only when the value actually changes. `null` = not found. */
  setCompleted(id: string, completed: boolean): Promise<Todo | null>;
  /** Deletes only if the stored version equals `expectedVersion`. */
  delete(id: string, expectedVersion: number): Promise<boolean>;
}

export interface StoredResponse {
  key: string;
  requestHash: string;
  status: number;
  body: unknown;
  createdAt: Date;
}

export interface IdempotencyStore {
  /** Returns the record only if it was created at or after `notBefore` (not expired). */
  find(key: string, notBefore: Date): Promise<StoredResponse | null>;
  /** Stores the record unless a live (non-expired) record exists; returns whether it was stored. */
  claim(record: StoredResponse, notBefore: Date): Promise<boolean>;
}

export interface Repositories {
  todos: TodoRepository;
  idempotency: IdempotencyStore;
}

export interface UnitOfWork {
  /** Runs `work` atomically: all writes commit together or none do. */
  run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T>;
}

/** Everything a storage adapter provides; each adapter has a factory returning one. */
export interface Storage {
  todos: TodoRepository;
  idempotency: IdempotencyStore;
  unitOfWork: UnitOfWork;
}

export interface DatabaseStatus {
  schemaVersion: string | null;
}

export interface DatabaseProbe {
  /** Resolves with the applied schema version; rejects when the database is unreachable. */
  check(): Promise<DatabaseStatus>;
}
```

- [ ] **Step 2: Write the failing ordering tests**

`apps/api/tests/repository/in-memory/ordering.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  compareCodePoints,
  compareTodos,
  matchesStatus,
} from '../../../src/repository/in-memory/ordering.js';
import { todoId } from '../../support/fakes.js';
import { makeTodo } from '../../support/todoFactory.js';

describe('compareCodePoints', () => {
  it('orders by Unicode code point, like Postgres COLLATE "C"', () => {
    expect(compareCodePoints('apple', 'banana')).toBeLessThan(0);
    expect(compareCodePoints('banana', 'éclair')).toBeLessThan(0);
    expect(compareCodePoints('same', 'same')).toBe(0);
  });

  it('orders a prefix first', () => {
    expect(compareCodePoints('app', 'apple')).toBeLessThan(0);
    expect(compareCodePoints('apple', 'app')).toBeGreaterThan(0);
  });

  it('compares astral characters by code point, not UTF-16 unit', () => {
    // U+FFFD is below U+1F600, but its UTF-16 unit is above the surrogate 0xD83D.
    expect(compareCodePoints('�', '😀')).toBeLessThan(0);
  });
});

describe('matchesStatus', () => {
  const today = '2026-09-30';
  const done = makeTodo({ isCompleted: true, dueDate: '2026-09-01' });
  const late = makeTodo({ dueDate: '2026-09-29' });
  const dueToday = makeTodo({ dueDate: today });
  const undated = makeTodo();
  const all = [done, late, dueToday, undated];

  it.each([
    ['all', [done, late, dueToday, undated]],
    ['completed', [done]],
    ['incomplete', [late, dueToday, undated]],
    ['overdue', [late]],
  ] as const)('filters %s', (status, expected) => {
    expect(all.filter(matchesStatus(status, today))).toEqual(expected);
  });
});

describe('compareTodos', () => {
  const at = (iso: string) => new Date(iso);

  it('sorts by createdAt in both directions', () => {
    const older = makeTodo({ createdAt: at('2026-09-01T00:00:00Z') });
    const newer = makeTodo({ createdAt: at('2026-09-02T00:00:00Z') });
    expect([newer, older].sort(compareTodos('createdAt', 'asc'))).toEqual([older, newer]);
    expect([older, newer].sort(compareTodos('createdAt', 'desc'))).toEqual([newer, older]);
  });

  it('sorts titles case-insensitively, breaking ties by newest first', () => {
    const upper = makeTodo({ title: 'Apple', createdAt: at('2026-09-01T00:00:00Z') });
    const lower = makeTodo({ title: 'apple', createdAt: at('2026-09-02T00:00:00Z') });
    const banana = makeTodo({ title: 'banana', createdAt: at('2026-09-03T00:00:00Z') });
    const eclair = makeTodo({ title: 'éclair', createdAt: at('2026-09-04T00:00:00Z') });
    const input = [eclair, upper, banana, lower];
    expect([...input].sort(compareTodos('title', 'asc'))).toEqual([lower, upper, banana, eclair]);
    expect([...input].sort(compareTodos('title', 'desc'))).toEqual([eclair, banana, lower, upper]);
  });

  it('puts todos without a due date last in both directions', () => {
    const early = makeTodo({ dueDate: '2026-10-01' });
    const late = makeTodo({ dueDate: '2026-12-01' });
    const undated = makeTodo({ dueDate: null });
    expect([undated, late, early].sort(compareTodos('dueDate', 'asc'))).toEqual([
      early,
      late,
      undated,
    ]);
    expect([undated, early, late].sort(compareTodos('dueDate', 'desc'))).toEqual([
      late,
      early,
      undated,
    ]);
  });

  it('breaks full ties by id ascending', () => {
    const createdAt = at('2026-09-01T00:00:00Z');
    const first = makeTodo({ id: todoId(1), dueDate: '2026-10-01', createdAt });
    const second = makeTodo({ id: todoId(2), dueDate: '2026-10-01', createdAt });
    const undatedFirst = makeTodo({ id: todoId(3), dueDate: null, createdAt });
    const undatedSecond = makeTodo({ id: todoId(4), dueDate: null, createdAt });
    expect(
      [undatedSecond, second, undatedFirst, first].sort(compareTodos('dueDate', 'asc')),
    ).toEqual([first, second, undatedFirst, undatedSecond]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `dev npx vitest run apps/api/tests/repository/in-memory/ordering.test.ts`
Expected: FAIL — module `ordering.js` not found.

- [ ] **Step 4: Implement the ordering rules**

`apps/api/src/repository/in-memory/ordering.ts`:
```ts
import type { SortOrder, TodoSortField, TodoStatus } from '@foci/shared';
import { isOverdue, type Todo } from '../../domain/todo.js';

const codePoints = (text: string): number[] =>
  Array.from(text, (character) => character.codePointAt(0) as number);

/** Compares strings by Unicode code point — the same order as Postgres `COLLATE "C"` on UTF-8. */
export function compareCodePoints(a: string, b: string): number {
  const left = codePoints(a);
  const right = codePoints(b);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] as number) - (right[index] as number);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function matchesStatus(status: TodoStatus, today: string): (todo: Todo) => boolean {
  switch (status) {
    case 'all':
      return () => true;
    case 'completed':
      return (todo) => todo.isCompleted;
    case 'incomplete':
      return (todo) => !todo.isCompleted;
    case 'overdue':
      return (todo) => isOverdue(todo, today);
  }
}

/** Mirrors the Postgres ORDER BY: primary key, then `created_at DESC, id ASC`. */
export function compareTodos(sort: TodoSortField, order: SortOrder): (a: Todo, b: Todo) => number {
  const direction = order === 'asc' ? 1 : -1;
  return (a, b) => comparePrimary(sort, direction, a, b) || compareTieBreak(a, b);
}

function comparePrimary(sort: TodoSortField, direction: number, a: Todo, b: Todo): number {
  switch (sort) {
    case 'createdAt':
      return direction * (a.createdAt.getTime() - b.createdAt.getTime());
    case 'title':
      return direction * compareCodePoints(a.title.toLowerCase(), b.title.toLowerCase());
    case 'dueDate':
      return compareDueDates(a.dueDate, b.dueDate, direction);
  }
}

/** Todos without a due date sort last regardless of direction (Postgres `NULLS LAST`). */
function compareDueDates(a: string | null, b: string | null, direction: number): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction * (a < b ? -1 : 1);
}

function compareTieBreak(a: Todo, b: Todo): number {
  return b.createdAt.getTime() - a.createdAt.getTime() || compareCodePoints(a.id, b.id);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dev npx vitest run apps/api/tests/repository/in-memory/ordering.test.ts`
Expected: PASS.

- [ ] **Step 6: Format, gate, commit**

Run: `dev npx prettier --write apps/api` then `docker compose --profile test run --rm --build test`.
If coverage reports `src/repository/ports.ts` as uncovered (a types-only file can show as 0/0), add `'apps/api/src/repository/ports.ts'` to `coverage.exclude` in `vitest.config.ts` with the comment `// types only — no runtime code` and record it in the commit body.
```bash
git add apps/api vitest.config.ts
git commit -F - <<'EOF'
feat(api): add repository ports and deterministic ordering rules

Ports for todos, idempotency records, unit of work and database probe.
In-memory filter/sort rules mirror the Postgres ORDER BY exactly,
including NULLS LAST and the created_at/id tie-breakers.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: In-memory adapters and the repository contract suite

**Files:**
- Create: `apps/api/src/repository/in-memory/AsyncMutex.ts`, `InMemoryDatabase.ts`, `InMemoryTodoRepository.ts`, `InMemoryIdempotencyStore.ts`, `InMemoryUnitOfWork.ts`, `createInMemoryStorage.ts` (all under `apps/api/src/repository/in-memory/`)
- Create: `apps/api/tests/repository/repository.contract.ts`
- Test: `apps/api/tests/repository/in-memory/AsyncMutex.test.ts`, `apps/api/tests/repository/in-memory/createInMemoryStorage.test.ts`

**Interfaces:**
- Consumes: ports and ordering from Task 2; `Todo` from Task 1.
- Produces:
  - `class AsyncMutex { runExclusive<T>(task: () => Promise<T>): Promise<T> }`
  - `createInMemoryStorage(): Storage`
  - Test support: `describeRepositoryContract(adapterName: string, setup: () => Promise<Storage>): void`

- [ ] **Step 1: Write the contract suite (shared by every adapter)**

`apps/api/tests/repository/repository.contract.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LIST_QUERY, type ListTodosQuery } from '@foci/shared';
import type { Storage, StoredResponse } from '../../src/repository/ports.js';
import { todoId } from '../support/fakes.js';
import { makeTodo } from '../support/todoFactory.js';

const TODAY = '2026-09-30';
const query = (overrides: Partial<ListTodosQuery>): ListTodosQuery => ({
  ...DEFAULT_LIST_QUERY,
  ...overrides,
});
const at = (iso: string) => new Date(iso);
const hash = (character: string) => character.repeat(64);

function storedResponse(overrides: Partial<StoredResponse> = {}): StoredResponse {
  return {
    key: 'key-1',
    requestHash: hash('a'),
    status: 201,
    body: { id: todoId(1), title: 'Buy milk' },
    createdAt: at('2026-09-30T12:00:00.000Z'),
    ...overrides,
  };
}

/** Behaviour every storage adapter must share; run against in-memory and Postgres. */
export function describeRepositoryContract(
  adapterName: string,
  setup: () => Promise<Storage>,
): void {
  describe(`${adapterName} storage contract`, () => {
    let storage: Storage;

    beforeEach(async () => {
      storage = await setup();
    });

    describe('TodoRepository', () => {
      it('round-trips every field', async () => {
        const todo = makeTodo({
          title: 'Pay rent',
          description: 'Before noon',
          dueDate: '2026-10-01',
          createdAt: at('2026-09-15T08:30:00.123Z'),
        });
        await storage.todos.create(todo);
        expect(await storage.todos.findById(todo.id)).toEqual(todo);
      });

      it('returns null for an unknown id', async () => {
        expect(await storage.todos.findById(todoId(999_999))).toBeNull();
      });

      it('rejects a duplicate id', async () => {
        const todo = makeTodo();
        await storage.todos.create(todo);
        await expect(storage.todos.create(todo)).rejects.toThrow();
      });

      it('applies only the provided fields and bumps the version', async () => {
        const todo = makeTodo({ title: 'Old', description: 'Keep me', dueDate: '2026-10-01' });
        await storage.todos.create(todo);
        const updated = await storage.todos.update(todo.id, 1, { title: 'New' });
        expect(updated).toEqual({ ...todo, title: 'New', version: 2 });
        expect(await storage.todos.findById(todo.id)).toEqual(updated);
      });

      it('clears optional fields with null and updates the due date', async () => {
        const todo = makeTodo({ description: 'x', dueDate: '2026-10-01' });
        await storage.todos.create(todo);
        expect(await storage.todos.update(todo.id, 1, { description: null, dueDate: null })).toEqual(
          { ...todo, description: null, dueDate: null, version: 2 },
        );
        expect(await storage.todos.update(todo.id, 2, { dueDate: '2027-01-31' })).toEqual({
          ...todo,
          description: null,
          dueDate: '2027-01-31',
          version: 3,
        });
      });

      it('refuses an update with a stale version and leaves the row unchanged', async () => {
        const todo = makeTodo();
        await storage.todos.create(todo);
        expect(await storage.todos.update(todo.id, 2, { title: 'Nope' })).toBeNull();
        expect(await storage.todos.findById(todo.id)).toEqual(todo);
      });

      it('returns null when updating an unknown id', async () => {
        expect(await storage.todos.update(todoId(999_999), 1, { title: 'x' })).toBeNull();
      });

      it('bumps the version only when the completion state changes', async () => {
        const todo = makeTodo();
        await storage.todos.create(todo);
        const completed = await storage.todos.setCompleted(todo.id, true);
        expect(completed).toEqual({ ...todo, isCompleted: true, version: 2 });
        expect(await storage.todos.setCompleted(todo.id, true)).toEqual(completed);
        expect(await storage.todos.setCompleted(todo.id, false)).toEqual({ ...todo, version: 3 });
      });

      it('returns null when completing an unknown id', async () => {
        expect(await storage.todos.setCompleted(todoId(999_999), true)).toBeNull();
      });

      it('deletes only with the current version', async () => {
        const todo = makeTodo();
        await storage.todos.create(todo);
        expect(await storage.todos.delete(todo.id, 2)).toBe(false);
        expect(await storage.todos.findById(todo.id)).toEqual(todo);
        expect(await storage.todos.delete(todo.id, 1)).toBe(true);
        expect(await storage.todos.findById(todo.id)).toBeNull();
        expect(await storage.todos.delete(todo.id, 1)).toBe(false);
      });

      describe('list', () => {
        const done = makeTodo({
          title: 'done',
          isCompleted: true,
          dueDate: '2026-09-01',
          createdAt: at('2026-09-01T00:00:00Z'),
        });
        const late = makeTodo({
          title: 'late',
          dueDate: '2026-09-29',
          createdAt: at('2026-09-02T00:00:00Z'),
        });
        const dueToday = makeTodo({
          title: 'today',
          dueDate: TODAY,
          createdAt: at('2026-09-03T00:00:00Z'),
        });
        const undated = makeTodo({ title: 'undated', createdAt: at('2026-09-04T00:00:00Z') });

        beforeEach(async () => {
          for (const todo of [late, undated, done, dueToday]) await storage.todos.create(todo);
        });

        it.each([
          ['all', ['undated', 'today', 'late', 'done']],
          ['completed', ['done']],
          ['incomplete', ['undated', 'today', 'late']],
          ['overdue', ['late']],
        ] as const)('filters by status %s (newest first by default)', async (status, titles) => {
          const todos = await storage.todos.list(query({ status }), TODAY);
          expect(todos.map((todo) => todo.title)).toEqual(titles);
        });

        it('sorts by createdAt ascending', async () => {
          const todos = await storage.todos.list(query({ order: 'asc' }), TODAY);
          expect(todos.map((todo) => todo.title)).toEqual(['done', 'late', 'today', 'undated']);
        });

        it('sorts by due date with undated todos last in both directions', async () => {
          const asc = await storage.todos.list(query({ sort: 'dueDate', order: 'asc' }), TODAY);
          const desc = await storage.todos.list(query({ sort: 'dueDate', order: 'desc' }), TODAY);
          expect(asc.map((todo) => todo.title)).toEqual(['done', 'late', 'today', 'undated']);
          expect(desc.map((todo) => todo.title)).toEqual(['today', 'late', 'done', 'undated']);
        });

        it('returns detached copies', async () => {
          const [first] = await storage.todos.list(query({}), TODAY);
          if (first === undefined) throw new Error('expected a todo');
          first.title = 'mutated';
          expect((await storage.todos.findById(first.id))?.title).toBe('undated');
        });
      });

      it('sorts titles case-insensitively by code point with stable tie-breakers', async () => {
        const createdAt = at('2026-09-01T00:00:00Z');
        const todos = [
          makeTodo({ id: todoId(4), title: 'éclair', createdAt }),
          makeTodo({ id: todoId(2), title: 'Apple', createdAt }),
          makeTodo({ id: todoId(3), title: 'banana', createdAt }),
          makeTodo({ id: todoId(1), title: 'apple', createdAt }),
          makeTodo({ id: todoId(5), title: 'Apple', createdAt: at('2026-09-02T00:00:00Z') }),
        ];
        for (const todo of todos) await storage.todos.create(todo);
        const asc = await storage.todos.list(query({ sort: 'title', order: 'asc' }), TODAY);
        expect(asc.map((todo) => todo.id)).toEqual([
          todoId(5),
          todoId(1),
          todoId(2),
          todoId(3),
          todoId(4),
        ]);
      });
    });

    describe('IdempotencyStore', () => {
      const notBefore = at('2026-09-29T12:00:00.000Z');

      it('claims a new key and finds it', async () => {
        const record = storedResponse();
        expect(await storage.idempotency.claim(record, notBefore)).toBe(true);
        expect(await storage.idempotency.find(record.key, notBefore)).toEqual(record);
      });

      it('refuses to claim a live key and keeps the original record', async () => {
        const original = storedResponse();
        await storage.idempotency.claim(original, notBefore);
        const second = storedResponse({ requestHash: hash('b'), body: { other: true } });
        expect(await storage.idempotency.claim(second, notBefore)).toBe(false);
        expect(await storage.idempotency.find(original.key, notBefore)).toEqual(original);
      });

      it('treats records older than notBefore as expired', async () => {
        const record = storedResponse({ createdAt: at('2026-09-28T00:00:00.000Z') });
        await storage.idempotency.claim(record, at('2026-09-27T00:00:00.000Z'));
        expect(await storage.idempotency.find(record.key, notBefore)).toBeNull();
      });

      it('replaces an expired record when claimed again', async () => {
        await storage.idempotency.claim(
          storedResponse({ createdAt: at('2026-09-28T00:00:00.000Z') }),
          at('2026-09-27T00:00:00.000Z'),
        );
        const fresh = storedResponse({ requestHash: hash('c') });
        expect(await storage.idempotency.claim(fresh, notBefore)).toBe(true);
        expect(await storage.idempotency.find(fresh.key, notBefore)).toEqual(fresh);
      });

      it('returns null for an unknown key', async () => {
        expect(await storage.idempotency.find('missing', notBefore)).toBeNull();
      });
    });

    describe('UnitOfWork', () => {
      const notBefore = at('2026-09-29T12:00:00.000Z');

      it('commits every write and returns the result', async () => {
        const todo = makeTodo();
        const result = await storage.unitOfWork.run(async ({ todos, idempotency }) => {
          await idempotency.claim(storedResponse(), notBefore);
          await todos.create(todo);
          return 'done';
        });
        expect(result).toBe('done');
        expect(await storage.todos.findById(todo.id)).toEqual(todo);
        expect(await storage.idempotency.find('key-1', notBefore)).not.toBeNull();
      });

      it('rolls back every write when the work fails', async () => {
        const todo = makeTodo();
        const failure = new Error('boom');
        await expect(
          storage.unitOfWork.run(async ({ todos, idempotency }) => {
            await idempotency.claim(storedResponse(), notBefore);
            await todos.create(todo);
            throw failure;
          }),
        ).rejects.toBe(failure);
        expect(await storage.todos.findById(todo.id)).toBeNull();
        expect(await storage.idempotency.find('key-1', notBefore)).toBeNull();
      });

      it('lets exactly one of several concurrent units claim the same key', async () => {
        const attempts = Array.from({ length: 5 }, (_, index) =>
          storage.unitOfWork.run(async ({ todos, idempotency }) => {
            const claimed = await idempotency.claim(
              storedResponse({ key: 'race' }),
              notBefore,
            );
            if (claimed) await todos.create(makeTodo({ id: todoId(500 + index) }));
            return claimed;
          }),
        );
        const results = await Promise.all(attempts);
        expect(results.filter(Boolean)).toHaveLength(1);
        const all = await storage.todos.list(query({}), TODAY);
        expect(all).toHaveLength(1);
      });
    });
  });
}
```

- [ ] **Step 2: Write the failing tests that run the contract and the mutex**

`apps/api/tests/repository/in-memory/createInMemoryStorage.test.ts`:
```ts
import { createInMemoryStorage } from '../../../src/repository/in-memory/createInMemoryStorage.js';
import { describeRepositoryContract } from '../repository.contract.js';

describeRepositoryContract('in-memory', async () => createInMemoryStorage());
```

`apps/api/tests/repository/in-memory/AsyncMutex.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { AsyncMutex } from '../../../src/repository/in-memory/AsyncMutex.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe('AsyncMutex', () => {
  it('runs tasks one at a time in call order', async () => {
    const mutex = new AsyncMutex();
    const events: string[] = [];
    const task = (name: string) => async () => {
      events.push(`${name}:start`);
      await tick();
      events.push(`${name}:end`);
      return name;
    };
    const results = await Promise.all([
      mutex.runExclusive(task('a')),
      mutex.runExclusive(task('b')),
    ]);
    expect(results).toEqual(['a', 'b']);
    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('releases the lock when a task fails', async () => {
    const mutex = new AsyncMutex();
    await expect(
      mutex.runExclusive(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(mutex.runExclusive(async () => 'next')).resolves.toBe('next');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `dev npx vitest run apps/api/tests/repository/in-memory`
Expected: FAIL — modules `createInMemoryStorage.js` and `AsyncMutex.js` not found.

- [ ] **Step 4: Implement the in-memory adapters**

`apps/api/src/repository/in-memory/AsyncMutex.ts`:
```ts
/** Serialises async tasks: each task starts after the previous one settles. */
export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }
}
```

`apps/api/src/repository/in-memory/InMemoryDatabase.ts`:
```ts
import type { Todo } from '../../domain/todo.js';
import type { StoredResponse } from '../ports.js';
import { AsyncMutex } from './AsyncMutex.js';

/**
 * Shared state for the in-memory adapters. Stored objects are never mutated in place
 * (updates replace them), so a shallow map copy is a complete snapshot.
 */
export class InMemoryDatabase {
  todos = new Map<string, Todo>();
  idempotency = new Map<string, StoredResponse>();
  readonly transactions = new AsyncMutex();

  /** Captures the current state and returns a function that restores it. */
  snapshot(): () => void {
    const todos = new Map(this.todos);
    const idempotency = new Map(this.idempotency);
    return () => {
      this.todos = todos;
      this.idempotency = idempotency;
    };
  }
}
```

`apps/api/src/repository/in-memory/InMemoryTodoRepository.ts`:
```ts
import type { ListTodosQuery } from '@foci/shared';
import type { Todo, TodoPatch } from '../../domain/todo.js';
import type { TodoRepository } from '../ports.js';
import type { InMemoryDatabase } from './InMemoryDatabase.js';
import { compareTodos, matchesStatus } from './ordering.js';

export class InMemoryTodoRepository implements TodoRepository {
  constructor(private readonly database: InMemoryDatabase) {}

  async create(todo: Todo): Promise<void> {
    if (this.database.todos.has(todo.id)) throw new Error(`Duplicate todo id ${todo.id}`);
    this.database.todos.set(todo.id, { ...todo });
  }

  async findById(id: string): Promise<Todo | null> {
    const todo = this.database.todos.get(id);
    return todo === undefined ? null : { ...todo };
  }

  async list(query: ListTodosQuery, today: string): Promise<Todo[]> {
    return [...this.database.todos.values()]
      .filter(matchesStatus(query.status, today))
      .sort(compareTodos(query.sort, query.order))
      .map((todo) => ({ ...todo }));
  }

  async update(id: string, expectedVersion: number, patch: TodoPatch): Promise<Todo | null> {
    const current = this.database.todos.get(id);
    if (current === undefined || current.version !== expectedVersion) return null;
    const next: Todo = { ...current, version: current.version + 1 };
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.description !== undefined) next.description = patch.description;
    if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
    this.database.todos.set(id, next);
    return { ...next };
  }

  async setCompleted(id: string, completed: boolean): Promise<Todo | null> {
    const current = this.database.todos.get(id);
    if (current === undefined) return null;
    if (current.isCompleted === completed) return { ...current };
    const next: Todo = { ...current, isCompleted: completed, version: current.version + 1 };
    this.database.todos.set(id, next);
    return { ...next };
  }

  async delete(id: string, expectedVersion: number): Promise<boolean> {
    const current = this.database.todos.get(id);
    if (current === undefined || current.version !== expectedVersion) return false;
    this.database.todos.delete(id);
    return true;
  }
}
```

`apps/api/src/repository/in-memory/InMemoryIdempotencyStore.ts`:
```ts
import type { IdempotencyStore, StoredResponse } from '../ports.js';
import type { InMemoryDatabase } from './InMemoryDatabase.js';

export class InMemoryIdempotencyStore implements IdempotencyStore {
  constructor(private readonly database: InMemoryDatabase) {}

  async find(key: string, notBefore: Date): Promise<StoredResponse | null> {
    const record = this.database.idempotency.get(key);
    return record !== undefined && record.createdAt >= notBefore ? { ...record } : null;
  }

  async claim(record: StoredResponse, notBefore: Date): Promise<boolean> {
    const existing = this.database.idempotency.get(record.key);
    if (existing !== undefined && existing.createdAt >= notBefore) return false;
    this.database.idempotency.set(record.key, { ...record });
    return true;
  }
}
```

`apps/api/src/repository/in-memory/InMemoryUnitOfWork.ts`:
```ts
import type { UnitOfWork, Repositories } from '../ports.js';
import { InMemoryIdempotencyStore } from './InMemoryIdempotencyStore.js';
import type { InMemoryDatabase } from './InMemoryDatabase.js';
import { InMemoryTodoRepository } from './InMemoryTodoRepository.js';

/** Serialises units of work and restores the previous state if one fails. */
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(private readonly database: InMemoryDatabase) {}

  run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> {
    return this.database.transactions.runExclusive(async () => {
      const rollback = this.database.snapshot();
      try {
        return await work({
          todos: new InMemoryTodoRepository(this.database),
          idempotency: new InMemoryIdempotencyStore(this.database),
        });
      } catch (error) {
        rollback();
        throw error;
      }
    });
  }
}
```

`apps/api/src/repository/in-memory/createInMemoryStorage.ts`:
```ts
import type { Storage } from '../ports.js';
import { InMemoryDatabase } from './InMemoryDatabase.js';
import { InMemoryIdempotencyStore } from './InMemoryIdempotencyStore.js';
import { InMemoryTodoRepository } from './InMemoryTodoRepository.js';
import { InMemoryUnitOfWork } from './InMemoryUnitOfWork.js';

export function createInMemoryStorage(): Storage {
  const database = new InMemoryDatabase();
  return {
    todos: new InMemoryTodoRepository(database),
    idempotency: new InMemoryIdempotencyStore(database),
    unitOfWork: new InMemoryUnitOfWork(database),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dev npx vitest run apps/api/tests/repository/in-memory`
Expected: PASS (contract suite + mutex).

- [ ] **Step 6: Format, gate, commit**

Run: `dev npx prettier --write apps/api` then `docker compose --profile test run --rm --build test` (100%).
```bash
git add apps/api
git commit -F - <<'EOF'
feat(api): add in-memory storage and the repository contract suite

In-memory todo repository, idempotency store and a serialising unit of
work with snapshot rollback. A shared contract suite pins the behaviour
every storage adapter must match (filters, sorting, versions, expiry,
atomicity, concurrent claims).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Then follow the index's per-PR procedure (steps 3–6). PR title: `feat(api): domain model, in-memory storage and repository contract`.
