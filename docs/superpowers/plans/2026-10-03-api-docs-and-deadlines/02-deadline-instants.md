# Deadlines as UTC instants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A task's optional deadline is one exact moment (`dueAt`, UTC), scheduled with a local date and time, displayed in the viewer's locale, and flagged **Overdue** / **Due soon** by the server from a single clock — identical in every timezone.

**Architecture:** The contract changes in `@foci/shared` (`dueAt` replaces `dueDate`; `isDueSoon`; `status=due-soon`; `sort=dueAt`). The domain carries `dueAt: Date | null` and derives `isOverdue` / `isDueSoon` from `now: Date`. Storage moves to `due_at timestamptz` through a new migration that backfills end-of-day UTC. Both repository adapters filter against the request's `now`. The web form uses separate local **Due date** and **Due time** inputs (17:00 prefill) converted to a UTC instant.

**Tech Stack:** Zod 4, Express 5, Postgres 17 (`timestamptz`), node-pg-migrate (SQL), React 19, Vitest, Playwright.

**Spec:** [2026-10-03-api-docs-and-deadlines-design.md](../../specs/2026-10-03-api-docs-and-deadlines-design.md) §3 — with [00-index.md](00-index.md) (global constraints).

Branch: `feat/deadline-instants`, from `main` after plan 01's PR merges.

## Commit strategy (read first)

Changing the shared contract breaks the API's and the web app's typecheck until both are updated, so Tasks 1–5 cannot each be a green commit. Each of Tasks 1–5 ends with a **work-in-progress commit** (`wip(deadlines): <task>` + trailer) that passes the tests of the projects it finished (`--project shared`, `api-unit`, `api-db`, `web` as noted per task) — that is what its task review checks. At the end of Task 5, after the **full gate and the e2e suite** pass, squash immediately: `git reset --soft $(git merge-base main HEAD) && git commit` with the message `feat(deadlines): deadlines as UTC instants with a due-soon flag` (body summarising contract, storage/migration, derived flags, web; trailer naming every model that wrote code). Do this before Task 6 starts, so every commit that reaches `main` is green. Task 6 and any later fixes are separate commits, folded into their owners with `git commit --fixup=<sha>` and `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash main`.

## Constants and contract (verbatim)

- Request `dueAt`: RFC 3339 date-time **with** offset or `Z`; fractional seconds allowed; `null` clears; year 0001–9999 of the UTC instant; real calendar date. Error message: `Due must be a date and time with a timezone offset, e.g. 2026-10-03T18:00:00Z`.
- Normalised and response form: `new Date(value).toISOString()` (e.g. `2026-10-03T22:00:00.000Z`).
- `DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000`.
- `isOverdue = !isCompleted && dueAt !== null && dueAt < now`; `isDueSoon = !isCompleted && dueAt !== null && now <= dueAt && dueAt < now + DUE_SOON_WINDOW_MS`.
- `TODO_STATUSES = ['all', 'completed', 'incomplete', 'overdue', 'due-soon']`; `TODO_SORT_FIELDS = ['createdAt', 'dueAt', 'title']`.
- Migration `1759190400002_due-at-instants.sql`: add `due_at timestamptz`, `UPDATE todos SET due_at = (due_date + time '23:59:59') AT TIME ZONE 'UTC' WHERE due_date IS NOT NULL`, drop `due_date`. It also rewrites cached idempotency responses (table `idempotency_keys`, column `response_body jsonb`) so replays match the new shape: `UPDATE idempotency_keys SET response_body = (response_body - 'dueDate') || jsonb_build_object('dueAt', CASE WHEN response_body->>'dueDate' IS NULL THEN NULL ELSE to_jsonb(to_char(((response_body->>'dueDate')::date + time '23:59:59'), 'YYYY-MM-DD"T"HH24:MI:SS".000Z"')) END, 'isDueSoon', false) WHERE response_body ? 'dueDate'`. Down: add `due_date date`, `UPDATE todos SET due_date = (due_at AT TIME ZONE 'UTC')::date WHERE due_at IS NOT NULL`, drop `due_at`, and the inverse rewrite of `idempotency_keys.response_body` (`dueAt` → `dueDate` as the UTC date, drop `isDueSoon`, `WHERE response_body ? 'dueAt'`).
- Web: inputs labelled **Due date** (`type="date"`) and **Due time** (`type="time"`); prefill time `17:00` when a date is entered and the time is empty; clearing the date clears both; badges **Overdue** and **Due soon**; Show option **Due soon**; Sort option **Due**.

## Review Focus

1. **Exact boundaries:** at `dueAt == now` a task is due soon, not overdue; at `now + 24h` exactly it is not yet due soon. Pinned in Task 2 (domain tests at −1 ms / 0 / +1 ms and at the 24 h edge) and Task 3 (contract tests).
2. **Offsets and normalisation:** `2026-10-03T18:00:00-04:00` and `2026-10-03T22:00:00Z` are the same deadline (same stored instant, same response string, same idempotency hash). Pinned in Tasks 1, 2 and 4.
3. **Ambiguous input is rejected, never guessed:** a bare date, a local date-time without an offset, `2026-02-30T…`, year `0000` or `10000` → 400 naming `dueAt`. Pinned in Task 1 (schema) and Task 4 (HTTP).
4. **Viewer timezone independence:** the same task shows the same Overdue / Due soon status in New York and Tokyo with different local times. Pinned in Task 6 (two-timezone e2e).
5. **Migration keeps every existing status:** a row due `2026-10-01` becomes `2026-10-01T23:59:59.000Z`. Pinned in Task 3 (migration down/up test).

---

### Task 1: Shared contract — `dueAt`, `isDueSoon`, list query

**Files:** `packages/shared/src/todo.ts`, `packages/shared/src/listQuery.ts`, `packages/shared/tests/todo.test.ts`, `packages/shared/tests/listQuery.test.ts`.

**Interfaces (produced):** `CreateTodoSchema` / `UpdateTodoSchema` field `dueAt` (output: normalised ISO UTC string or `null`); `TodoViewSchema` fields `dueAt: string | null` (ISO datetime) and `isDueSoon: boolean`; `TODO_STATUSES`, `TODO_SORT_FIELDS` as above; exported `DUE_AT_ERROR`.

- [ ] **Step 1: Failing tests.** Update `todo.test.ts`: replace every `dueDate` case with `dueAt` equivalents and add:
  - accepted and normalised: `2026-10-03T22:00:00Z` → `2026-10-03T22:00:00.000Z`; `2026-10-03T18:00:00-04:00` → `2026-10-03T22:00:00.000Z`; `2026-10-03T22:00:00.123+00:00` → `2026-10-03T22:00:00.123Z`; `0001-01-01T00:00:00Z` accepted; `null` accepted (clears);
  - rejected with `path: ['dueAt']` and `DUE_AT_ERROR`: `2026-10-03`, `2026-10-03T22:00:00` (no offset), `2026-02-30T10:00:00Z`, `0000-01-01T00:00:00Z`, `10000-01-01T00:00:00Z`, `0001-01-01T00:00:00+01:00` (year 0000 in UTC), `9999-12-31T23:59:59-01:00` (year 10000 in UTC), `not a date`, `''`, a number;
  - `TodoViewSchema` requires `isDueSoon` and an ISO `dueAt` or `null`; the strict-unknown-field list includes `dueDate` (now unknown) and `isDueSoon` (read-only, not accepted in requests);
  - "At least one of title, description or dueAt is required".
  Update `listQuery.test.ts`: `status=due-soon` accepted; `sort=dueAt` accepted; `sort=dueDate` rejected (400).
- [ ] **Step 2:** run `docker compose --profile dev run --rm dev npx vitest run --project shared` → FAIL.
- [ ] **Step 3: Implement.**

```ts
export const DUE_AT_ERROR = 'Due must be a date and time with a timezone offset, e.g. 2026-10-03T18:00:00Z';

/** An exact moment: RFC 3339 with an offset (never a bare date or local time), normalised to UTC. */
const DueAtSchema = z.iso
  .datetime({ offset: true, error: DUE_AT_ERROR })
  .refine(
    (value) => {
      const year = new Date(value).getUTCFullYear();
      return year >= 1 && year <= 9999;
    },
    { error: DUE_AT_ERROR },
  )
  .transform((value) => new Date(value).toISOString())
  .nullable();
```

Use `dueAt: DueAtSchema.optional()` in both request schemas; `TodoViewSchema`: `dueAt: z.iso.datetime().nullable()`, `isDueSoon: z.boolean()` (after `isOverdue`). `z.iso.datetime({ offset: true })` already rejects impossible dates, a missing offset, `+0200` and `HH:MM` without seconds; the refine checks only the year range, on the normalised UTC result. `listQuery.ts`: the constants above.
- [ ] **Step 4:** `--project shared` PASS (other workspaces won't typecheck until Tasks 2–5 — expected).
- [ ] **Step 5:** commit `wip(deadlines): shared contract` (trailer).

### Task 2: Domain and service — instants, `isDueSoon`, normalised hash

**Files:** `apps/api/src/domain/todo.ts`, `apps/api/src/domain/clock.ts` (remove `utcDate`), `apps/api/src/service/TodoService.ts`, `apps/api/src/service/requestHash.ts`, `apps/api/src/repository/ports.ts` (signature only), tests: `apps/api/tests/domain/todo.test.ts`, `apps/api/tests/domain/clock.test.ts` (drop `utcDate` cases), `apps/api/tests/service/TodoService.test.ts`, `apps/api/tests/service/requestHash.test.ts`, `apps/api/tests/support/todoFactory.ts`.

**Interfaces (produced):** `Todo.dueAt: Date | null`; `TodoPatch.dueAt?: Date | null`; `DUE_SOON_WINDOW_MS`; `isOverdue(todo, now: Date)`, `isDueSoon(todo, now: Date)`, `toView(todo, now: Date)`; `TodoRepository.list(query, now: Date)`.

- [ ] **Step 1: Failing tests** (domain, with `NOW = new Date('2026-10-03T12:00:00.000Z')`): overdue at `NOW − 1 ms` true, at `NOW` false, at `NOW + 1 ms` false; due soon at `NOW` true, at `NOW + 24h − 1 ms` true, at `NOW + 24h` false, at `NOW − 1 ms` false; completed → both false; no deadline → both false; never both true; `toView` serialises `dueAt` with `toISOString()` (or `null`) and includes both flags. Service: create/list/get/update/complete pass `clock.now()` through; create stores `new Date(input.dueAt)`; update maps `dueAt` string → `Date` and `null` → `null`; list passes `now` to the repository. Request hash: `2026-10-03T18:00:00-04:00` and `2026-10-03T22:00:00Z` (after schema parsing) hash equal; different instants hash differently.
- [ ] **Step 2:** run the api-unit project → FAIL.
- [ ] **Step 3: Implement.**

```ts
export const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Overdue: incomplete and the deadline moment has passed. Identical in every timezone. */
export function isOverdue(todo: Todo, now: Date): boolean {
  return !todo.isCompleted && todo.dueAt !== null && todo.dueAt.getTime() < now.getTime();
}

/** Due soon: incomplete and the deadline is now or within the next 24 hours. */
export function isDueSoon(todo: Todo, now: Date): boolean {
  if (todo.isCompleted || todo.dueAt === null) return false;
  const remaining = todo.dueAt.getTime() - now.getTime();
  return remaining >= 0 && remaining < DUE_SOON_WINDOW_MS;
}
```

`toView(todo, now)` returns `dueAt: todo.dueAt?.toISOString() ?? null` (write it without optional chaining if branch coverage needs it), `isOverdue`, `isDueSoon`. Service: replace `today()` with `now()`; `requestHash` uses the schema-normalised `input.dueAt ?? null` (already UTC).
- [ ] **Step 4:** `--project shared` and the domain/service tests in `api-unit` PASS (the in-memory adapter may need Task 3's signature change first — do that part now if the service tests need it).
- [ ] **Step 5:** commit `wip(deadlines): domain and service` (trailer).

### Task 3: Storage — migration, Postgres and in-memory adapters

**Files:** create `apps/api/migrations/1759190400002_due-at-instants.sql`; modify `apps/api/src/repository/postgres/rows.ts`, `PgTodoRepository.ts`, `apps/api/src/repository/in-memory/ordering.ts`, `InMemoryTodoRepository.ts`; tests: `apps/api/tests/repository/repository.contract.ts`, `apps/api/tests/repository/in-memory/ordering.test.ts`, `apps/api/tests/migrations/schema.int.test.ts`.

- [ ] **Step 1: Failing tests.**
  - Contract (runs on both adapters), with a fixed `NOW`: `list({status:'overdue'}, NOW)` returns only incomplete todos with `dueAt < NOW`; `list({status:'due-soon'}, NOW)` returns only incomplete todos with `NOW ≤ dueAt < NOW + 24h` (include todos at exactly `NOW`, `NOW + 24h − 1 ms`, `NOW + 24h`, `NOW − 1 ms`, completed ones and ones without a deadline); `sort: 'dueAt'` asc and desc with deadlines in a different order than creation and with `null` last in both orders; `dueAt` round-trips as a `Date` equal to the stored instant to the millisecond; patching `dueAt` to a `Date` and to `null`.
  - Ordering unit tests for `matchesStatus('due-soon', NOW)` and the `dueAt` comparator (nulls last both ways, ties fall through to the tie-break).
  - Schema int test: `due_at` is `timestamptz` and `due_date` no longer exists (`information_schema.columns`); **migration test**: with the node-pg-migrate `runner` (as in `tests/support/globalSetup.ts`, `count: 1`), migrate `down` one step, insert a row with `due_date = '2026-10-01'`, migrate `up`, assert `due_at = '2026-10-01T23:59:59.000Z'`; also seed an `idempotency_keys` row whose `response_body` has `dueDate: '2026-10-01'` (and one with `dueDate: null`) before `up`, and assert the body is rewritten to `dueAt: '2026-10-01T23:59:59.000Z'` (`null` stays `null`) with `isDueSoon: false` and no `dueDate`; then assert the down migration maps the todo back to `2026-10-01` and restores the stored body (run down, check, run up again) and finally leave the database at the latest migration (use `afterAll`/`finally`). This file is in the serial `api-db` project, so it may change the schema temporarily.
- [ ] **Step 2:** run `docker compose --profile dev run --rm dev npx vitest run --project api-db` and the in-memory/ordering tests → FAIL.
- [ ] **Step 3: Implement.**
  - Migration SQL (constants section). `rows.ts`: select `due_at` as is (`pg` returns `Date` for `timestamptz`); `TodoRow.due_at: Date | null`; `toTodo` maps `dueAt`. Remove the `to_char` comment about dates.
  - `PgTodoRepository`: status filters `overdue: 'NOT is_completed AND due_at < $1::timestamptz'`, `'due-soon': "NOT is_completed AND due_at >= $1::timestamptz AND due_at < $1::timestamptz + interval '24 hours'"`; bind `[now]` for those two statuses, `[]` otherwise; sort key `dueAt: 'due_at'` with `NULLS LAST` when sorting by `dueAt`; insert/update write `due_at`.
  - In-memory `ordering.ts`: `matchesStatus(status, now)` with `'due-soon'` using `isDueSoon`; comparator `compareDueAts(a: Date | null, b: Date | null, direction)` (nulls last, `getTime()` comparison); `InMemoryTodoRepository` stores `dueAt` as a `Date` (keep the existing `structuredClone` detachment; cover that a returned `dueAt` is detached).
- [ ] **Step 4:** `api-unit` and `api-db` PASS with 100% coverage of `apps/api/src` (`docker compose --profile dev run --rm dev npx vitest run --project api-unit --project api-db --coverage` — web may still fail typecheck). Commit `wip(deadlines): storage and migration` (trailer).

### Task 4: HTTP, OpenAPI document and generated docs

**Files:** `apps/api/tests/http/todoRoutes.int.test.ts` (and any HTTP test that sends or reads `dueDate`), `apps/api/src/http/openapi.ts` (only if it names fields or statuses explicitly), `apps/api/openapi.json` (regenerated), `docs/api/index.html` (regenerated).

- [ ] **Step 1: Failing tests.** HTTP int tests: create with `dueAt` offset form → 201, response `dueAt` normalised to UTC, `isDueSoon` / `isOverdue` from the server clock (use deadlines minutes in the past / hours in the future, never near a boundary); create with bare date → 400 naming `dueAt`; `PATCH {"dueAt": null}` clears; `GET /api/todos?status=due-soon` and `?sort=dueAt`; `?sort=dueDate` → 400; idempotent replay with the same instant in another offset → replayed (same key), a different instant with the same key → 422.
- [ ] **Step 2:** FAIL; **Step 3:** implement whatever the routes/OpenAPI need (the routes already parse with the shared schemas); regenerate: `docker compose --profile dev run --rm -e UPDATE_OPENAPI=1 dev npx vitest run apps/api/tests/http/openapi.test.ts`, then `docker compose --profile dev run --rm -e UPDATE_API_DOCS=1 dev npx vitest run packages/diagrams/tests/apiDocs.test.ts`; both re-run green without the variables. The OpenAPI conformance tests must still prove every status is documented (add `due-soon` / `dueAt` to any explicit enum lists).
- [ ] **Step 4:** `api-unit`, `api-db`, `diagrams` PASS. Commit `wip(deadlines): HTTP contract and generated docs` (trailer).

### Task 5: Web app — local date and time, locale display, badges, filter

**Files:** `apps/web/src/todos/format.ts`, `apps/web/src/todos/components/TodoForm.tsx` (+ CSS if needed), `TodoItem.tsx`, `TodoItem.module.css`, `TodoDetailsPanel.tsx`, `TodoFilters.tsx`, and their tests under `apps/web/tests/todos/…`, `apps/web/tests/todos/format.test.ts`, `apps/web/tests/support/fixtures.tsx`, `apps/web/tests/api/todoClient.test.ts`, `CreateTodoPanel.test.tsx`, `e2e/todos.spec.ts` (date entry via **Due date** with the automatic 17:00, and the new due display).

**Interfaces:** `formatDeadline(iso: string, locale?: string, timeZone?: string): string` (medium date + short time); `TodoFormValues = { title, description, dueDate, dueTime }`; `toInput(values)` returns `dueAt` (`null` when `dueDate` is empty; otherwise `new Date(\`${dueDate}T${dueTime || '17:00'}\`)` — if invalid, pass the raw local string so the schema rejects it and the error shows on the date field); `toFormValues(todo)` splits a UTC `dueAt` into local `YYYY-MM-DD` and `HH:MM` using the browser's local getters.

- [ ] **Step 1: Failing tests** (pass an explicit `locale` and `timeZone` in formatter tests so they don't depend on the container's timezone; for form conversion tests set the expectation from the same local-time construction, e.g. `new Date('2026-10-03T17:00').toISOString()`):
  - entering a date with an empty time sets the time to `17:00`; clearing the date clears the time; submitting sends a UTC `dueAt`; editing an existing task prefills local date/time from `dueAt`; a server 400 on `dueAt` shows under **Due date**;
  - list row shows "Due <formatted>" and the **Overdue** or **Due soon** badge from `isOverdue` / `isDueSoon` (neither when both false); details dialog shows the formatted deadline and the badge;
  - filters: Show offers **Due soon** (`due-soon`); Sort by offers **Due** (`dueAt`); existing exact-label assertions (PR #20) still pass.
- [ ] **Step 2:** FAIL; **Step 3:** implement (badge class `dueSoon` styled like `overdue` with a neutral/warning colour token; keep `text-transform: uppercase` consistent with Overdue). **Step 4:** web tests PASS, the **full gate is green with 100% coverage** and the **e2e suite passes**. Commit `wip(deadlines): web app` (trailer), then squash Tasks 1–5 as described in "Commit strategy" before starting Task 6.

### Task 6: End-to-end, two-timezone proof, docs and decisions

**Files:** new `e2e/deadlines.spec.ts` (the `e2e/todos.spec.ts` update — **Due date** entry with the automatic 17:00 and the new due display — belongs to Task 5, because the squash happens only after e2e passes there); `README.md`, `docs/api.md`, `docs/architecture.md` (ER diagram `due_at timestamptz`; state note "isOverdue = deadline passed; isDueSoon = within 24 h"), `docs/ui.md` (wireframes: Due date/Due time inputs, Due soon badge, Show/Sort options), `docs/decisions/0017-deadlines-are-utc-instants.md`, `docs/decisions/0008-server-side-utc-overdue.md` (status → superseded by 0017), `docs/decisions/README.md`, `docs/superpowers/specs/2026-09-30-foci-todo-design.md` (DR-4, DR-8 rows: strike and point to the 2026-10-03 spec and ADR 0017); regenerated `docs/diagrams/**`.

- [ ] **Step 1: e2e.** `e2e/deadlines.spec.ts` (the lifecycle journey in `e2e/todos.spec.ts` was already updated in Task 5):

```ts
import { expect, test } from '@playwright/test';

test('the same deadline reads the same in New York and Tokyo', async ({ browser, request }) => {
  const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const tag = `tz-${Date.now()}`;
  for (const [title, dueAt] of [[`${tag} soon`, soon], [`${tag} late`, past]] as const) {
    expect((await request.post('/api/todos', { data: { title, dueAt } })).status()).toBe(201);
  }
  const local = (timeZone: string): string =>
    new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(soon),
    );
  for (const timezoneId of ['America/New_York', 'Asia/Tokyo']) {
    const context = await browser.newContext({ timezoneId, locale: 'en-US' });
    const page = await context.newPage();
    await page.goto('/');
    const soonRow = page.getByRole('listitem').filter({ hasText: `${tag} soon` });
    const lateRow = page.getByRole('listitem').filter({ hasText: `${tag} late` });
    await expect(soonRow.getByText('Due soon', { exact: true })).toBeVisible();
    await expect(lateRow.getByText('Overdue', { exact: true })).toBeVisible();
    await expect(soonRow).toContainText(local(timezoneId));
    await context.close();
  }
});
```

(Adjust locators to the real markup; the assertions — same badge in both zones, and each zone's row showing that zone's own rendering of the deadline, using the app's formatter options — must stay.)
- [ ] **Step 2: Docs.** README assumptions: (2) "Overdue means incomplete with a deadline moment already in the past — the same for every viewer, whatever their timezone"; (3) past deadlines are allowed; (9) deadlines are stored as UTC instants and shown in the viewer's timezone; new: "Due soon means incomplete with a deadline within the next 24 hours". Trade-offs: replace "Server-side UTC overdue … midnight edge case" with the instant model and its cost (a time must be chosen; 17:00 is prefilled). `docs/api.md`: `dueAt` format, examples with offsets, `status=due-soon`, `sort=dueAt`, `isDueSoon`. **ADR 0017** (Context: date-only deadlines were ambiguous across timezones; Decision: §3 of the spec; Consequences: positive — exact, timezone-independent status, time-of-day scheduling; negative — every deadline carries a time, requests must include an offset; Alternatives — date-only with UTC midnight (the old behaviour), date-only with a stored per-task timezone, client-computed status). ADR 0008 superseded by 0017. Regenerate diagrams (`docker compose --profile docs run --rm --build diagrams`) after editing Mermaid in `docs/architecture.md` and `docs/ui.md`; the README map rows stay valid (the gate checks them).
- [ ] **Step 3:** prettier on changed docs; gate (100%); e2e (all journeys, the new one included). Commit: `docs(deadlines): deadlines as UTC instants (ADR 0017)` and `test(e2e): the same deadline reads the same in every timezone` (two commits, or one if smaller; trailers).

---

### Finish: pull request

- [ ] The Tasks 1–5 squash already happened at the end of Task 5; no squash here. Push `feat/deadline-instants`, open the PR (`feat(deadlines): deadlines as UTC instants with a due-soon flag`; body: why, the contract change, migration semantics, evidence — gate 100%, e2e incl. two-timezone journey, regenerated `openapi.json` and `docs/api/index.html`; ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), wait for CI; merge only after reviews are clean.
