# FociToDo

[![CI](https://github.com/charlesmalo/FociToDo/actions/workflows/ci.yml/badge.svg)](https://github.com/charlesmalo/FociToDo/actions/workflows/ci.yml)
[![coverage 100% enforced](https://img.shields.io/badge/coverage-100%25%20enforced-brightgreen)](https://github.com/charlesmalo/FociToDo/actions/workflows/ci.yml)

A to-do application — TypeScript, Express, Postgres and React — built to demonstrate clean architecture, correctness under concurrency and thorough automated testing. **Docker is the only prerequisite.**

![FociToDo screenshot](docs/images/screenshot.png)

## Quick start

Requires Docker Desktop (or Docker Engine) with Compose v2.24+. Nothing else — no host Node/npm; every command below runs in a container.

```bash
git clone https://github.com/charlesmalo/FociToDo.git
cd FociToDo
docker compose up --build -d --wait
```

`--wait` blocks until `docker compose` can confirm the stack is actually ready, then exits `0`; it exits non-zero if a service fails to become healthy (the one-shot `migrate` service runs to completion first and its exit `0` counts as success, not a failure).

**Check it's up:**

```bash
curl -fsS http://localhost:8080/api/health
docker compose ps
```

Expected: `curl` prints something like `{"status":"ok","db":"up","schemaVersion":"<latest migration>"}` and exits `0` (the `-f` flag makes it fail on a non-2xx response); `docker compose ps` shows `db`, `api` and `web` as `healthy`.

| URL                            | What                               |
| ------------------------------ | ---------------------------------- |
| http://localhost:8080          | The app                            |
| http://localhost:8080/api/docs | Interactive API explorer (OpenAPI) |

Port 8080 busy? Copy `.env.example` to `.env` and set `WEB_PORT`.
Stop with `docker compose down` (keeps data) or `docker compose down -v` (deletes data).

**Smoke test (optional):** proves the API end to end through nginx — create, list, update under optimistic locking, complete, delete. POSIX `sh`-friendly; no `jq` required.

```bash
BASE=http://localhost:8080/api

# Create — the id comes from the Location header, the version from ETag.
create=$(curl -sS -i -X POST "$BASE/todos" -H 'Content-Type: application/json' \
  -d '{"title":"Buy milk","dueDate":"2026-10-01"}')
echo "$create"
id=$(printf '%s' "$create" | grep -i '^Location:' | sed 's#.*/todos/##' | tr -d '\r')
etag=$(printf '%s' "$create" | grep -i '^ETag:' | sed 's/^ETag: *//' | tr -d '\r')

# List
curl -sS "$BASE/todos"

# Update — send the last ETag back as If-Match; a stale one gets 412.
update=$(curl -sS -i -X PATCH "$BASE/todos/$id" -H "If-Match: $etag" \
  -H 'Content-Type: application/json' -d '{"title":"Buy oat milk"}')
echo "$update"
etag=$(printf '%s' "$update" | grep -i '^ETag:' | sed 's/^ETag: *//' | tr -d '\r')

# Complete — idempotent, no If-Match needed.
complete=$(curl -sS -i -X POST "$BASE/todos/$id/complete")
echo "$complete"
etag=$(printf '%s' "$complete" | grep -i '^ETag:' | sed 's/^ETag: *//' | tr -d '\r')

# Delete — requires the current If-Match.
curl -sS -i -X DELETE "$BASE/todos/$id" -H "If-Match: $etag"
```

Each command prints the full response; the last `DELETE` should print `HTTP/1.1 204 No Content`. If `grep`/`sed` aren't available, read `id` from the printed `Location` header and `etag` from the printed `ETag` header by hand and substitute them into the next command.

## Running the tests

```bash
docker compose --profile test run --rm --build test
```

Exit code `0` means the full gate passed: format check, lint (including architecture-boundary rules), type checks, and every unit, integration, concurrency and component test against a throwaway RAM-backed Postgres, at **100% coverage**. Any other exit code means something failed — scroll up to the failing step's output. Report: `reports/coverage/index.html`.

This is safe to run while the stack from Quick start is still up: the test profile starts its own throwaway `db-test` Postgres, separate from the stack's `db`, and the two don't share ports or data.

Single test file, for contributors (runs in the same container image as the gate, against the same throwaway `db-test`):

```bash
docker compose --profile dev run --rm dev npx vitest run <file>
```

See [CLAUDE.md](CLAUDE.md) for the rest of the developer commands (format, lint, etc.).

End-to-end (real browser against the full stack, isolated from your demo data). Teardown runs even if the tests fail:

```bash
(docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e; \
 rc=$?; docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml down -v; exit $rc)
```

Exit code `0` means every journey passed. Report: `reports/e2e/index.html`.

### Troubleshooting

- **Port 8080 already in use:** copy `.env.example` to `.env` and set `WEB_PORT`.
- **Can the stack and the tests run at the same time?** Yes — the test profile uses its own throwaway `db-test` Postgres, isolated from the stack's `db`.
- **Linux: `reports/` or `docs/diagrams/` owned by root:** files under `reports/` are created by the container user, and the `diagrams` generator runs as root to write into the bind-mounted checkout; remove either with `docker run --rm -v "$PWD":/w alpine rm -rf /w/reports` (swap in `/w/docs/diagrams` for the images) or `sudo`.

### For AI agents

Every command on this page is non-interactive and reports success or failure through its exit code — no need to parse logs or guess:

- Boot with `docker compose up --build -d --wait`; non-zero exit means a service failed to become healthy.
- Verify with `curl -fsS http://localhost:8080/api/health` (non-zero exit on a non-2xx response) and `docker compose ps`.
- Run the full gate with `docker compose --profile test run --rm --build test`; exit `0` is the only passing result.
- Run e2e with the subshell command above so teardown always runs regardless of the test outcome.
- Never run host `npm`/`node` — tooling runs in Docker via `docker compose --profile dev run --rm dev <cmd>`.
- Contributor rules (TDD, architecture boundaries, commit format) are in [CLAUDE.md](CLAUDE.md).

## Design overview

![Design overview (flowchart)](docs/diagrams/readme/design-overview.svg)

<details><summary>Mermaid source</summary>

```mermaid
flowchart LR
  B[Browser] -->|:8080| W[web · nginx]
  W -->|/api/*| A[api · Express]
  A --> D[(Postgres)]
  M[migrate · one-shot] --> D
```

</details>

- **Monorepo:** `packages/shared` (Zod contract), `apps/api` (Express), `apps/web` (React). The shared schemas drive API validation, web forms and the OpenAPI document.
- **Backend layers:** `http → service → domain`, storage behind ports with Postgres and in-memory adapters, wired by hand in one composition root. Boundaries are lint-enforced.
- **Concurrency:** optimistic locking with `ETag`/`If-Match` (412 on conflict), idempotent complete/incomplete, and `Idempotency-Key` on create — all enforced in SQL.
- **Errors:** RFC 9457 problem details with per-field validation errors.
- **Why OpenAPI?** A standard, machine-readable contract generated from the same Zod schemas the API validates with, so docs can't drift; it gives reviewers an interactive page to try every endpoint at `/api/docs`.

## Documentation and diagrams

Every diagram is a Mermaid block in the document that explains it, shown as a generated image with its source collapsed underneath. Changed a diagram? Run `docker compose --profile docs run --rm --build diagrams` — the test gate fails until images match their source.

**This README**

| Diagram            | Image                                              | Mermaid source                |
| ------------------ | -------------------------------------------------- | ----------------------------- |
| Design overview    | [SVG](docs/diagrams/readme/design-overview.svg)    | [source](#design-overview)    |
| How this was built | [SVG](docs/diagrams/readme/how-this-was-built.svg) | [source](#how-this-was-built) |

**[Architecture](docs/architecture.md)** — context, deployment, layers, domain and data models, frontend.

| Diagram                      | Image                                                              | Mermaid source                                              |
| ---------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| System context               | [SVG](docs/diagrams/architecture/system-context.svg)               | [source](docs/architecture.md#system-context)               |
| Deployment and startup order | [SVG](docs/diagrams/architecture/deployment-and-startup-order.svg) | [source](docs/architecture.md#deployment-and-startup-order) |
| Backend layers               | [SVG](docs/diagrams/architecture/backend-layers.svg)               | [source](docs/architecture.md#backend-layers)               |
| Domain model                 | [SVG](docs/diagrams/architecture/domain-model.svg)                 | [source](docs/architecture.md#domain-model)                 |
| Data model                   | [SVG](docs/diagrams/architecture/data-model.svg)                   | [source](docs/architecture.md#data-model)                   |
| Frontend                     | [SVG](docs/diagrams/architecture/frontend.svg)                     | [source](docs/architecture.md#frontend)                     |

**[API and sequence diagrams](docs/api.md)** — conventions, endpoints, problem types, one sequence per endpoint with its error branches.

| Diagram                                        | Image                                                                | Mermaid source                                              |
| ---------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Create — `POST /api/todos`                     | [SVG](docs/diagrams/api/create-post-api-todos.svg)                   | [source](docs/api.md#create--post-apitodos)                 |
| List — `GET /api/todos`                        | [SVG](docs/diagrams/api/list-get-api-todos.svg)                      | [source](docs/api.md#list--get-apitodos)                    |
| View — `GET /api/todos/{id}`                   | [SVG](docs/diagrams/api/view-get-api-todos-id.svg)                   | [source](docs/api.md#view--get-apitodosid)                  |
| Update — `PATCH /api/todos/{id}`               | [SVG](docs/diagrams/api/update-patch-api-todos-id.svg)               | [source](docs/api.md#update--patch-apitodosid)              |
| Complete — `POST /api/todos/{id}/complete`     | [SVG](docs/diagrams/api/complete-post-api-todos-id-complete.svg)     | [source](docs/api.md#complete--post-apitodosidcomplete)     |
| Incomplete — `POST /api/todos/{id}/incomplete` | [SVG](docs/diagrams/api/incomplete-post-api-todos-id-incomplete.svg) | [source](docs/api.md#incomplete--post-apitodosidincomplete) |
| Delete — `DELETE /api/todos/{id}`              | [SVG](docs/diagrams/api/delete-delete-api-todos-id.svg)              | [source](docs/api.md#delete--delete-apitodosid)             |

**[Concurrency](docs/concurrency.md)** — the race scenarios and how the design absorbs them.

| Diagram                        | Image                                                              | Mermaid source                                              |
| ------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| Lost update, prevented         | [SVG](docs/diagrams/concurrency/lost-update-prevented.svg)         | [source](docs/concurrency.md#lost-update-prevented)         |
| Double submit, absorbed        | [SVG](docs/diagrams/concurrency/double-submit-absorbed.svg)        | [source](docs/concurrency.md#double-submit-absorbed)        |
| Parallel completes, one change | [SVG](docs/diagrams/concurrency/parallel-completes-one-change.svg) | [source](docs/concurrency.md#parallel-completes-one-change) |

**[Testing](docs/testing.md)** — test layers, topology, conventions and coverage policy.

| Diagram | Image                                   | Mermaid source                   |
| ------- | --------------------------------------- | -------------------------------- |
| Layers  | [SVG](docs/diagrams/testing/layers.svg) | [source](docs/testing.md#layers) |

**[UI](docs/ui.md)** — every screen state of the single-page UI as a wireframe.

| Wireframe                      | Image                                                    | Mermaid source                                     |
| ------------------------------ | -------------------------------------------------------- | -------------------------------------------------- |
| Task list — loading            | [SVG](docs/diagrams/ui/task-list-loading.svg)            | [source](docs/ui.md#task-list--loading)            |
| Task list — empty              | [SVG](docs/diagrams/ui/task-list-empty.svg)              | [source](docs/ui.md#task-list--empty)              |
| Task list — with tasks         | [SVG](docs/diagrams/ui/task-list-with-tasks.svg)         | [source](docs/ui.md#task-list--with-tasks)         |
| Task list — no match           | [SVG](docs/diagrams/ui/task-list-no-match.svg)           | [source](docs/ui.md#task-list--no-match)           |
| Task list — load error         | [SVG](docs/diagrams/ui/task-list-load-error.svg)         | [source](docs/ui.md#task-list--load-error)         |
| Filters and sorting            | [SVG](docs/diagrams/ui/filters-and-sorting.svg)          | [source](docs/ui.md#filters-and-sorting)           |
| Dialog — new task              | [SVG](docs/diagrams/ui/dialog-new-task.svg)              | [source](docs/ui.md#dialog--new-task)              |
| Dialog — new task with errors  | [SVG](docs/diagrams/ui/dialog-new-task-with-errors.svg)  | [source](docs/ui.md#dialog--new-task-with-errors)  |
| Dialog — task details          | [SVG](docs/diagrams/ui/dialog-task-details.svg)          | [source](docs/ui.md#dialog--task-details)          |
| Dialog — edit task             | [SVG](docs/diagrams/ui/dialog-edit-task.svg)             | [source](docs/ui.md#dialog--edit-task)             |
| Dialog — delete confirmation   | [SVG](docs/diagrams/ui/dialog-delete-confirmation.svg)   | [source](docs/ui.md#dialog--delete-confirmation)   |
| Dialog — changed elsewhere     | [SVG](docs/diagrams/ui/dialog-changed-elsewhere.svg)     | [source](docs/ui.md#dialog--changed-elsewhere)     |
| Dialog — task no longer exists | [SVG](docs/diagrams/ui/dialog-task-no-longer-exists.svg) | [source](docs/ui.md#dialog--task-no-longer-exists) |

**[Decision records](docs/decisions/README.md)** — one ADR per architectural choice (no diagrams).

## Testing strategy

| Layer               | Proves                                                              |
| ------------------- | ------------------------------------------------------------------- |
| Shared schema       | Every validation rule and boundary                                  |
| Domain + service    | Business rules and error selection (in-memory storage, fixed clock) |
| Repository contract | In-memory and Postgres adapters behave identically                  |
| HTTP integration    | Status codes, headers, problem details, OpenAPI conformance         |
| Concurrency         | Parallel requests never lose updates or create duplicates           |
| Web components      | UI states, validation, conflict and retry handling                  |
| End-to-end          | The deployed stack works in a real browser                          |

Tests mirror source paths (`src/a/B.ts` → `tests/a/B.test.ts`). See [docs/testing.md](docs/testing.md).

## Assumptions

1. Single user; no authentication.
2. "Overdue" means incomplete with a due date before **today in UTC**; near midnight this can differ from the local date.
3. Past due dates are allowed (e.g. logging a late task), back to year 0001.
4. Updates are partial (`PATCH`); `null` clears the description or due date; the title cannot be cleared.
5. Complete/incomplete are idempotent and do not require `If-Match`.
6. Delete is permanent.
7. No pagination; lists are expected to stay small.
8. Idempotency keys apply to creates only and expire after 24 hours; a replay returns the original response.
9. Timestamps are stored in UTC; the UI shows them in the viewer's locale. Due dates are calendar dates and never shift.
10. Titles sort case-insensitively; todos without a due date sort last.

## Trade-offs

- **Postgres over a file store:** one more container, in exchange for transactions and constraints that make the concurrency guarantees simple and verifiable.
- **Required `If-Match`:** clients must track ETags; in return lost updates are impossible.
- **Server-side UTC overdue:** consistent filtering and badges, at the cost of the midnight edge case above.
- **No pagination, auth, soft delete or `completedAt`:** not required by the brief; each would add API surface and tests without improving correctness.
- **Single page with a modal:** covers every operation with the least UI code; the panels are independent of the dialog if a different layout is preferred.

## How this was built

![How this was built (flowchart)](docs/diagrams/readme/how-this-was-built.svg)

<details><summary>Mermaid source</summary>

```mermaid
flowchart LR
  A[Brainstorm<br/>requirements and decisions] --> B[Design spec] --> C[Implementation plan]
  C --> D[TDD per task<br/>Claude Code] --> E[Milestone review<br/>and triage] --> F[Curated PR<br/>CI green] --> G[Merge]
```

</details>

Built with Claude Code as a pair programmer under the rules in [CLAUDE.md](CLAUDE.md). Requirements, decisions and the plan are in [docs/superpowers](docs/superpowers); every architectural choice has an [ADR](docs/decisions/README.md). Each work package was reviewed before merging; review reports, the requirements traceability matrix and verification evidence live in the companion repository **[FociToDo-review](https://github.com/charlesmalo/FociToDo-review)**. AI-assisted commits carry a `Co-Authored-By` trailer.

## Project layout

```
packages/shared/   Zod contract (schemas, types, problem details)
packages/diagrams/ Diagram extraction, checks and generator
apps/api/          Express API: domain · service · repository (postgres, in-memory) · http
apps/web/          React app: api client · todo feature · styles
e2e/               Playwright journeys
docs/              Guides, ADRs, spec and plan
docs/diagrams/     Generated diagram images (do not edit)
Dockerfile         One multi-stage build: test · api · migrate · diagrams · web · e2e
compose.yaml       Default stack + test/dev/docs profiles; compose.e2e.yaml overlay
```
