# UI wireframes, independent acceptance and storyboard — Design

- **Date:** 2026-10-02
- **Status:** Approved 2026-10-02
- **Builds on:** [2026-10-02-docs-diagrams-design.md](2026-10-02-docs-diagrams-design.md) (diagram pipeline) and the companion review repository [FociToDo-review](https://github.com/charlesmalo/FociToDo-review)

## 1. Why

The review repository verifies the app, but its own checks are narrow: `verify` re-runs the app's own test gate and e2e suite and only health-checks the running stack; `stress` sends real HTTP traffic but asserts concurrency invariants only; `scans` covers security. Nothing in the review repository independently drives the running app the way its front end does and checks every expectation, and nothing shows the UI journeys visually.

Goals:

1. Every expectation — from the brief, the spec and the README assumptions, plus hostile-input probes — is checked **independently** against a freshly started stack, through nginx, with the requests the front end sends, and each check leaves a request/response transcript as evidence.
2. Every UI journey from the brief is shown as a **storyboard**: captioned screenshots of the real app, each beside the **wireframe** of the screen state it should match.
3. The results feed the traceability matrix and the sign-off; a failure becomes a finding and, if the app is wrong, an app fix.

## 2. Separation of the review package from the app (binding, Ruling R44)

- The acceptance checks and storyboard journeys live **only in the review repository** and are written **only from** these allowed sources: the brief, the design spec (`2026-09-30-foci-todo-design.md`), the API guide `docs/api.md`, the README, and the served `/api/openapi.json` (the expectation catalogue cites its source for every entry).
- They never import, copy, adapt or run the app's test code (`apps/*/tests`, `packages/*/tests`, `e2e/`). They interact with the app only as a black box: HTTP to `http://web:8080` and a browser on the same URL, against a stack they start themselves from a clean clone of the commit under review.
- The app repository may hold design records and plans (plans may include reference code) but never the executable harness or its evidence — the app repository receives only design documentation (wireframes) and the small tool change in §3.2, no review harness code, no review evidence.
- The harness may control the lifecycle of the stack it started (e.g. restart containers) and read the app's wireframe SVGs and diagram manifest read-only.
- The app's own tests remain the app author's evidence; independent acceptance is the reviewer's. The traceability matrix shows them in **separate columns** and never counts one as the other.

## 3. Wireframes (app repository)

### 3.1 Content

A new guide `docs/ui.md` describes the single-page UI and holds one Mermaid `block-beta` wireframe per screen state, each under its own heading (which gives it a stable diagram id `ui/<slug>`):

| Screen state                    | Shows                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Task list — loading             | header, filters, "Loading tasks…"                                                          |
| Task list — empty               | "No tasks yet. Add your first one."                                                        |
| Task list — with tasks          | rows with checkbox, title, due date, OVERDUE badge, a completed row                        |
| Task list — no match            | "No tasks match this filter."                                                              |
| Task list — load error          | error banner with Retry                                                                    |
| Filters and sorting             | Show (All / Completed / Incomplete / Overdue), Sort (Created / Due date / Title), Order |
| Dialog — new task               | Title, Description, Due date, Add task                                                     |
| Dialog — new task with errors   | field-level messages (e.g. empty title)                                                    |
| Dialog — task details           | title, status, due date, created, description, Edit / Delete                    |
| Dialog — edit task              | form prefilled, Save                                                                       |
| Dialog — delete confirmation    | "Delete this task?"                                                                        |
| Dialog — changed elsewhere      | conflict notice after a 412, edits kept                                                    |
| Dialog — task no longer exists  | "This task no longer exists."                                                              |

Exact visible strings are taken from the UI at implementation time (the list above is indicative).

### 3.2 Pipeline

- The wireframes flow through the existing diagram pipeline: generated SVG under `docs/diagrams/ui/`, image-first with collapsed source, README map block **UI** (linking `docs/ui.md`), gate-checked, CI-reproduced.
- `packages/diagrams`: `diagramKind` maps `block-beta` (and `block`) to `wireframe`, so alt text reads `<heading> (wireframe)`.
- `mermaid.config.json` adds `block: { useMaxWidth: false }` (verified 2026-10-02: Mermaid 12 renders `block-beta` with SVG text labels and no `foreignObject`, but with `width="100%"` unless this is set).
- `docs/architecture.md` (Frontend) and the README link `docs/ui.md`.

## 4. Independent acceptance (review repository)

### 4.1 Running

- `docker compose run --rm --build -e APP_REF=<sha> acceptance` (Docker only; `.env` remains the default source of `APP_REF`).
- Starts the app from a clean clone of `APP_REF` under its own Compose project (`review-acceptance`), publishes **no** host port, waits until healthy, runs the checks from a container attached to that project's network against `http://web:8080`, then tears the project down (including on failure).

### 4.2 Expectation catalogue

`acceptance/expectations.md` is the single list of expectations, with three columns — **ID**, **Source**, **Expectation** — each proven by the check named `check_<ID>`. Source is one of `brief: <bullet>`, `spec: FR-n / DR-n / NFR-n / §x`, `api: <section>` (`docs/api.md`), `openapi: <schema/path>`, `README assumption n`, or `robustness`. Areas:

- **Brief actions:** add, list (title, due date, completion status), view by id, update title/description/due date, complete, incomplete, delete, filter (completed / incomplete / overdue), sort (due date, creation date, title; both orders), persistence across restarts (the api and db containers are restarted mid-run and the app must recover on its own).
- **Data rules (spec DR):** server-generated UUID id and ISO-8601 UTC `createdAt`; title trimmed, 1–200 characters; description ≤ 2000, empty → `null`; due date strict real `YYYY-MM-DD`, past allowed; `isCompleted` defaults to `false`; `version` starts at 1 and appears as a strong `ETag`; `isOverdue` derived (incomplete and due before today UTC).
- **Error contract (spec §5):** 400 with problem+json and per-field errors; 404; 412 on a stale `If-Match`; 428 when `If-Match` is missing on PATCH/DELETE; 415 for an unsupported charset; precedence 400 → 428 → 404 → 412; `If-Match: *` → 400.
- **Concurrency surface:** complete/incomplete idempotent and version bumps only on real change; `Idempotency-Key` replay returns the original 201 with `Idempotent-Replayed`, a reused key with a different body is rejected.
- **README assumptions:** each numbered assumption that is observable over HTTP gets a check (e.g. `null` clears description/due date, title cannot be cleared, case-insensitive title sort, todos without a due date sort last, delete is permanent, no pagination).
- **Robustness:** malformed JSON, non-JSON content type, body over the size limit, unknown fields, wrong field types, very long and non-ASCII titles, NUL characters, malformed and unknown ids, unknown query values, unsupported methods — each must yield the documented 4xx with problem+json, never a 5xx.
- **API docs:** `/api/openapi.json` is served and lists every route; `/api/docs` loads; `/api/health` reports the database up.

### 4.3 Checks and evidence

- Written in Bash with `curl` and `jq` in the existing tools image (pinned versions). Each check sends what the front end sends (method, path under `/api`, `Content-Type: application/json`, `If-Match`, `Idempotency-Key`) and asserts status, relevant headers and body fields. A non-JSON body where JSON is expected is an expectation FAIL (the app's fault), not a harness error.
- Evidence under `evidence/<timestamp>/acceptance/`: `results.md` (one row per expectation: ID, source, expectation, PASS/FAIL, transcript link) and `summary.md` (app SHA, totals); each expectation's full request/response transcript is `transcripts/<ID>.txt`.
- The run fails (non-zero exit, named message) on any FAIL, and on any harness error — stack not healthy at start, `curl` transport error, catalogue/check mismatch, unexpected script error — so a broken harness can never report success. Every catalogue ID must be executed exactly once (an unexecuted or duplicate ID fails the run).

## 5. Storyboard (review repository)

### 5.1 Running

- `docker compose run --rm --build -e APP_REF=<sha> storyboard`: fresh stack under its own Compose project with no host port; Playwright (official image, pinned) drives `http://web:8080`.

### 5.2 Journeys

Written from the brief, independent of the app's e2e suite: add a task; list with several tasks (one overdue, one completed); view; edit; complete and mark incomplete; filter by each status; sort by title ascending (plus the default order); validation error on create; conflict (the same task changed through the API between opening and saving); task deleted elsewhere; delete with confirmation; reload shows the same tasks; loading and load error (list request delayed, then failing, then Retry).

### 5.3 Frames and output

- Each step captures a screenshot as frame `<journey>-<nn>` with a caption (what the user did, what they should see) and the wireframe id (`ui/<slug>`) of the expected screen state; each step also asserts what it captions, so a frame is only written when the UI matches.
- Output under `evidence/<timestamp>/storyboard/`: `frames/*.png`, the wireframe SVGs copied from the app's `docs/diagrams/ui/` at the tested commit, and `storyboard.md` — per journey, a table of frames, each row showing the wireframe and the real screenshot side by side with the caption.
- Every wireframe in `docs/ui.md` must be paired with at least one frame; an unpaired wireframe or a frame naming an unknown wireframe fails the run.

## 6. Traceability, findings and sign-off

- `traceability/matrix.md` gains an **Independent acceptance** column (expectation IDs and storyboard frames) next to the existing app-test citations; every row needs at least one independent check or an explicit note why it cannot be observed from outside (e.g. 100% coverage).
- Every FAIL is logged as a finding. If the app is wrong: an app fix PR through the usual review loop, then acceptance, storyboard, verify and scans re-run on the new `main`. If the expectation is wrong: a ruling recorded in the finding, and the catalogue corrected.
- The sign-off gains the acceptance totals (by area and source) and a link to the storyboard; the README documents both commands and what they produce.

## 7. Delivery

1. **App PR — wireframes** (`docs/ui-wireframes`): this spec and its plans, §3.
2. **Review repository** (direct to `main`, as before), task by task with reviews: acceptance harness and catalogue (§4); storyboard harness (§5); a run of both on the new app `main`; matrix, findings and sign-off (§6).
3. **App fix PRs** only if acceptance or the storyboard finds a real defect; then a final re-run and sign-off refresh.

## 8. Out of scope

- Changing app behaviour except to fix a defect the new checks find.
- Load or concurrency stress (already covered by `stress`), security scanning (`scans`).
- Pixel-level visual regression; the storyboard is evidence for humans, its assertions are behavioural.
