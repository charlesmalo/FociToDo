# The brief's dueDate, cache and robustness fixes, and docs kept in sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the spec in five tasks, one commit each:
- accept the brief's `dueDate` alongside `dueAt`;
- stop stale 304 responses and lone-surrogate 500s, and pin the API image to UTC;
- fix the edit form's time reset and stale-overwrite bugs;
- make screenshots and diagrams provably current through the test gate;
- correct the docs and make the repository self-contained.

**Architecture:**
- **Validation:** the shared Zod schemas normalise `dueDate` into the single internal `dueAt`, so domain, service and repositories do not change. Responses gain a derived `dueDate`.
- **API middleware:** one small middleware handles caching for every `/api` response.
- **Web form:** the form tracks its starting values. It sends only changed fields and merges reloaded values after a 412.
- **Docs gate:** generated screenshots and diagram stamps are hashed by `packages/diagrams` and checked inside the existing Vitest gate. No browser runs in the gate.

**Tech Stack:**
- TypeScript 6.0, Node 24, npm workspaces;
- Express 5, PostgreSQL 17 (`pg`, node-pg-migrate);
- Zod 4;
- React 19, TanStack Query 5;
- Vitest 5 with v8 coverage, React Testing Library;
- Playwright 1.63, Mermaid CLI;
- Docker Compose.

**Spec:** [docs/superpowers/specs/2026-10-03-brief-duedate-and-docs-sync-design.md](../specs/2026-10-03-brief-duedate-and-docs-sync-design.md)

## Global Constraints

- **Docker only.** Never run host `node`/`npm`.
  - Developer commands: `docker compose --profile dev run --rm dev <cmd>`.
  - Gate: `docker compose --profile test run --rm --build test`.
  - e2e: `(docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e; rc=$?; docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml down -v; exit $rc)`.
  - Colima mounts only `$HOME`: put scratch under `~/workspace`, never `/tmp`, for anything a container mounts.
  - Never run `down -v` on the default `foci-todo` project; it holds demo data.
- **Tests.**
  - TDD: write the failing test first. Test and implementation land in the same commit.
  - Coverage stays at **100%** (lines, branches, functions, statements). No `v8 ignore`, and no new coverage exclusions.
  - Tests mirror source paths (the documented exception is in Task 5). No non-null assertions (lint).
  - **Nothing may depend on wall-clock time:** use injected clocks, fake timers, fixed far-future dates and route-mocked responses.
  - Existing tests that encode replaced behaviour are updated, never deleted to make the suite pass.
- **Imports:** `.js` extensions in packages and the API; web imports are extensionless.
- **Generated files are never edited by hand:**
  - `apps/api/openapi.json`: regenerate with `UPDATE_OPENAPI=1` on `apps/api/tests/http/openapi.test.ts`;
  - `docs/api/index.html`: regenerate with `docker compose --profile dev run --rm -e UPDATE_API_DOCS=1 dev npx vitest run packages/diagrams/tests/apiDocs.test.ts`, after the OpenAPI file;
  - `docs/diagrams/**`: regenerate with `docker compose --profile docs run --rm --build diagrams`;
  - `docs/images/*.png` and `docs/images/manifest.json`: regenerate with `docker compose --profile docs run --rm --build screenshots` (added in Task 4).
- **One commit per task**, with exactly the subject given in the task. Every commit is green on its own.
  - Every commit ends with `Co-Authored-By: Claude <model that wrote it> <noreply@anthropic.com>`.
  - Review fixes go in as `git commit --fixup <task commit>` and are autosquashed before the PR (`GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash <base>`).
  - Never rewrite `main`. Force-push only this branch, with `--force-with-lease`.
- **Committed text** covers only the code, its behaviour and the decisions behind it.
  - It never mentions people, hiring, submitting, deadlines for finishing or time spent.
  - It never names tooling outside this repository.
- **Exact strings (verbatim):**
  - `Due date must be a real date in YYYY-MM-DD format`
  - `Send either dueDate or dueAt, not both`
  - `At least one of title, description, dueDate or dueAt is required`
  - `Title must not contain an unpaired surrogate character`
  - `Description must not contain an unpaired surrogate character`
  - `Enter a real date`
  - `TODO_REFETCH_INTERVAL_MS = 60_000`
  - `Cache-Control: no-store`
  - migration `1759190400003_due-date-in-cached-responses`
  - date-only deadline = `<date>T23:59:59.000Z`

## Review Focus

1. **`{"dueDate": null, "dueAt": "…"}`:** sending both keys is ambiguous even when one is `null`, so it must be a 400 on `dueDate`, not a silent clear (Task 1).
2. **Problem responses produced before the routes run:** malformed JSON (400) and a body too large (413) must also carry `Cache-Control: no-store`, so the middleware must be mounted before `express.json` (Task 2).
3. **An edit that changes only the time, with the same date,** is a deadline change and must be sent (Task 3).
4. **A 412 when the user edited the deadline and the other writer changed the title:** after the reload, the title shows the other writer's value and the user's deadline is kept (Task 3).
5. **A depicted source file that is deleted or renamed** must give a named gate error, not a crash (Task 4).

---

### Task 1: The brief's `dueDate` alongside `dueAt`

Commit subject: `feat(deadlines): accept the brief's dueDate alongside dueAt`

**Files:**
- Modify: `packages/shared/src/todo.ts`, `packages/shared/src/listQuery.ts`
- Modify: `apps/api/src/domain/todo.ts` (`toView` adds `dueDate`)
- Create: `apps/api/migrations/1759190400003_due-date-in-cached-responses.sql`
- Create: `apps/api/tests/support/migrations.ts`
- Create: `apps/api/tests/migrations/dueDateMigration.int.test.ts`
- Modify: `apps/api/tests/migrations/dueAtMigration.int.test.ts`, which uses the new helper so it keeps targeting migration 0002
- Modify, pinned schema version: `apps/api/tests/repository/postgres/PgDatabaseProbe.int.test.ts:11`, `apps/api/tests/http/healthRoutes.int.test.ts:18`
- Test: `packages/shared/tests/todo.test.ts`, `packages/shared/tests/listQuery.test.ts`, `apps/api/tests/domain/todo.test.ts`, `apps/api/tests/service/requestHash.test.ts`, `apps/api/tests/http/todoRoutes.int.test.ts`, `apps/api/tests/http/openapi.test.ts` (and `openapi.int.test.ts` if it pins bodies), `e2e/api.spec.ts`
- Modify: every test fixture that builds a `TodoView`, which gains `dueDate`. Typecheck lists them, for example `apps/web/tests/support/fixtures.tsx` and `apps/api/tests/support/fakes.ts`.
- Regenerate: `apps/api/openapi.json`, then `docs/api/index.html`
- Docs: `docs/api.md`, `README.md` (Assumptions), `docs/decisions/0018-deadlines-accept-the-briefs-duedate.md` (new), `docs/decisions/README.md` (index)

**Interfaces:**
- Produces:
  - `DUE_DATE_ERROR` and `DUE_BOTH_ERROR` constants;
  - `endOfUtcDay(date: string): string`;
  - `TodoView.dueDate: string | null`;
  - `CreateTodoInput` and `UpdateTodoInput` accept `dueDate?: string | null`;
  - the `CreateTodo` and `UpdateTodo` outputs still carry only `dueAt`.

- [ ] **Step 1: Write the failing shared-schema tests** in `packages/shared/tests/todo.test.ts`. Add a `describe('dueDate (the brief\'s date-only deadline)')`:

```ts
it.each([
  ['2026-10-10', '2026-10-10T23:59:59.000Z'],
  ['0001-01-01', '0001-01-01T23:59:59.000Z'],
  ['9999-12-31', '9999-12-31T23:59:59.000Z'],
  ['2028-02-29', '2028-02-29T23:59:59.000Z'],
])('normalises dueDate %s to the end of that UTC day', (dueDate, dueAt) => {
  expect(CreateTodoSchema.parse({ title: 'x', dueDate })).toEqual({ title: 'x', dueAt });
  expect(UpdateTodoSchema.parse({ dueDate })).toEqual({ dueAt });
});

it.each(['2026-02-30', '2027-02-29', '0000-01-01', '10000-01-01', '2026-10-10T10:00:00Z', '20261010', 'x'])(
  'rejects the date %j with one dueDate error',
  (dueDate) => {
    const result = CreateTodoSchema.safeParse({ title: 'x', dueDate });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['dueDate'], message: DUE_DATE_ERROR }),
    ]);
  },
);

it('clears the deadline with dueDate: null', () => {
  expect(CreateTodoSchema.parse({ title: 'x', dueDate: null })).toEqual({ title: 'x', dueAt: null });
  expect(UpdateTodoSchema.parse({ dueDate: null })).toEqual({ dueAt: null });
});

it.each([
  [{ dueDate: '2026-10-10', dueAt: '2026-10-10T23:59:59Z' }],
  [{ dueDate: null, dueAt: '2026-10-10T23:59:59Z' }],
  [{ dueDate: '2026-10-10', dueAt: null }],
])('rejects both deadline fields together: %j', (deadline) => {
  for (const schema of [CreateTodoSchema, UpdateTodoSchema]) {
    const result = schema.safeParse({ title: 'x', ...deadline });
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({ path: ['dueDate'], message: DUE_BOTH_ERROR }),
    );
  }
});

it('names dueDate in the empty-patch message', () => {
  expect(UpdateTodoSchema.safeParse({}).error?.issues[0]?.message).toBe(
    'At least one of title, description, dueDate or dueAt is required',
  );
});

it('returns dueDate on views and accepts null', () => {
  expect(TodoViewSchema.parse({ ...view, dueDate: '2026-10-01' }).dueDate).toBe('2026-10-01');
  expect(TodoViewSchema.parse({ ...view, dueAt: null, dueDate: null }).dueDate).toBeNull();
  expect(TodoViewSchema.safeParse({ ...view, dueDate: '2026-10-01T00:00:00Z' }).success).toBe(false);
});
```

Update the file's existing `view` fixture to include `dueDate: '2026-10-01'`, and change the existing empty-patch expectation to the new message. In `packages/shared/tests/listQuery.test.ts`, add:

```ts
it('accepts sort=dueDate as the brief\'s name for sort=dueAt', () => {
  expect(ListTodosQuerySchema.parse({ sort: 'dueDate' }).sort).toBe('dueAt');
});
```

- [ ] **Step 2: Run them and see them fail.**
  - Run: `docker compose --profile dev run --rm dev npx vitest run packages/shared`
  - Expected: FAIL. `DUE_DATE_ERROR` and `DUE_BOTH_ERROR` are not exported, `dueDate` is an unknown key, and `sort` rejects `dueDate`.

- [ ] **Step 3: Implement the shared schemas.** In `packages/shared/src/todo.ts`, add next to `DueAtSchema`:

```ts
export const DUE_DATE_ERROR = 'Due date must be a real date in YYYY-MM-DD format';
export const DUE_BOTH_ERROR = 'Send either dueDate or dueAt, not both';

/** A date-only deadline is the last second of that day in UTC (the rule migration 1759190400002 used). */
export function endOfUtcDay(date: string): string {
  return `${date}T23:59:59.000Z`;
}

/** The brief's date-only deadline. ISO 8601 allows year 0000; the deadline range is 0001–9999. */
const DueDateSchema = z.iso
  .date({ error: DUE_DATE_ERROR })
  .refine((value) => !value.startsWith('0000'), {
    error: DUE_DATE_ERROR,
    when: (payload) => payload.issues.length === 0,
  })
  .nullable()
  .describe(
    "The brief's date-only deadline, YYYY-MM-DD: due at 23:59:59 UTC that day. null clears it. Send this or dueAt, not both.",
  );

interface DeadlineFields {
  dueDate?: string | null;
  dueAt?: string | null;
}

/** Both spellings of the deadline are one field; sending both is ambiguous even if one is null. */
function rejectBothDeadlines(value: DeadlineFields, ctx: z.RefinementCtx): void {
  if ('dueDate' in value && 'dueAt' in value) {
    ctx.addIssue({ code: 'custom', path: ['dueDate'], message: DUE_BOTH_ERROR });
  }
}

/** `dueDate` becomes the single internal `dueAt`, so nothing past validation sees two fields. */
function toDueAt<T extends DeadlineFields>({ dueDate, ...rest }: T): Omit<T, 'dueDate'> {
  if (dueDate === undefined) return rest;
  return { ...rest, dueAt: dueDate === null ? null : endOfUtcDay(dueDate) };
}
```

Then:
- In `CreateTodoSchema`, add `dueDate: DueDateSchema.optional()` to the strict object and chain `.superRefine(rejectBothDeadlines).transform(toDueAt)`.
- In `UpdateTodoSchema`, do the same: chain the existing non-empty `.refine` (with the new message), then `.superRefine(rejectBothDeadlines).transform(toDueAt)`.
- In `TodoViewSchema`, after `dueAt`, add:

```ts
  dueDate: z.iso
    .date()
    .nullable()
    .describe('The UTC calendar date of dueAt (YYYY-MM-DD), or null when there is none.'),
```

In `packages/shared/src/listQuery.ts`:

```ts
  sort: z
    .enum([...TODO_SORT_FIELDS, 'dueDate'])
    .default('createdAt')
    .describe('createdAt, dueAt or title; dueDate is accepted as the brief\'s name for dueAt.')
    .transform((sort): TodoSortField => (sort === 'dueDate' ? 'dueAt' : sort)),
```

`TODO_SORT_FIELDS` stays `['createdAt', 'dueAt', 'title']`, so the web sort options do not change.

The OpenAPI document is built with `z.toJSONSchema(schema, { io })` in `apps/api/src/http/openapi.ts`. Request schemas use `io: 'input'`, so their pipes and transforms document the input shape. If a transform makes a schema unrepresentable, document the input side only, and keep the conformance tests green.

- [ ] **Step 4: Run the shared tests and see them pass.**
  - Run: `docker compose --profile dev run --rm dev npx vitest run packages/shared`
  - Expected: PASS.

- [ ] **Step 5: Write the failing domain and API tests.**
  - **`apps/api/tests/domain/todo.test.ts`:** `toView` returns `dueDate` as the UTC date: `dueAt` `2026-10-11T02:00:00.000Z`, which is 22:00 on 10 Oct in New York, gives `'2026-10-11'`; a `null` deadline gives `null`.
  - **`apps/api/tests/service/requestHash.test.ts`:**

```ts
it('hashes dueDate and the equivalent dueAt as the same request', () => {
  expect(hashCreateRequest(CreateTodoSchema.parse({ title: 'x', dueDate: '2030-01-02' }))).toBe(
    hashCreateRequest(CreateTodoSchema.parse({ title: 'x', dueAt: '2030-01-02T23:59:59Z' })),
  );
});
```

  - **`apps/api/tests/http/todoRoutes.int.test.ts`,** using the file's existing request helpers and its both-adapters setup:
    - POST `{ title, dueDate: '2030-01-02' }` gives 201 with `dueAt: '2030-01-02T23:59:59.000Z'` and `dueDate: '2030-01-02'`.
    - PATCH `{ dueDate: '2030-03-04' }` gives 200 with `dueAt: '2030-03-04T23:59:59.000Z'`.
    - PATCH `{ dueDate: null }` clears both fields.
    - POST with both keys gives 400, and `errors` contains `{ field: 'dueDate', message: 'Send either dueDate or dueAt, not both' }`.
    - POST with `dueDate: '2026-02-30'` gives 400 naming `dueDate`.
    - `GET /api/todos?sort=dueDate&order=asc` returns the same order as `sort=dueAt&order=asc`.
    - With one `Idempotency-Key`, POST with `dueDate: '2030-01-02'` and then with `dueAt: '2030-01-02T23:59:59Z'`: the second is a replay (`Idempotent-Replayed: true`) with the same id.
  - **`e2e/api.spec.ts`:**

```ts
test('accepts the brief\'s dueDate and returns both deadline fields', async ({ request }) => {
  const response = await request.post('/api/todos', {
    data: { title: uniqueTitle('Brief date'), dueDate: '2030-01-02' },
  });
  expect(response.status()).toBe(201);
  expect(await response.json()).toMatchObject({
    dueAt: '2030-01-02T23:59:59.000Z',
    dueDate: '2030-01-02',
  });
});
```

- [ ] **Step 6: Implement `toView`.** In `apps/api/src/domain/todo.ts`, after the `dueAt` line:

```ts
    dueDate: todo.dueAt === null ? null : todo.dueAt.toISOString().slice(0, 10),
```

- [ ] **Step 7: Write the migration test helper, then the failing migration test.** Create `apps/api/tests/support/migrations.ts`, moving the runner setup out of `dueAtMigration.int.test.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { testDatabaseUrl } from './testDatabase.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));
const silentLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

export const migrate = (direction: 'up' | 'down', count: number) =>
  runner({
    databaseUrl: testDatabaseUrl(),
    dir: migrationsDir,
    direction,
    migrationsTable: 'pgmigrations',
    count,
    logger: silentLogger,
  });

/** Rolls back `name` and every later migration, so `migrate('up', 1)` re-applies `name` alone. */
export async function migrateDownThrough(pool: Pool, name: string): Promise<void> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT count(*) FROM pgmigrations WHERE name >= $1',
    [name],
  );
  await migrate('down', Number(rows[0]?.count ?? 0));
}
```

In `dueAtMigration.int.test.ts`:
- import `migrate` and `migrateDownThrough` from the helper;
- replace each `migrate('down', 1)` with `await migrateDownThrough(pool, '1759190400002_due-at-instants')`;
- keep `migrate('up', 1)`, which now re-applies 0002 alone;
- keep `afterAll`'s `migrate('up', Infinity)`.

Without this change, adding 0003 would make `down 1` roll back the wrong migration.

Create `apps/api/tests/migrations/dueDateMigration.int.test.ts`, in the same style as `dueAtMigration.int.test.ts`:

```ts
describe('due-date-in-cached-responses migration', () => {
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
    const dated = { id: todoId(1), title: 'Cached', dueAt: '2026-10-01T23:59:59.000Z', isDueSoon: false };
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
```

`bodyOf`, `pool` and `todoId` are defined exactly as in `dueAtMigration.int.test.ts`.

- [ ] **Step 8: Write the migration.** Create `apps/api/migrations/1759190400003_due-date-in-cached-responses.sql`. No comment line may start with the words of node-pg-migrate's separator markers.

```sql
-- Cached idempotent responses are replayed verbatim and parsed with the current response
-- schema, so they gain the derived `dueDate` field: the UTC calendar date of `dueAt`.

-- Up Migration
UPDATE idempotency_keys
SET response_body = response_body || jsonb_build_object(
  'dueDate',
  CASE
    WHEN response_body->>'dueAt' IS NULL THEN NULL
    ELSE to_jsonb(left(response_body->>'dueAt', 10))
  END
)
WHERE response_body ? 'dueAt';

-- Down Migration
UPDATE idempotency_keys SET response_body = response_body - 'dueDate' WHERE response_body ? 'dueDate';
```

Change the pinned `schemaVersion` in `PgDatabaseProbe.int.test.ts` and `healthRoutes.int.test.ts` to `'1759190400003_due-date-in-cached-responses'`.

- [ ] **Step 9: Update the fixtures, then regenerate the generated files.**
  - Add `dueDate` to every `TodoView` fixture that typecheck flags. Derive it as `dueAt?.slice(0, 10) ?? null`, or write the literal.
  - Regenerate the OpenAPI file: `docker compose --profile dev run --rm -e UPDATE_OPENAPI=1 dev npx vitest run apps/api/tests/http/openapi.test.ts`.
  - Then regenerate the API reference: `docker compose --profile dev run --rm -e UPDATE_API_DOCS=1 dev npx vitest run packages/diagrams/tests/apiDocs.test.ts`.

- [ ] **Step 10: Write the docs.**
  - **`docs/api.md`, Validation row:** add that `dueDate` (`YYYY-MM-DD`, a real date, year 0001–9999) is accepted instead of `dueAt` and means 23:59:59 UTC that day; that sending both is a 400; and that responses carry `dueAt` and `dueDate`, the UTC date of `dueAt`.
  - **`docs/api.md`, list parameters:** `sort=dueDate` is an alias of `dueAt`.
  - **README Assumptions:** add one item, placed after item 9:
    > Deadlines can be written as the brief's `dueDate` (`YYYY-MM-DD`, due at 23:59:59 UTC that day) or as an exact `dueAt` instant. Responses return both; `dueDate` is the UTC calendar date of `dueAt`, so a late-evening deadline west of UTC shows the next day's date there.
  - **`docs/decisions/0018-deadlines-accept-the-briefs-duedate.md`:** Status: `Accepted · 2026-10-03 · amends 0017`. Use the sections of the existing ADRs:
    - **Context:** the brief names `dueDate` with `YYYY-MM-DD`, and the API rejected it.
    - **Decision:** accept either field; both normalise to one `dueAt`; the end-of-day UTC rule; the derived `dueDate` in responses; the `sort` alias; the cached-body migration.
    - **Consequences:** brief clients work unchanged; the instant stays the source of truth; the UTC date can differ from the viewer's local date.
    - **Alternatives:** keep rejecting `dueDate`; store a date column too (two sources of truth); interpret `dueDate` in the viewer's timezone (the server has no viewer timezone).
  - **Add 0018 to `docs/decisions/README.md`.**
  - **ADR 0017:** add one line under its status, `Amended by [0018](0018-deadlines-accept-the-briefs-duedate.md).`
  - **Diagrams:** search the Mermaid blocks in `README.md` and `docs/*.md` for blocks that list `TodoView` or request fields (`grep -n "dueAt" README.md docs/*.md`). If a block lists those fields, add `dueDate` and run the diagrams command. If none does, the diagrams stay as they are.

- [ ] **Step 11: Run the gate and the e2e tests.**
  - Run: `docker compose --profile test run --rm --build test`
  - Expected: exit 0, coverage 100/100/100/100.
  - Run: the e2e subshell from Global Constraints.
  - Expected: exit 0.

- [ ] **Step 12: Commit**

```bash
git add -A packages/shared apps/api apps/web/tests e2e docs/api.md docs/api/index.html docs/decisions README.md docs/diagrams
git commit -m "feat(deadlines): accept the brief's dueDate alongside dueAt" \
  -m "Create and update accept the brief's YYYY-MM-DD dueDate (due 23:59:59 UTC that day) or an exact dueAt; both normalise to one dueAt. Responses add dueDate, the UTC date of dueAt. sort=dueDate is an alias. Cached idempotent responses gain dueDate. ADR 0018 amends 0017." \
  -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"   # name the model that actually wrote it
```

---

### Task 2: No-store without 304s, lone surrogates rejected, UTC API image

Commit subject: `fix(api): no-store without 304s, reject lone surrogates, UTC api image`

**Files:**
- Create: `apps/api/src/http/apiCacheHeaders.ts`; Test: `apps/api/tests/http/apiCacheHeaders.test.ts`
- Modify: `apps/api/src/http/createHttpApp.ts` (mount it before `express.json`)
- Modify: `packages/shared/src/todo.ts` (surrogate refinement); Test: `packages/shared/tests/todo.test.ts`
- Test: `apps/api/tests/http/todoRoutes.int.test.ts`
- Modify: `Dockerfile` (`api` stage)
- Docs: `docs/api.md` (Conventions), `docs/concurrency.md` ("What is not guaranteed")

**Interfaces:**
- Produces: `apiCacheHeaders: RequestHandler`.
- Consumes: Task 1's schemas. The surrogate refinement sits next to `hasNoNul`.

- [ ] **Step 1: Write the failing unit test** in `apps/api/tests/http/apiCacheHeaders.test.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { apiCacheHeaders } from '../../src/http/apiCacheHeaders.js';

describe('apiCacheHeaders', () => {
  it('marks the response no-store and drops conditional-GET headers', () => {
    const req = {
      headers: { 'if-none-match': '"3"', 'if-modified-since': 'Tue, 01 Oct 2030 00:00:00 GMT', 'if-match': '"3"' },
    } as unknown as Request;
    const set = vi.fn();
    const next = vi.fn() as NextFunction;
    apiCacheHeaders(req, { set } as unknown as Response, next);
    expect(set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(req.headers).toEqual({ 'if-match': '"3"' });
    expect(next).toHaveBeenCalledWith();
  });
});
```

- [ ] **Step 2: Write the failing integration tests** in `apps/api/tests/http/todoRoutes.int.test.ts`:
  - **Conditional GET:** create a todo, then `GET /api/todos/<id>` with `If-None-Match` equal to the returned ETag. Expect 200, the body's `id`, and `cache-control: no-store`.
  - **`no-store` on problem responses:** a 404 from an unknown id; a malformed JSON body (`.set('Content-Type','application/json').send('{')`, which is a 400); and a body over 16 kB (413).
  - **Lone surrogates:** send the raw JSON text, because `send(object)` would escape it:
    - POST `'{"title":"a\\ud800"}'` with an `Idempotency-Key`;
    - the same POST without the key;
    - POST `'{"title":"x","description":"\\udc00"}'`;
    - PATCH `'{"title":"\\ud800"}'` with `If-Match`.
    - Each is a 400 `application/problem+json`, and `errors` names the field with the surrogate message.

In `packages/shared/tests/todo.test.ts`:

```ts
it.each([
  ['a lone high surrogate', 'a\ud800'],
  ['a lone low surrogate', '\udc00b'],
])('rejects %s in title and description', (_label, text) => {
  expect(CreateTodoSchema.safeParse({ title: text }).error?.issues[0]?.message).toBe(
    'Title must not contain an unpaired surrogate character',
  );
  expect(CreateTodoSchema.safeParse({ title: 'x', description: text }).error?.issues[0]?.message).toBe(
    'Description must not contain an unpaired surrogate character',
  );
});

it('accepts a valid surrogate pair (emoji)', () => {
  expect(CreateTodoSchema.parse({ title: 'Ship 🚀', description: '✅ 🎉' }).title).toBe('Ship 🚀');
});
```

- [ ] **Step 3: Run them and see them fail.**
  - Run: `docker compose --profile dev run --rm dev npx vitest run apps/api/tests/http/apiCacheHeaders.test.ts packages/shared` (the unit tests), then the gate for the integration tests.
  - Expected: FAIL. The module is missing, there is a 304, there is no `cache-control`, and there is a 500 or 201 for surrogates.

- [ ] **Step 4: Implement.** Create `apps/api/src/http/apiCacheHeaders.ts`:

```ts
import type { RequestHandler } from 'express';

/** Every API response is computed per request: `isOverdue`/`isDueSoon` follow the clock. */
export const apiCacheHeaders: RequestHandler = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // The ETag versions the stored todo for If-Match only; a 304 would replay clock-derived flags.
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  next();
};
```

In `createHttpApp.ts`, mount `app.use('/api', apiCacheHeaders);` after `pinoHttp` and **before** `express.json`, so body-parser 400 and 413 responses carry it too.

In `packages/shared/src/todo.ts`, add next to `hasNoNul`:

```ts
/** A lone UTF-16 surrogate cannot be stored as `jsonb` (idempotency records), so it must be a 400, not a 500. */
const hasNoLoneSurrogate = (value: string) => !/\p{Cs}/u.test(value);
```

Chain `.refine(hasNoLoneSurrogate, { error: 'Title must not contain an unpaired surrogate character' })` after the title's `hasNoNul` refinement. Do the same for the description, with the Description message. The tsconfig `lib` is ES2023, which has no `isWellFormed`, hence the regex.

In the `Dockerfile` `api` stage, add right after `FROM node:24.21-alpine AS api`:

```dockerfile
# This stage starts from node again, so it does not inherit the base stage's TZ (`migrate` builds FROM api).
ENV TZ=UTC
```

- [ ] **Step 5: Write the docs.**
  - **`docs/api.md`, Conventions table:** add the row `| Caching | Every API response is \`Cache-Control: no-store\`; there is no conditional GET (\`If-None-Match\` is ignored). The ETag is for \`If-Match\` on PATCH and DELETE. |`.
  - **`docs/concurrency.md`, "What is not guaranteed":** add `- Conditional GET: \`If-None-Match\` is ignored and responses are \`no-store\`, because \`isOverdue\`/\`isDueSoon\` change with the clock without a version bump; the ETag only guards writes.`
  - **`docs/api.md`, Validation row:** add that title and description must not contain an unpaired UTF-16 surrogate.

- [ ] **Step 6: Run the gate, the e2e tests and the image check.**
  - Run: the gate. Expected: exit 0 and 100%.
  - Run: the e2e subshell. Expected: exit 0.
  - Run: `docker compose build api && docker compose run --rm --no-deps --entrypoint node api -e "console.log(process.env.TZ)"`
  - Expected: `UTC`.

- [ ] **Step 7: Commit** with the subject above and the trailer.

---

### Task 3: Web form and refresh fixes

Commit subject: `fix(web): keep the chosen due time, send only changed fields, refresh details`

**Files:**
- Modify: `apps/web/src/todos/useTodos.ts`; Test: `apps/web/tests/todos/useTodos.test.tsx`
- Modify: `apps/web/src/todos/components/TodoForm.tsx`; Test: `apps/web/tests/todos/components/TodoForm.test.tsx`
- Modify: `apps/web/src/todos/components/TodoDetailsPanel.tsx`; Test: `apps/web/tests/todos/components/TodoDetailsPanel.test.tsx`
- Modify: `e2e/deadlines.spec.ts` (the form-entry journey becomes deterministic)
- Docs: `README.md` (Assumptions: the badge refresh)

**Interfaces:**
- Produces:
  - `TODO_REFETCH_INTERVAL_MS`;
  - `REAL_DATE_ERROR = 'Enter a real date'`;
  - `type ChangedField = 'title' | 'description' | 'dueAt'`;
  - `changedFields(values, start): ChangedField[]`;
  - `rebaseValues(values, start, reloaded): TodoFormValues`;
  - `TodoForm` gains a `baseVersion?: number` prop;
  - `onSubmit` becomes `(input: CreateTodoInput, changed: readonly ChangedField[]) => Promise<void>`.
- Consumes: `TodoView.dueDate` from Task 1, which is unused by the form; the form keeps working from `dueAt`.

- [ ] **Step 1: Write the failing tests.**
  - **`useTodos.test.tsx`:** both the list query and the detail query have `options.refetchInterval === TODO_REFETCH_INTERVAL_MS`, and the constant is `60_000`. Import it under the new name.
  - **`TodoForm.test.tsx`:** keep the existing tests, and update the two this task changes:

```ts
it('keeps a chosen time while the date is briefly emptied (date → "" → date)', async () => {
  const user = userEvent.setup();
  render(<TodoForm submitLabel="Add task" onSubmit={vi.fn()} />);
  const date = screen.getByLabelText('Due date');
  const time = screen.getByLabelText('Due time');
  fireEvent.change(date, { target: { value: '2030-01-15' } });
  fireEvent.change(time, { target: { value: '09:00' } });
  fireEvent.change(date, { target: { value: '' } });
  expect(time).toHaveValue('');
  expect(time).toBeDisabled();
  fireEvent.change(date, { target: { value: '2030-01-16' } });
  expect(time).toHaveValue('09:00');
});

it('defaults to 17:00 only when no time was ever chosen', () => {
  render(<TodoForm submitLabel="Add task" onSubmit={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2030-01-15' } });
  expect(screen.getByLabelText('Due time')).toHaveValue('17:00');
});

it('clearing the date and saving clears the deadline', async () => {
  const onSubmit = vi.fn(async () => undefined);
  render(
    <TodoForm
      initialValues={{ title: 'x', description: '', dueDate: '2030-01-15', dueTime: '09:00' }}
      initialDueAt="2030-01-15T09:00:00.000Z"
      baseVersion={1}
      submitLabel="Save"
      onSubmit={onSubmit}
    />,
  );
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ dueAt: null }), ['dueAt']);
});

it('resends the exact stored instant for an untouched deadline and reports no change', async () => {
  const onSubmit = vi.fn(async () => undefined);
  render(
    <TodoForm
      initialValues={{ title: 'x', description: '', dueDate: '2030-01-15', dueTime: '09:00' }}
      initialDueAt="2030-01-15T09:00:42.123Z"
      baseVersion={1}
      submitLabel="Save"
      onSubmit={onSubmit}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ dueAt: '2030-01-15T09:00:42.123Z' }),
    [],
  );
});

it('reports a time-only edit as a deadline change', async () => {
  const onSubmit = vi.fn(async () => undefined);
  render(
    <TodoForm
      initialValues={{ title: 'x', description: '', dueDate: '2030-01-15', dueTime: '09:00' }}
      initialDueAt="2030-01-15T09:00:00.000Z"
      baseVersion={1}
      submitLabel="Save"
      onSubmit={onSubmit}
    />,
  );
  fireEvent.change(screen.getByLabelText('Due time'), { target: { value: '10:30' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ dueAt: new Date('2030-01-15T10:30').toISOString() }),
    ['dueAt'],
  );
});

it('shows "Enter a real date" under Due date for an impossible date and sends nothing', async () => {
  const onSubmit = vi.fn();
  render(
    <TodoForm
      initialValues={{ title: 'x', description: '', dueDate: '2026-02-30', dueTime: '10:00' }}
      submitLabel="Add task"
      onSubmit={onSubmit}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
  expect(screen.getByText('Enter a real date')).toBeVisible();
  expect(onSubmit).not.toHaveBeenCalled();
});

it('after a rebase, untouched fields adopt the reloaded values and edited fields keep the input', () => {
  const props = { submitLabel: 'Save', onSubmit: vi.fn(async () => undefined) };
  const { rerender } = render(
    <TodoForm
      {...props}
      initialValues={{ title: 'A', description: 'old', dueDate: '', dueTime: '' }}
      initialDueAt={null}
      baseVersion={1}
    />,
  );
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Mine' } });
  rerender(
    <TodoForm
      {...props}
      initialValues={{ title: 'Theirs', description: 'new', dueDate: '2030-01-15', dueTime: '09:00' }}
      initialDueAt="2030-01-15T09:00:00.000Z"
      baseVersion={2}
    />,
  );
  expect(screen.getByLabelText('Title')).toHaveValue('Mine');
  expect(screen.getByLabelText('Description')).toHaveValue('new');
  expect(screen.getByLabelText('Due date')).toHaveValue('2030-01-15');
});
```

The existing tests for "prefills 17:00 … clears both with the date" and the impossible-date message encode the replaced behaviour, so rewrite them as above. Add unit tests for the pure helpers `changedFields` and `rebaseValues`. Cover each field, a deadline edited versus untouched, and the case where the time is kept while the date is empty and the start had no deadline, which counts as unchanged.

  - **`TodoDetailsPanel.test.tsx`,** using the file's existing mocks of the client and `problem(412)`:
    - **No-change save:** click Edit, then Save. Expect no `update` call and the dialog back in view mode.
    - **Changed-only PATCH:** edit only the title. Expect `update` called with patch `{ title: 'New' }` and nothing else.
    - **Two writers:**
      - A opens Edit at v1 and changes the title to `Mine`.
      - Meanwhile the store moves to v2 with description `Theirs` (the mocked `get` returns it).
      - A saves and gets a 412. The notice shows, the description field shows `Theirs`, and the title still shows `Mine`.
      - A saves again. Expect `update` called with version 2 and patch `{ title: 'Mine' }`, so `Theirs` survives.
    - **Review Focus item 4:**
      - A changes the deadline.
      - The other writer changed the title.
      - After the 412 and reload, the title shows the other writer's value, and the deadline input keeps A's value.
      - Saving sends only `dueAt`.
  - **`e2e/deadlines.spec.ts`:** replace the form-entry test with:

```ts
test('a deadline entered in New York is stored as that instant and read in Tokyo', async ({ browser, request }) => {
  // January 2030: New York is on EST (UTC−5), so 09:30 there is exactly 14:30 UTC. No clock, no DST edge.
  const instant = '2030-01-15T14:30:00.000Z';
  const title = uniqueTitle('tz form');
  const local = (timeZone: string): string =>
    new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(instant),
    );

  const newYork = await browser.newContext({ timezoneId: 'America/New_York', locale: 'en-US' });
  const creator = await newYork.newPage();
  await creator.goto('/');
  await creator.getByRole('button', { name: '+ New task' }).click();
  const dialog = creator.getByRole('dialog', { name: 'New task' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Due date').fill('2030-01-15');
  await dialog.getByLabel('Due time').fill('09:30');
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog).toBeHidden();
  await expect(creator.getByRole('listitem').filter({ hasText: title })).toContainText(
    `Due ${local('America/New_York')}`,
  );
  await newYork.close();

  const stored = (await (await request.get('/api/todos')).json()) as { title: string; dueAt: string }[];
  expect(stored.find((todo) => todo.title === title)?.dueAt).toBe(instant);

  const tokyo = await browser.newContext({ timezoneId: 'Asia/Tokyo', locale: 'en-US' });
  const viewer = await tokyo.newPage();
  await viewer.goto('/');
  await expect(viewer.getByRole('listitem').filter({ hasText: title })).toContainText(
    `Due ${local('Asia/Tokyo')}`,
  );
  await tokyo.close();
});
```

- [ ] **Step 2: Run them and see them fail.**
  - Run: `docker compose --profile dev run --rm dev npx vitest run apps/web`
  - Expected: FAIL. The constant name is wrong, the detail query has no interval, the time is cleared, the API message shows, and PATCH sends every field.

- [ ] **Step 3: Implement `useTodos.ts`.** Rename the constant, and keep its doc comment accurate:

```ts
/** Overdue and due-soon flags are derived from the clock, so open views re-read them every minute. */
export const TODO_REFETCH_INTERVAL_MS = 60_000;
```

Use it in `useTodoList`, and add `refetchInterval: TODO_REFETCH_INTERVAL_MS` to `useTodo`.

- [ ] **Step 4: Implement `TodoForm.tsx`.**

```ts
export const REAL_DATE_ERROR = 'Enter a real date';

export type ChangedField = 'title' | 'description' | 'dueAt';

/** The deadline as one comparable value; a time kept while the date is empty is no deadline. */
const deadlineKey = ({ dueDate, dueTime }: TodoFormValues): string =>
  dueDate === '' ? '' : `${dueDate}T${dueTime === '' ? DEFAULT_DUE_TIME : dueTime}`;

export function changedFields(values: TodoFormValues, start: TodoFormValues): ChangedField[] {
  const changed: ChangedField[] = [];
  if (values.title !== start.title) changed.push('title');
  if (values.description !== start.description) changed.push('description');
  if (deadlineKey(values) !== deadlineKey(start)) changed.push('dueAt');
  return changed;
}

/** After a reload: untouched fields adopt the reloaded values; fields the user edited keep their input. */
export function rebaseValues(
  values: TodoFormValues,
  start: TodoFormValues,
  reloaded: TodoFormValues,
): TodoFormValues {
  const deadlineEdited = deadlineKey(values) !== deadlineKey(start);
  return {
    title: values.title === start.title ? reloaded.title : values.title,
    description: values.description === start.description ? reloaded.description : values.description,
    dueDate: deadlineEdited ? values.dueDate : reloaded.dueDate,
    dueTime: deadlineEdited ? values.dueTime : reloaded.dueTime,
  };
}

/** Whether the entered local date exists (the round trip that `toDueAt` uses). */
function hasRealDate(values: TodoFormValues): boolean {
  if (values.dueDate === '') return true;
  const instant = new Date(deadlineKey(values));
  return !Number.isNaN(instant.getTime()) && localParts(instant).dueDate === values.dueDate;
}
```

Refactor `toDueAt` to use `deadlineKey` and `hasRealDate`. Its raw pass-through for unreal dates stays, and the existing `toInput` test pins it.

In the component:

```ts
  const [start, setStart] = useState({ values: initialValues, dueAt: initialDueAt, version: baseVersion });
  // A new base version (the panel's reload after a 412) merges the reloaded values into the edit.
  if (baseVersion !== start.version) {
    setValues((current) => rebaseValues(current, start.values, initialValues));
    setStart({ values: initialValues, dueAt: initialDueAt, version: baseVersion });
  }
```

Replace the `initial` state with `start` everywhere.

Change `change` so that an emptied date keeps the time:

```ts
  const change = (name: keyof TodoFormValues, value: string) =>
    setValues((current) => {
      const next = { ...current, [name]: value };
      // Backspacing a date segment briefly reports '': keep the chosen time; 17:00 only if none was ever chosen.
      if (name === 'dueDate' && value !== '' && current.dueTime === '') next.dueTime = DEFAULT_DUE_TIME;
      return next;
    });
```

On the time input, render `value={values.dueDate === '' ? '' : values.dueTime}` after `{...fieldProps('dueTime')}`. Keep the existing `disabled` and `onBlur`.

In `handleSubmit`:

```ts
    if (!hasRealDate(values)) {
      setErrors({ fields: { dueDate: REAL_DATE_ERROR }, general: null });
      return;
    }
    const input = toInput(values);
    const changed = changedFields(values, start.values);
    if (!changed.includes('dueAt') && start.dueAt !== undefined) input.dueAt = start.dueAt;
    // … existing schema check …
    await onSubmit(input, changed);
```

- [ ] **Step 5: Implement `TodoDetailsPanel.tsx`.**

```ts
  const save = async (input: CreateTodoInput, changed: readonly ChangedField[]) => {
    if (changed.length === 0) {
      setNotice(null);
      onEditingChange(false);
      return;
    }
    const patch: UpdateTodoInput = {};
    if (changed.includes('title')) patch.title = input.title;
    if (changed.includes('description')) patch.description = input.description;
    if (changed.includes('dueAt')) patch.dueAt = input.dueAt;
    try {
      await update.mutateAsync({ id: current.id, version: baseVersion, patch });
      // … unchanged …
```

Pass `baseVersion={baseVersion}` to `TodoForm`. Keep the conflict notice text, which still holds: "Your edits are kept — review and save again." Update the comment above `editBase` to say the form merges the reloaded values for untouched fields. `CreateTodoPanel`'s `onSubmit` ignores the second argument; no change is needed there beyond typecheck.

- [ ] **Step 6: Update the README.** Add to Assumptions, after item 2:
  > The server decides "Overdue" and "Due soon"; open views refresh every 60 s (and on focus and after any change), so a badge can lag a passing deadline by up to a minute.

- [ ] **Step 7: Run the gate (twice) and the e2e tests.** Expected: both gate runs exit 0 at 100%, and e2e exits 0.

- [ ] **Step 8: Commit** with the subject above and the trailer.

---

### Task 4: Screenshots and diagrams verified by the test gate

Commit subject: `feat(docs): screenshots and diagrams verified by the test gate`

**Files:**
- Modify: `packages/diagrams/src/repo.ts` (add `readBytes`); Test: `packages/diagrams/tests/repo.test.ts`, plus any fake `Repo` under `packages/diagrams/tests/support`
- Create: `packages/diagrams/src/hash.ts`; Test: `packages/diagrams/tests/hash.test.ts`
- Create: `packages/diagrams/src/screenshots.ts`; Test: `packages/diagrams/tests/screenshots.test.ts`
- Create: `packages/diagrams/src/depicts.ts`; Test: `packages/diagrams/tests/depicts.test.ts`
- Modify: `packages/diagrams/src/manifest.ts`, `render.ts`, `check.ts`, `bin.ts` (a `screenshots` argument), `paths.ts`, with their tests
- Modify: `packages/diagrams/package.json` (devDependency `"@foci/shared": "*"`, used only by the repository-sync test for fixture validation)
- Create: `screenshots/playwright.config.ts`, `screenshots/scenes.spec.ts`, `screenshots/fixtures/todos.json`
- Create: `docs/diagram-depicts.json`
- Modify: `Dockerfile` (new `screenshots` stage), `compose.yaml` (new `screenshots` service, `docs` profile), `vitest.config.ts` and `eslint.config.*`/`tsconfig` only as needed to include `screenshots/` like `e2e/` (typecheck yes, Vitest coverage no)
- Regenerate: `docs/images/screenshot.png`, `docs/images/edit-dialog.png`, `docs/images/manifest.json`, `docs/diagrams/manifest.json`
- Docs: `README.md` (embed `edit-dialog.png`), `docs/ui.md` (embed `edit-dialog.png` near the edit-dialog wireframe), `CLAUDE.md` (commands and the two rules), `AGENTS.md` if it lists commands

**Interfaces:**
- `hash.ts`: `sha256(data: string | Uint8Array): string`; `hashFiles(repo: Repo, paths: readonly string[]): string`, which is the sha256 over `path\0sha256(bytes)\n` for each path in order.
- `Repo.readBytes(path: string): Uint8Array`.
- `screenshots.ts`:
  - constants `SCREENSHOTS_DIR = 'docs/images'`, `SCREENSHOT_MANIFEST_PATH = 'docs/images/manifest.json'` and `SCREENSHOTS_COMMAND = 'docker compose --profile docs run --rm --build screenshots'`;
  - `interface ScreenshotManifest { inputsHash: string; playwright: string; images: Record<string, string> }`;
  - `screenshotInputs(repo): string[]`;
  - `playwrightVersion(repo): string`;
  - `inputsHash(repo): string`, which is `hashFiles` over `screenshotInputs` plus `playwright@<version>`;
  - `buildScreenshotManifest(repo): ScreenshotManifest`;
  - `writeScreenshotManifest(repo): ScreenshotManifest`;
  - `checkScreenshots(repo): string[]`.
- `depicts.ts`:
  - `DEPICTS_PATH = 'docs/diagram-depicts.json'`;
  - `parseDepicts(text: string): Record<string, string[]>`;
  - `depictsStamps(repo, diagrams): Map<string, string>`, which throws on a missing declaration or file;
  - `checkDepicts(repo, diagrams, manifest): string[]`.
- `ManifestEntry` gains `depictsHash: string`, and `buildManifest(diagrams, stamps)` takes the stamps.

- [ ] **Step 1: Write the failing unit tests for `hash.ts`, `Repo.readBytes`, `depicts.ts` and `screenshots.ts`.** Use the in-memory `Repo` fake from `packages/diagrams/tests/support`, extended with `readBytes`. Required cases:
  - **`hashFiles`:** stable for the same bytes; changes when a byte changes; changes when a path changes; and order matters, because callers sort.
  - **`screenshotInputs`:** sorted union of `apps/web/src/**`, `apps/web/index.html`, `packages/shared/src/**` and `screenshots/**`.
  - **`playwrightVersion`:** reads the root `package.json` `devDependencies['@playwright/test']`.
  - **`inputsHash`:** covers the input files and the Playwright version.
  - **`checkScreenshots`** returns `[]` when everything is current. Otherwise it returns one message per problem, each ending `— run: docker compose --profile docs run --rm --build screenshots`:
    - the manifest is missing;
    - the manifest is unreadable;
    - the inputs are stale ("screenshots are stale: a UI input changed");
    - a PNG hash differs ("<path> differs from the manifest (edited by hand?)");
    - a manifest image is missing;
    - a PNG under `docs/images` is not in the manifest;
    - an image referenced from `README.md` or `docs/*.md` is not in the manifest. The reference is a Markdown image `![…](…docs/images/x.png)`, with relative paths resolved per file.
  - **`parseDepicts`** rejects non-object JSON and values that are not string arrays, with a named message.
  - **`depictsStamps`:**
    - stamps each diagram with `hashFiles(repo, sortedPaths)`, and gives `[]` the hash of the empty list;
    - throws `<id>: no entry in docs/diagram-depicts.json`;
    - throws `<id>: depicts <path>, which does not exist` (Review Focus item 5).
  - **`checkDepicts`:**
    - "<id>: its depicted sources changed — review the diagram against the code, update it if needed, then run: docker compose --profile docs run --rm --build diagrams";
    - "<id>: not declared in docs/diagram-depicts.json";
    - "<id>: depicts missing file <path>";
    - "docs/diagram-depicts.json: unknown diagram <id>".
  - **Manifest round-trip** with `depictsHash`; `parseManifest` rejects an entry without it.
  - **`renderRepository`** writes `depictsHash` and refuses to write the manifest when a declaration is missing.

- [ ] **Step 2: Add the repository-sync tests,** next to the existing `checkRepository(fsRepo(root))` test in `check.test.ts`, and in `screenshots.test.ts`:

```ts
it('has docs/images in sync with the UI inputs (regenerate with the screenshots command)', () => {
  expect(checkScreenshots(fsRepo(root))).toEqual([]);
});

it('validates the screenshot fixtures against the shared response schemas', () => {
  const todos = JSON.parse(readFileSync(join(root, 'screenshots/fixtures/todos.json'), 'utf8'));
  expect(TodoViewListSchema.parse(todos)).toEqual(todos);
  for (const todo of todos) expect(TodoViewSchema.parse(todo)).toEqual(todo);
});
```

Here `root` is the repository root, resolved the way `check.test.ts` already resolves it.

- [ ] **Step 3: Run them and see them fail.**
  - Run: `docker compose --profile dev run --rm dev npx vitest run packages/diagrams`
  - Expected: FAIL. The modules, manifest and map are missing.

- [ ] **Step 4: Implement `hash.ts`, `readBytes`, `screenshots.ts`, `depicts.ts`,** and the `manifest.ts`, `render.ts` and `check.ts` changes, until the unit tests pass at 100% coverage.
  - Wire `checkDepicts` into `checkRepository`.
  - Extend `bin.ts`: with `process.argv[2] === 'screenshots'`, it runs `writeScreenshotManifest(fsRepo(process.cwd()))` and prints `Recorded N screenshots in docs/images/manifest.json`; otherwise it renders diagrams as today. `bin.ts` is already excluded from coverage; no new exclusion.

- [ ] **Step 5: Write the screenshot generator.**
  - **`screenshots/fixtures/todos.json`:** four `TodoView` objects consistent with a fixed "now" of `2026-10-03T12:00:00Z`, each with a fixed uuid, `version`, `createdAt` and a matching `dueDate`:
    - an overdue task: `dueAt` `2026-10-01T17:00:00.000Z`, `isOverdue: true`;
    - a due-soon task: `dueAt` `2026-10-04T09:00:00.000Z`, `isDueSoon: true`;
    - a completed task with a deadline;
    - a task with no deadline.
  - **`screenshots/playwright.config.ts`:**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  outputDir: '/tmp/screenshot-results',
  reporter: [['list']],
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://screenshots.local',
    viewport: { width: 1100, height: 760 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
  },
});
```

  - **`screenshots/scenes.spec.ts`:** serve the built app with no server. Every request to `http://screenshots.local` is fulfilled from the fixtures (`/api/todos`, `/api/todos/<id>` with `ETag`) or from the built files (`/tool/web`, with `/` serving `index.html`). Fix the page clock at `2026-10-03T12:00:00Z` with `page.clock.setFixedTime` before `goto`.
    - **Scene 1:** expect four list items, then `page.screenshot({ path: '/repo/docs/images/screenshot.png' })`.
    - **Scene 2:** open the due-soon task (its title button), click **Edit**, expect the **Due time** input, then screenshot `/repo/docs/images/edit-dialog.png`.
  - **Dockerfile,** after the `diagrams` stage:

```dockerfile
# Renders the README screenshots from the built web app with /api mocked from fixtures (spec 2026-10-03 brief-duedate §5.1).
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS screenshots
WORKDIR /tool
RUN npm init -y >/dev/null \
  && npm install --no-audit --no-fund --save-exact @playwright/test@1.63.0
COPY screenshots/ ./
COPY --from=build-web /repo/apps/web/dist ./web
COPY packages/diagrams/package.json ./diagrams/
COPY --from=build-diagrams /repo/packages/diagrams/dist ./diagrams/dist
WORKDIR /repo
CMD ["sh", "-c", "npx --prefix /tool playwright test -c /tool/playwright.config.ts && node /tool/diagrams/dist/bin.js screenshots"]
```

  - **`compose.yaml`:** add a `screenshots` service like `diagrams`: build target `screenshots`, `profiles: [docs]`, `user: root`, volume `.:/repo`.
  - **`scripts/check-playwright-pin.mjs`** must still pass. Both stages pin `1.63.0`.

- [ ] **Step 6: Write `docs/diagram-depicts.json`.** Declare every diagram id in `docs/diagrams/manifest.json`, all 33, mapped to the specific source files each depicts. Use specific files, not directories. Examples:
  - `api/create-post-api-todos` → `apps/api/src/http/todoRoutes.ts`, `apps/api/src/service/TodoService.ts`, `packages/shared/src/todo.ts`;
  - `architecture/data-model` → `apps/api/migrations/` files;
  - `ui/dialog-edit-task` → `apps/web/src/todos/components/TodoForm.tsx`, `TodoDetailsPanel.tsx`;
  - `readme/how-this-was-built` → `[]`.

- [ ] **Step 7: Generate and stamp.**
  - Run: `docker compose --profile docs run --rm --build diagrams`
  - Then run: `docker compose --profile docs run --rm --build screenshots`
  - Expected: `docs/diagrams/manifest.json` gains `depictsHash`, with SVGs unchanged; `docs/images/screenshot.png` and `edit-dialog.png` are written; `docs/images/manifest.json` is written. Look at both PNGs: the hero shows Overdue, Due soon, completed and no-deadline rows.

- [ ] **Step 8: Write the docs.**
  - **README:** embed `docs/images/edit-dialog.png`, under the hero or in the Usage section, with alt text "Editing a task: due date and time".
  - **`docs/ui.md`:** embed it beside the edit-dialog wireframe, using the relative path `images/edit-dialog.png`.
  - **CLAUDE.md Commands:** add `docker compose --profile docs run --rm --build screenshots    # regenerate docs/images after any UI change`.
  - **CLAUDE.md Conventions:** add these two rules, verbatim in substance:
    - `Any UI change (apps/web/src, apps/web/index.html, packages/shared/src, screenshots/) regenerates the screenshots in the same commit — the gate prints the command.`
    - `A diagram flagged stale (its depicted sources in docs/diagram-depicts.json changed) is updated to match the code before re-stamping with the diagrams command. Never re-stamp without reviewing.`

- [ ] **Step 9: Run the gate (twice) and the e2e tests,** and confirm the CI diagrams job would pass: running the diagrams command again leaves `git status --porcelain docs/diagrams` empty. Expected: exit 0 at 100% for both gate runs, e2e exits 0, no diff.

- [ ] **Step 10: Commit** with the subject above and the trailer, including the generated images and manifests.

---

### Task 5: One-time sync, documentation fixes, deferred pagination, self-contained repository

Commit subject: `docs: sync diagrams, design changes, deferred pagination, self-contained repo`

**Files:**
- Modify: Mermaid blocks in `README.md`, `docs/architecture.md`, `docs/api.md`, `docs/concurrency.md`, `docs/testing.md`, `docs/ui.md`, wherever the audit finds drift; regenerate `docs/diagrams/**`
- Modify: `CLAUDE.md`, `docs/testing.md`, `README.md` (fixes 7, 10, 13, Design changes, assumption 7, line 255)
- Modify: `docs/architecture.md:127` (fix 8), `docs/decisions/0017-deadlines-are-utc-instants.md` (fix 9), `docs/decisions/0014-curated-prs-and-ai-attribution.md:11`, `docs/ui.md:7`
- Create: `docs/decisions/0019-pagination-deferred.md`; Modify: `docs/decisions/README.md`
- Modify: `apps/api/src/repository/postgres/PgTodoRepository.ts`, a one-line comment on `list`. This is a comment only, so no test change; it is not a screenshot input.
- Modify: `docs/superpowers/specs/2026-09-30-foci-todo-design.md` (banners), plus the other specs and plans under `docs/superpowers/` that mention tooling outside this repository
- Delete the four plan files whose only subject is tooling outside this repository, one per directory, each matched by its number prefix: `docs/superpowers/plans/2026-09-30-foci-todo/12-*.md`, `docs/superpowers/plans/2026-10-02-acceptance-storyboard/02-*.md`, `docs/superpowers/plans/2026-10-02-docs-diagrams/03-*.md`, `docs/superpowers/plans/2026-10-03-api-docs-and-deadlines/03-*.md`

**Interfaces:**
- Consumes:
  - Task 4's gate, which flags stale diagrams after the Task 1–3 code changes;
  - the regenerate commands.

- [ ] **Step 1: Run the audit.**
  - Run the gate, or `docker compose --profile dev run --rm dev npx vitest run packages/diagrams`. It lists every diagram whose depicted sources changed in Tasks 1–3.
  - Compare **every** Mermaid diagram and wireframe against the current code, not only the flagged ones. Covers field lists, status codes, middleware order (`apiCacheHeaders`), the edit dialog's Due date and Due time with the kept time, changed-only PATCH, the 412 merge, and the refresh.
  - Fix any drift in the Mermaid source, then run the diagrams command. This also re-stamps the diagrams.

- [ ] **Step 2: Fix the documentation.**
  - **Fix 7, mirror-path exception.**
    - In CLAUDE.md, under "Tests mirror source paths", and in `docs/testing.md` ("Mirrored paths"), add:
      > Exception: `apps/api/src/http/createHttpApp.ts`, the in-memory adapters (`InMemoryDatabase`, `InMemoryIdempotencyStore`, `InMemoryTodoRepository`, `InMemoryUnitOfWork`), the Postgres adapters (`PgIdempotencyStore`, `PgTodoRepository`) and `repository/postgres/rows.ts` are tested through the shared repository contract suite (`tests/repository/repository.contract.ts`) and the route tests rather than a mirrored file.
    - In the README's line 218, append "(except the adapters and app wiring covered by the shared contract and route suites — see docs/testing.md)".
  - **Fix 8:** reword `docs/architecture.md:127` to:
    > `CHECK` constraints are a backstop for core invariants (non-blank title, lengths, positive version); full validation lives in the shared schema.
  - **Fix 9, ADR 0017 consequence bullet.** Replace the 422 claim with:
    > A retry that spans the deploy replays if it sends no deadline; one still sending `dueDate` got a 400 at validation, before hashing.

    Do not touch migration `1759190400002`.
  - **Fix 10:** add `packages/diagrams/src/bin.ts` (command-line entry point) to the `docs/testing.md` coverage-exclusion line.
  - **Fix 13:** README assumption 4 becomes:
    > Updates are partial (`PATCH`); `PATCH` and `DELETE` require `If-Match`; `null` clears the description or deadline; the title cannot be cleared.

    Assumption 5 keeps "Complete/incomplete … do not require `If-Match`".
  - **Design changes:** add a README section after Trade-offs:

```markdown
## Design changes

- **Developer portal → docs in the repository:** the in-app `/dev` section became Markdown guides with generated diagram images, so documentation ships with the code, not inside the product ([ADR 0015](docs/decisions/0015-docs-and-diagrams-in-the-repository.md)).
- **Served API explorer → static reference:** Swagger UI moved from a live endpoint to a generated, offline `docs/api/index.html` ([ADR 0016](docs/decisions/0016-api-docs-as-a-repository-artifact.md)).
- **Date-only deadline → exact instant, with the brief's `dueDate` kept:** deadlines are UTC instants so "overdue" means the same in every timezone, and the brief's `YYYY-MM-DD` field is still accepted and returned ([ADR 0017](docs/decisions/0017-deadlines-are-utc-instants.md), [ADR 0018](docs/decisions/0018-deadlines-accept-the-briefs-duedate.md)).
```

  - **Banners in `2026-09-30-foci-todo-design.md`:** directly under each section heading that still describes one of the following, add one italic line:
    - `dueDate` as the only deadline: `_Superseded by ADR 0017 and ADR 0018._`
    - the `/dev` portal: `_Superseded by ADR 0015._`
    - the served `/api/docs`: `_Superseded by ADR 0016._`

    Delete nothing.

- [ ] **Step 3: Record deferred pagination.**
  - Create `docs/decisions/0019-pagination-deferred.md`. Status: `Accepted (deferred) · 2026-10-03`.
    - **Context:** a proof of concept with small lists; the list endpoint returns the whole filtered list, which is one query, sorted in milliseconds at expected sizes.
    - **Decision:** no pagination now.
    - **Consequences, including what it costs as lists grow:** every response and every 60 s refresh carries the whole list; sorting by due date or title, and the overdue and due-soon filters, have no index.
    - **The approach that would be built:**
      - keyset (cursor) pagination with optional `limit` (default 50, maximum 100) and `cursor`;
      - a request without them returns the first page, so the first call and the array response stay backward compatible;
      - the next page in a `Link: <…>; rel="next"` header;
      - one index per sort, and a partial index on `due_at` for incomplete todos;
      - a "Load more" button.
    - **Alternatives:** offset pages (slow at depth, and they skip or repeat rows when the list changes); a `{ items, nextCursor }` envelope (breaks the array contract).
  - Add 0019 to the ADR index.
  - Change README assumption 7 to: `No pagination (proof of concept); see [ADR 0019](docs/decisions/0019-pagination-deferred.md) for the designed, backward-compatible approach.`
  - In `PgTodoRepository.ts`, above `async list(`, add `// Returns the whole filtered list by design; pagination is deferred (ADR 0019).`

- [ ] **Step 4: Make the repository self-contained.**
  - **README line 255** becomes:
    > Built with Claude Code as a pair programmer under the rules in [CLAUDE.md](CLAUDE.md). Requirements, decisions and the plan are in [docs/superpowers](docs/superpowers); every architectural choice has an [ADR](docs/decisions/README.md). Every work package was reviewed before merging; findings were fixed in the PR that raised them. AI-assisted commits carry a `Co-Authored-By` trailer.
  - **ADR 0014:11:** drop the final clause, which says where milestone reviews live.
  - **`docs/ui.md:7`:** delete the line.
  - **The four plan files** listed under Files: delete them.
  - **Remaining mentions:** edit them out of the other specs and plans, including plan indexes that list the deleted files and any "Global constraints" lines that mention that repository. Keep each document coherent, for example by removing a row from an index table.
  - **Verify** that `git grep -n -i -e 'Foci''ToDo-review' -e 'review'' repo' -e 'companion'' repo'` prints nothing. The split quotes keep this plan from matching its own check.

- [ ] **Step 5: Confirm the screenshots are still current.** This task changes no screenshot input; the `PgTodoRepository` comment is not an input. The gate's screenshot check must pass unchanged. If it fails, an input was touched by mistake: revert that change.

- [ ] **Step 6: Run the gate (twice) and the e2e tests.** Expected: exit 0 at 100% for both, and e2e exits 0. The diagrams command leaves no diff.

- [ ] **Step 7: Commit** with the subject above and the trailer.

---

### Task 6: Verification, PR and merge (controller)

- [ ] **Step 1: Curate the branch.**
  - Autosquash all fixups: `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash main`.
  - `git log --oneline main..` must show exactly six commits: the spec and plan, then Tasks 1–5.
  - Every commit must be green. Run the gate at each commit with `git rebase -x`, or check out each commit in turn.
- [ ] **Step 2: Run the spec §8 verification and record the evidence** (exit codes and summaries):
  - the gate twice;
  - the e2e tests;
  - `docker compose up --build -d --wait` and the README smoke test;
  - the three curl checks;
  - the two freshness-gate checks on a scratch branch, which is deleted afterwards.
- [ ] **Step 3: Open the PR.**
  - Push with `--force-with-lease`.
  - Run `gh pr create` with a body summarising spec §2–§6 and the evidence, ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
  - Wait for CI to pass.
- [ ] **Step 4: Ask for approval to merge,** then run `gh pr merge --merge`.
- [ ] **Step 5: After merging,** run the fresh-clone check: `git clone` into `~/workspace/foci-clean-check`, then run the gate and the e2e tests there. Report the evidence, then delete the scratch clone.
