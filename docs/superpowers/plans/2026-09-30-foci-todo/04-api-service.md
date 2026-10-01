# PR 4 — API Service Layer

> Read `00-index.md` first. Branch: `feat/api-service`.

**Delivers:** `TodoService` (all use cases, error selection, idempotent create), `HealthService`, and canonical request hashing — fully unit-tested against the in-memory storage.

**Spec sections:** §5.4, §6 (idempotent create, error precedence 428 → 404 → 412).

---

### Task 1: Request hashing and the health service

**Files:**
- Create: `apps/api/src/service/requestHash.ts`, `apps/api/src/service/HealthService.ts`
- Test: `apps/api/tests/service/requestHash.test.ts`, `apps/api/tests/service/HealthService.test.ts`

**Interfaces:**
- Consumes: `CreateTodo` (`@foci/shared`), `DatabaseProbe` (PR 2 ports).
- Produces: `hashCreateRequest(input: CreateTodo): string` (64-char lowercase hex); `interface HealthReport { status: 'ok' | 'degraded'; db: 'up' | 'down'; schemaVersion: string | null }`; `class HealthService { constructor(probe: DatabaseProbe); check(): Promise<HealthReport> }`.

- [ ] **Step 1: Write the failing tests**

`apps/api/tests/service/requestHash.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { hashCreateRequest } from '../../src/service/requestHash.js';

describe('hashCreateRequest', () => {
  it('returns a sha256 hex digest', () => {
    expect(hashCreateRequest({ title: 'Buy milk' })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('treats absent and null optional fields the same', () => {
    expect(hashCreateRequest({ title: 'x' })).toBe(
      hashCreateRequest({ title: 'x', description: null, dueDate: null }),
    );
  });

  it('distinguishes different requests', () => {
    const base = hashCreateRequest({ title: 'x' });
    expect(hashCreateRequest({ title: 'y' })).not.toBe(base);
    expect(hashCreateRequest({ title: 'x', description: 'd' })).not.toBe(base);
    expect(hashCreateRequest({ title: 'x', dueDate: '2026-10-01' })).not.toBe(base);
  });

  it('does not confuse field boundaries', () => {
    expect(hashCreateRequest({ title: 'a', description: 'b' })).not.toBe(
      hashCreateRequest({ title: 'ab', description: null }),
    );
  });
});
```

`apps/api/tests/service/HealthService.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { HealthService } from '../../src/service/HealthService.js';

describe('HealthService', () => {
  it('reports ok with the schema version when the database answers', async () => {
    const service = new HealthService({ check: async () => ({ schemaVersion: '001_init' }) });
    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      db: 'up',
      schemaVersion: '001_init',
    });
  });

  it('reports degraded when the database is unreachable', async () => {
    const service = new HealthService({
      check: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(service.check()).resolves.toEqual({
      status: 'degraded',
      db: 'down',
      schemaVersion: null,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dev npx vitest run apps/api/tests/service`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`apps/api/src/service/requestHash.ts`:
```ts
import { createHash } from 'node:crypto';
import type { CreateTodo } from '@foci/shared';

/**
 * Fingerprint of a create request after validation/normalisation, used to detect an
 * Idempotency-Key reused with a different payload. A JSON array keeps field boundaries explicit.
 */
export function hashCreateRequest(input: CreateTodo): string {
  const canonical = JSON.stringify([input.title, input.description ?? null, input.dueDate ?? null]);
  return createHash('sha256').update(canonical).digest('hex');
}
```

`apps/api/src/service/HealthService.ts`:
```ts
import type { DatabaseProbe } from '../repository/ports.js';

export interface HealthReport {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  schemaVersion: string | null;
}

export class HealthService {
  constructor(private readonly probe: DatabaseProbe) {}

  async check(): Promise<HealthReport> {
    try {
      const { schemaVersion } = await this.probe.check();
      return { status: 'ok', db: 'up', schemaVersion };
    } catch {
      return { status: 'degraded', db: 'down', schemaVersion: null };
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dev npx vitest run apps/api/tests/service`
Expected: PASS.

- [ ] **Step 5: Format, gate, commit**

Run: `dev npx prettier --write apps/api` then `docker compose --profile test run --rm --build test`.
```bash
git add apps/api
git commit -F - <<'EOF'
feat(api): add health service and canonical create-request hashing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: TodoService

**Files:**
- Create: `apps/api/src/service/TodoService.ts`
- Test: `apps/api/tests/service/TodoService.test.ts`

**Interfaces:**
- Consumes: `Todo`, `toView`, `Clock`, `utcDate`, `IdGenerator`, domain errors (PR 2); `TodoRepository`, `UnitOfWork`, `IdempotencyStore` ports (PR 2); `hashCreateRequest` (Task 1); `CreateTodo`, `UpdateTodo`, `ListTodosQuery`, `TodoView`, `TodoViewSchema` (`@foci/shared`).
- Produces:
  - `IDEMPOTENCY_TTL_MS = 86_400_000`
  - `interface TodoServiceDependencies { todos: TodoRepository; unitOfWork: UnitOfWork; clock: Clock; ids: IdGenerator }`
  - `interface CreateTodoResult { todo: TodoView; replayed: boolean }`
  - `class TodoService` with `create(input: CreateTodo, idempotencyKey?: string): Promise<CreateTodoResult>`, `get(id: string): Promise<TodoView>`, `list(query: ListTodosQuery): Promise<TodoView[]>`, `update(id: string, expectedVersion: number | undefined, patch: UpdateTodo): Promise<TodoView>`, `complete(id: string): Promise<TodoView>`, `uncomplete(id: string): Promise<TodoView>`, `delete(id: string, expectedVersion: number | undefined): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`apps/api/tests/service/TodoService.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LIST_QUERY } from '@foci/shared';
import {
  IdempotencyKeyReuseError,
  PreconditionRequiredError,
  TodoNotFoundError,
  VersionConflictError,
} from '../../src/domain/errors.js';
import { createInMemoryStorage } from '../../src/repository/in-memory/createInMemoryStorage.js';
import type { IdempotencyStore, Storage } from '../../src/repository/ports.js';
import { IDEMPOTENCY_TTL_MS, TodoService } from '../../src/service/TodoService.js';
import { FixedClock, SequentialIds, todoId } from '../support/fakes.js';

describe('TodoService', () => {
  let storage: Storage;
  let clock: FixedClock;
  let service: TodoService;

  beforeEach(() => {
    storage = createInMemoryStorage();
    clock = new FixedClock('2026-09-30T12:00:00.000Z');
    service = new TodoService({
      todos: storage.todos,
      unitOfWork: storage.unitOfWork,
      clock,
      ids: new SequentialIds(),
    });
  });

  describe('create', () => {
    it('creates an incomplete todo at version 1 with server-assigned id and timestamp', async () => {
      const result = await service.create({ title: 'Buy milk' });
      expect(result).toEqual({
        replayed: false,
        todo: {
          id: todoId(1),
          title: 'Buy milk',
          description: null,
          dueDate: null,
          isCompleted: false,
          createdAt: '2026-09-30T12:00:00.000Z',
          version: 1,
          isOverdue: false,
        },
      });
      expect(await storage.todos.findById(todoId(1))).not.toBeNull();
    });

    it('marks a todo created with a past due date as overdue', async () => {
      const { todo } = await service.create({ title: 'Late', dueDate: '2026-09-01' });
      expect(todo.isOverdue).toBe(true);
    });

    it('stores the todo and replays the same response for a repeated key', async () => {
      const first = await service.create({ title: 'Once' }, 'key-1');
      const second = await service.create({ title: 'Once' }, 'key-1');
      expect(first.replayed).toBe(false);
      expect(second).toEqual({ todo: first.todo, replayed: true });
      expect(await storage.todos.list(DEFAULT_LIST_QUERY, '2026-09-30')).toHaveLength(1);
    });

    it('rejects a key reused with a different payload', async () => {
      await service.create({ title: 'Once' }, 'key-1');
      await expect(service.create({ title: 'Other' }, 'key-1')).rejects.toBeInstanceOf(
        IdempotencyKeyReuseError,
      );
    });

    it('treats a key older than 24 hours as new', async () => {
      await service.create({ title: 'Once' }, 'key-1');
      clock.advance(IDEMPOTENCY_TTL_MS + 1);
      const again = await service.create({ title: 'Different' }, 'key-1');
      expect(again.replayed).toBe(false);
      expect(await storage.todos.list(DEFAULT_LIST_QUERY, '2026-10-01')).toHaveLength(2);
    });

    it('creates exactly one todo for concurrent requests sharing a key', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => service.create({ title: 'Race' }, 'race-key')),
      );
      expect(results.filter((result) => !result.replayed)).toHaveLength(1);
      expect(new Set(results.map((result) => result.todo.id)).size).toBe(1);
      expect(await storage.todos.list(DEFAULT_LIST_QUERY, '2026-09-30')).toHaveLength(1);
    });

    it('fails loudly if a claimed-by-someone-else record cannot be read back', async () => {
      const brokenStore: IdempotencyStore = {
        claim: async () => false,
        find: async () => null,
      };
      const brokenService = new TodoService({
        todos: storage.todos,
        unitOfWork: { run: (work) => work({ todos: storage.todos, idempotency: brokenStore }) },
        clock,
        ids: new SequentialIds(),
      });
      await expect(brokenService.create({ title: 'x' }, 'key-1')).rejects.toThrow(
        'Idempotency record for key-1 disappeared',
      );
    });
  });

  describe('get and list', () => {
    it('returns a todo by id', async () => {
      const { todo } = await service.create({ title: 'Read me' });
      await expect(service.get(todo.id)).resolves.toEqual(todo);
    });

    it('throws TodoNotFoundError for an unknown id', async () => {
      await expect(service.get(todoId(99))).rejects.toBeInstanceOf(TodoNotFoundError);
    });

    it('lists with the requested filter and computes overdue against today (UTC)', async () => {
      await service.create({ title: 'Due today', dueDate: '2026-09-30' });
      await service.create({ title: 'Late', dueDate: '2026-09-29' });
      const overdue = await service.list({ ...DEFAULT_LIST_QUERY, status: 'overdue' });
      expect(overdue.map((todo) => [todo.title, todo.isOverdue])).toEqual([['Late', true]]);
      clock.set('2026-10-01T00:00:00.000Z');
      const all = await service.list(DEFAULT_LIST_QUERY);
      expect(all.every((todo) => todo.isOverdue)).toBe(true);
    });
  });

  describe('update', () => {
    it('applies the patch and returns the new version', async () => {
      const { todo } = await service.create({ title: 'Old' });
      const updated = await service.update(todo.id, 1, { title: 'New', dueDate: '2026-10-05' });
      expect(updated).toEqual({ ...todo, title: 'New', dueDate: '2026-10-05', version: 2 });
    });

    it('requires a version (428 before anything else)', async () => {
      await expect(service.update(todoId(99), undefined, { title: 'x' })).rejects.toBeInstanceOf(
        PreconditionRequiredError,
      );
    });

    it('reports a missing todo as not found', async () => {
      await expect(service.update(todoId(99), 1, { title: 'x' })).rejects.toBeInstanceOf(
        TodoNotFoundError,
      );
    });

    it('reports a stale version as a conflict', async () => {
      const { todo } = await service.create({ title: 'Old' });
      await service.update(todo.id, 1, { title: 'First' });
      await expect(service.update(todo.id, 1, { title: 'Second' })).rejects.toBeInstanceOf(
        VersionConflictError,
      );
    });
  });

  describe('complete and uncomplete', () => {
    it('is idempotent and bumps the version only on change', async () => {
      const { todo } = await service.create({ title: 'Task' });
      const completed = await service.complete(todo.id);
      expect(completed).toMatchObject({ isCompleted: true, version: 2 });
      await expect(service.complete(todo.id)).resolves.toEqual(completed);
      await expect(service.uncomplete(todo.id)).resolves.toMatchObject({
        isCompleted: false,
        version: 3,
      });
    });

    it('clears the overdue flag when completed', async () => {
      const { todo } = await service.create({ title: 'Late', dueDate: '2026-09-01' });
      await expect(service.complete(todo.id)).resolves.toMatchObject({ isOverdue: false });
    });

    it('throws TodoNotFoundError for an unknown id', async () => {
      await expect(service.complete(todoId(99))).rejects.toBeInstanceOf(TodoNotFoundError);
      await expect(service.uncomplete(todoId(99))).rejects.toBeInstanceOf(TodoNotFoundError);
    });
  });

  describe('delete', () => {
    it('deletes with the current version', async () => {
      const { todo } = await service.create({ title: 'Bye' });
      await service.delete(todo.id, 1);
      await expect(service.get(todo.id)).rejects.toBeInstanceOf(TodoNotFoundError);
    });

    it('requires a version', async () => {
      await expect(service.delete(todoId(99), undefined)).rejects.toBeInstanceOf(
        PreconditionRequiredError,
      );
    });

    it('distinguishes a stale version from a missing todo', async () => {
      const { todo } = await service.create({ title: 'Keep' });
      await expect(service.delete(todo.id, 7)).rejects.toBeInstanceOf(VersionConflictError);
      await expect(service.delete(todoId(99), 1)).rejects.toBeInstanceOf(TodoNotFoundError);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dev npx vitest run apps/api/tests/service/TodoService.test.ts`
Expected: FAIL — module `TodoService.js` not found.

- [ ] **Step 3: Implement**

`apps/api/src/service/TodoService.ts`:
```ts
import {
  TodoViewSchema,
  type CreateTodo,
  type ListTodosQuery,
  type TodoView,
  type UpdateTodo,
} from '@foci/shared';
import { utcDate, type Clock } from '../domain/clock.js';
import {
  IdempotencyKeyReuseError,
  PreconditionRequiredError,
  TodoNotFoundError,
  VersionConflictError,
} from '../domain/errors.js';
import type { IdGenerator } from '../domain/ids.js';
import { toView, type Todo } from '../domain/todo.js';
import type { TodoRepository, UnitOfWork } from '../repository/ports.js';
import { hashCreateRequest } from './requestHash.js';

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface TodoServiceDependencies {
  todos: TodoRepository;
  unitOfWork: UnitOfWork;
  clock: Clock;
  ids: IdGenerator;
}

export interface CreateTodoResult {
  todo: TodoView;
  replayed: boolean;
}

export class TodoService {
  constructor(private readonly deps: TodoServiceDependencies) {}

  async create(input: CreateTodo, idempotencyKey?: string): Promise<CreateTodoResult> {
    const now = this.deps.clock.now();
    const todo: Todo = {
      id: this.deps.ids.next(),
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate ?? null,
      isCompleted: false,
      createdAt: now,
      version: 1,
    };
    const view = toView(todo, utcDate(now));

    if (idempotencyKey === undefined) {
      await this.deps.todos.create(todo);
      return { todo: view, replayed: false };
    }

    const requestHash = hashCreateRequest(input);
    const notBefore = new Date(now.getTime() - IDEMPOTENCY_TTL_MS);
    return this.deps.unitOfWork.run(async ({ todos, idempotency }) => {
      // Claim the key first: concurrent requests with the same key serialise here.
      const claimed = await idempotency.claim(
        { key: idempotencyKey, requestHash, status: 201, body: view, createdAt: now },
        notBefore,
      );
      if (claimed) {
        await todos.create(todo);
        return { todo: view, replayed: false };
      }
      const existing = await idempotency.find(idempotencyKey, notBefore);
      if (existing === null) {
        throw new Error(`Idempotency record for ${idempotencyKey} disappeared`);
      }
      if (existing.requestHash !== requestHash) throw new IdempotencyKeyReuseError(idempotencyKey);
      return { todo: TodoViewSchema.parse(existing.body), replayed: true };
    });
  }

  async get(id: string): Promise<TodoView> {
    const todo = await this.deps.todos.findById(id);
    if (todo === null) throw new TodoNotFoundError(id);
    return this.view(todo);
  }

  async list(query: ListTodosQuery): Promise<TodoView[]> {
    const today = this.today();
    const todos = await this.deps.todos.list(query, today);
    return todos.map((todo) => toView(todo, today));
  }

  async update(
    id: string,
    expectedVersion: number | undefined,
    patch: UpdateTodo,
  ): Promise<TodoView> {
    if (expectedVersion === undefined) throw new PreconditionRequiredError();
    const updated = await this.deps.todos.update(id, expectedVersion, patch);
    if (updated === null) throw await this.notFoundOrConflict(id);
    return this.view(updated);
  }

  complete(id: string): Promise<TodoView> {
    return this.setCompleted(id, true);
  }

  uncomplete(id: string): Promise<TodoView> {
    return this.setCompleted(id, false);
  }

  async delete(id: string, expectedVersion: number | undefined): Promise<void> {
    if (expectedVersion === undefined) throw new PreconditionRequiredError();
    const deleted = await this.deps.todos.delete(id, expectedVersion);
    if (!deleted) throw await this.notFoundOrConflict(id);
  }

  private async setCompleted(id: string, completed: boolean): Promise<TodoView> {
    const todo = await this.deps.todos.setCompleted(id, completed);
    if (todo === null) throw new TodoNotFoundError(id);
    return this.view(todo);
  }

  /** After a conditional write matched no row: 404 if the todo is gone, otherwise 412. */
  private async notFoundOrConflict(id: string): Promise<Error> {
    const existing = await this.deps.todos.findById(id);
    return existing === null ? new TodoNotFoundError(id) : new VersionConflictError(id);
  }

  private today(): string {
    return utcDate(this.deps.clock.now());
  }

  private view(todo: Todo): TodoView {
    return toView(todo, this.today());
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dev npx vitest run apps/api/tests/service`
Expected: PASS.

- [ ] **Step 5: Format, gate, commit**

Run: `dev npx prettier --write apps/api` then `docker compose --profile test run --rm --build test` (100%).
```bash
git add apps/api
git commit -F - <<'EOF'
feat(api): add TodoService use cases with idempotent create

Server-assigned ids and timestamps, 428/404/412 error selection after
conditional writes, idempotent completion, and claim-first idempotency
keys with a 24h TTL and payload-mismatch detection.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Then follow the per-PR procedure. PR title: `feat(api): service layer`.
