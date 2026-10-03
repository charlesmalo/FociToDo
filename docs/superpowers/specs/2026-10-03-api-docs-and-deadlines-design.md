# API docs as a repository artifact, and deadlines as UTC instants — Design

- **Date:** 2026-10-03
- **Status:** Approved 2026-10-03
- **Amends:** [2026-09-30-foci-todo-design.md](2026-09-30-foci-todo-design.md) (DR-4, DR-8, list query, frontend dates), ADR 0008 and ADR 0009

## 1. Why

1. **The API explorer ships inside the running app.** `GET /api/docs` (Swagger UI) and `GET /api/openapi.json` are served by the API to anyone who can reach it, even though they are development material. The documentation should exist only in the repository, viewable as a local file, and never be reachable through the running app — not even on localhost.
2. **A calendar-day deadline is ambiguous across timezones.** `dueDate` is a `YYYY-MM-DD` date and "overdue" means "due before today's date in UTC". A task created at 22:00 in one timezone and viewed from another can be shown overdue (or not) depending on whose midnight is meant, and a task cannot be scheduled for a time of day. The brief allows a plain date ("YYYY-MM-DD format is fine") but does not require it; a deadline is better modelled as one exact moment.

## 2. Part A — API docs as a local file only

### 2.1 Behaviour

- The API no longer serves `/api/docs` or `/api/openapi.json`; both return the standard 404 problem response (`/problems/not-found`). The production image serves no documentation (`swagger-ui-express` is removed; `openapi.ts` still compiles but is unused at runtime).
- `apps/api/openapi.json` remains the committed, generated, machine-readable contract (built from the shared Zod schemas, guarded by the existing "matches the committed openapi.json" test). The tests that prove every route and response status is documented keep working against the in-process document instead of an HTTP endpoint.

### 2.2 Local viewer

- `docs/api/index.html` is a single self-contained file: the OpenAPI document, the Swagger UI script and its stylesheet inlined. It opens by double-click (`file://`), needs no server and no network, and has "Try it out" disabled (`supportedSubmitMethods: []`) because no server stands behind a file.
- It is generated, never edited by hand: a pure, fully tested renderer in the docs-tooling package `packages/diagrams` (`renderApiDocs(document, assets) → string`), with `swagger-ui-dist` as a development dependency of that package only.
- Freshness: a gate test rebuilds the HTML from `apps/api/openapi.json` and the pinned `swagger-ui-dist` assets and fails if it differs from the committed file; regenerate with `UPDATE_API_DOCS=1` on that test (the same pattern as `UPDATE_OPENAPI=1`).
- Size: about 1.8 MB, the cost of being fully offline. `docs/api/index.html` is listed in `.prettierignore` and in CLAUDE.md's generated files.

### 2.3 Docs

README (URL table loses `/api/docs`; "API reference: open `docs/api/index.html`"), `docs/api.md`, CLAUDE.md, ADR 0009 status note, new **ADR 0016 — API docs are a repository artifact, not an endpoint**. The e2e check "serves the API explorer" becomes "does not expose API docs" (both paths 404).

## 3. Part B — deadlines as UTC instants

### 3.1 Data and API contract

- The field `dueDate` (calendar date) is replaced by **`dueAt`**: an optional exact moment.
- **Requests:** `dueAt` is an RFC 3339 date-time **with** a timezone offset or `Z` (e.g. `2026-10-03T18:00:00-04:00`, `2026-10-03T22:00:00Z`); fractional seconds allowed; `null` clears it. A bare date, a date-time without an offset, an impossible date or a year outside 0001–9999 → 400 naming `dueAt`. The server normalises to UTC.
- **Responses:** `dueAt` is ISO 8601 UTC with milliseconds and `Z` (e.g. `2026-10-03T22:00:00.000Z`) — the same format as `createdAt` — or `null`.
- **Storage:** `due_at timestamptz` (UTC, epoch-based internally). Past deadlines remain allowed.
- **Migration:** a new SQL migration adds `due_at`, backfills `due_at = (due_date + time '23:59:59') AT TIME ZONE 'UTC'`, and drops `due_date`. "Due on day D" meant "not overdue until D is over", so every existing task keeps its status at migration time. The down migration restores the date (`(due_at AT TIME ZONE 'UTC')::date`).
- The idempotency request hash uses the normalised UTC instant, so the same moment written with different offsets is the same request.

### 3.2 Derived status (server, from the injected clock)

- `isOverdue` = not completed, `dueAt` set and `dueAt < now`.
- **`isDueSoon`** = not completed, `dueAt` set and `now ≤ dueAt < now + 24 h` (`DUE_SOON_WINDOW_MS = 86_400_000`).
- Both are returned on every todo and computed on the server with the injected clock (ADR 0008's single source of truth, now instant-based), so the filter and the badges always agree and the answer is identical in every timezone. At most one of the two is true.

### 3.3 List query

- `status` gains **`due-soon`** (`all · completed · incomplete · overdue · due-soon`).
- `sort` key `dueDate` is renamed **`dueAt`**; todos without a deadline still sort last in both orders; ties still break by newest, then id.
- Overdue and due-soon filters are evaluated in SQL against the request's `now` (a bound `timestamptz` parameter) and, in the in-memory adapter, against the same instant.

### 3.4 Web app

- The form's single date field becomes two labelled inputs, **Due date** (`<input type="date">`) and **Due time** (`<input type="time">`), both in the viewer's timezone and optional together. When a date is entered and the time is empty, the time is prefilled with **17:00**; clearing the date clears the deadline (sends `null`). On submit the local date and time are combined and converted to a UTC instant (the date and time are parsed as local time and serialised with `toISOString()`). Two inputs rather than one `datetime-local`: browsers treat a half-filled `datetime-local` as empty, so a day-only pick could not be prefilled with a time.
- Display: the deadline is shown in the viewer's locale with date and time (`Intl.DateTimeFormat`, e.g. "Due Oct 3, 2026, 6:00 PM"), in the list and the details dialog.
- Badges: **Overdue** (as today) and **Due soon**, both from the server's `isOverdue` / `isDueSoon`. The Show filter gains **Due soon**; Sort by shows **Due** for `dueAt`.

### 3.5 Proof that the timezone problem is gone

- Domain/service unit tests with an injected clock pin the boundaries: one millisecond before, at and after `dueAt`; the 24-hour edge of "due soon"; completed tasks never flagged.
- Shared-schema tests pin accepted and rejected `dueAt` strings (offsets, `Z`, fractional seconds, bare dates, no offset, impossible dates, years 0000 and 10000).
- Repository contract tests (both adapters) pin the overdue and due-soon filters and the `dueAt` sort with a fixed `now`.
- An end-to-end journey creates a task in one browser timezone (`America/New_York`) and views it in another (`Asia/Tokyo`): both see the same status, each with its own local time.

### 3.6 Docs

README assumptions (2: overdue = past the deadline moment, no midnight caveat; 3: past deadlines allowed; 9: deadlines are instants shown in the viewer's timezone; new: "Due soon" = within 24 hours) and trade-offs; `docs/api.md`; the data-model and state diagrams (regenerated); `docs/ui.md` wireframes ("Due" date-time, "Due soon" badge, Show options); **ADR 0017 — Deadlines are UTC instants** (supersedes 0008).

## 4. Part C — review repository

New and changed independent expectations, written from this spec and the README: `dueAt` format and validation (with offsets, rejected forms), normalisation to UTC, overdue/due-soon boundaries observable over HTTP (deadlines set seconds and hours from now), `status=due-soon`, `sort=dueAt`, `/api/docs` and `/api/openapi.json` → 404, the migration's semantics where observable; the storyboard gains a two-timezone journey and "Due soon" frames. Then acceptance, storyboard, verify, stress and scans re-run on the new app commit, and findings, matrix and sign-off are refreshed.

## 5. Delivery

1. **PR A — API docs local-only** (`refactor/api-docs-local`): this spec and its plans, Part A.
2. **PR B — deadlines as UTC instants** (`feat/deadline-instants`): Part B (regenerates `apps/api/openapi.json` and `docs/api/index.html`).
3. **Review repository** (direct to `main`): Part C.

## 6. Out of scope

Recurring deadlines, reminders or notifications, per-task timezones, changing `createdAt`.
