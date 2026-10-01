# FociToDo Implementation Plan — Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each PR file is self-contained; read this index first, then only the PR file you are executing.

**Goal:** Deliver the FociToDo full-stack to-do application (TypeScript monorepo: shared Zod contract, Express + Postgres API, React web app with an in-app `/dev` portal) that runs, tests and verifies with Docker as the only prerequisite.

**Architecture:** npm-workspaces monorepo. `@foci/shared` holds Zod schemas used by the API (validation + OpenAPI) and the web app (forms + response validation). The API is layered `http → service → domain` with repository ports implemented by Postgres and in-memory adapters, wired by hand in a composition root. One root multi-stage Dockerfile produces `test`, `api`, `migrate`, `web` and `e2e` targets that Compose orchestrates with profiles.

**Tech Stack:** Node.js 24 (node:24.21-alpine), TypeScript ~6.0, Zod 4, Express 5, pg 8, node-pg-migrate 9, pino 10 / pino-http 11, swagger-ui-express 5, React 19, Vite 8, TanStack Query 5, Radix Dialog, react-markdown 10 + remark-gfm 4, mermaid 12, Vitest 5 (+ coverage-v8), Supertest 7, Testing Library, Playwright 1.63.0, ESLint 10 + typescript-eslint 8 + eslint-plugin-import-x 4, Prettier 3, Postgres 17.11, nginx-unprivileged 1.31.

**Spec:** `docs/superpowers/specs/2026-09-30-foci-todo-design.md` (read it; this plan argues from it). Spec amendments discovered while planning are listed below; they were applied to the spec when this plan was committed.

---

## Global Constraints

- Docker (Engine/Desktop with Compose v2 + BuildKit) is the **only** prerequisite for reviewers; every reviewer-facing command is a `docker compose …` command. No Makefile, no host Node requirement.
- Runtime and build images: `node:24.21-alpine`, `postgres:17.11-alpine`, `nginxinc/nginx-unprivileged:1.31-alpine`, `mcr.microsoft.com/playwright:v1.63.0-noble`. Multi-arch (amd64 + arm64).
- TypeScript pinned to `~6.0.3` (typescript-eslint 8.71 supports `<6.1`). Do **not** upgrade to TypeScript 7.
- `@playwright/test` pinned **exactly** to `1.63.0`, matching the Playwright image tag.
- `package-lock.json` committed; images install with `npm ci`.
- ESM everywhere (`"type": "module"`). API/shared relative imports use explicit `.js` extensions (NodeNext). Web uses extensionless imports (bundler resolution).
- Plain TypeScript style: classes + interfaces, constructor injection wired by hand in `apps/api/src/app.ts`; no DI container, no decorators, no enums (use `as const` arrays), no advanced type-level code.
- Coverage: **100%** lines, branches, functions, statements across `packages/*/src` and `apps/*/src`, merged, enforced by `npm run test:ci`. Exclusions only: `apps/api/src/server.ts`, `apps/web/src/main.tsx`, `**/*.d.ts`.
- Tests mirror source paths inside each package's `tests/` folder: `src/a/B.ts` → `tests/a/B.test.ts`. Suffixes: `.test.ts(x)` unit/component, `.int.test.ts` needs Postgres, `.concurrency.test.ts` concurrency invariants (needs Postgres).
- Validation limits: title trimmed 1–200 chars; description ≤ 2000 chars, `''` → `null`; dueDate strict real `YYYY-MM-DD`, past allowed; bodies strict (unknown keys → 400).
- HTTP: all routes under `/api`; `If-Match` strong ETag `"<1–9 digit positive integer>"`; error precedence 400 → 428 → 404 → 412; errors are RFC 9457 `application/problem+json`.
- Concurrency: version bumps only on real changes; idempotency key claimed first in a transaction; keys expire after 24 h; delete races → one 204, rest 404.
- Overdue: `!isCompleted && dueDate < today(UTC)`, computed server-side, returned as `isOverdue`.
- Sorting: `createdAt | dueDate | title`, `asc | desc`; title sorts by `lower(title) COLLATE "C"`; null due dates last in both directions; tie-breakers `created_at DESC, id ASC`. Postgres initialised with `--locale-provider=builtin --builtin-locale=C.UTF-8`.
- Commits: Conventional Commits with scope; failing test + implementation in the same commit; every commit green; every commit ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Git author is repo-local `Charles Malo <8965788+charlesmalo@users.noreply.github.com>` (already configured).
- Branches: one branch per PR file below, merged into `main` with a merge commit after curation (fixups autosquashed non-interactively). Never rewrite `main`.
- Never mention hours, time spent, or "core vs extension" tiers in any committed file.

## Review Focus

Inputs and conditions the spec implies but does not spell out; each has a pinned test in the named task.

1. **Repeated or array-valued query/header values** (`?status=a&status=b`, two `If-Match` headers joined as `"1", "2"`) → must be 400 with a field error, never 500. Pinned in PR 5 Task 3 (`todoRoutes.int.test.ts` "rejects repeated query parameters" and "rejects the If-Match value \"1\", \"2\" with 400").
2. **Body-parser client errors other than malformed JSON** (unsupported charset → 415, oversized body → 413, non-JSON content type → 400 validation) → mapped to problem details with the right status, never 500. Pinned in PR 5 Task 2 (`problems.test.ts`) and Task 3 (`todoRoutes.int.test.ts` "returns 415 for an unsupported charset").
3. **Out-of-range version in `If-Match`** (`"9999999999"`) → 400 before reaching Postgres' `integer` column (would otherwise be a 500). Pinned in PR 1 Task 3 (`headers.test.ts`) and PR 5 Task 3.
4. **Opening the web app over a non-secure origin** (e.g. `http://192.168.x.x:8080`) where `crypto.randomUUID` is unavailable → idempotency keys still generated (via `crypto.getRandomValues`). Pinned in PR 8 Task 1 (`idempotencyKey.test.ts`).
5. **Due dates rendered in timezones west of UTC** → `2026-10-01` must display as `2026-10-01`, never shift a day. Pinned in PR 8 Task 3 (`TodoItem.test.tsx` "renders the due date exactly as stored, even west of UTC").

---

## Spec amendments (already applied to the spec)

| # | Change | Reason |
|---|---|---|
| A1 | OpenAPI is generated with **Zod 4's built-in `z.toJSONSchema`** (`io: 'input'`) assembled into an OpenAPI 3.1 document, instead of `@asteasolutions/zod-to-openapi` | zod-to-openapi 9 cannot document schemas created before `extendZodWithOpenApi` runs (verified); native conversion handles all our schemas (verified) and removes a dependency |
| A2 | Added problem type `/problems/bad-request` for other client errors raised by the JSON body parser (e.g. 415 unsupported charset), using the parser's status | Avoids 500s for client mistakes |
| A3 | Postgres containers are initialised with `POSTGRES_INITDB_ARGS=--locale-provider=builtin --builtin-locale=C.UTF-8` | Deterministic, Unicode-aware `lower()` identical across machines; matches the in-memory comparator |
| A4 | Reviewer test command is `docker compose --profile test run --rm --build test` (adds `--build`) | Guarantees the image reflects the checked-out code |
| A5 | e2e runs from a Dockerfile target `e2e` based on the Playwright image (installs only `@playwright/test@1.63.0`) | Reviewer has no host `node_modules` |
| A6 | Added a `dev` Compose profile (bind-mounted repo + named `node_modules` volume) for the developer TDD loop | Lets the developer run tools that write files (Prettier, npm install) without host Node |
| A7 | `/dev` Overview tab renders the whole README | Simpler and more useful than extracting one section |
| A8 | Validation error `field` is `null` for body-level errors (e.g. "at least one field"), and the field name for unrecognized keys | Precise, mappable errors |
| A9 | e2e runs with `docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e` (override file instead of an `e2e` profile) | `up --exit-code-from` aborts when the one-shot `migrate` exits; the override removes the host port so e2e never collides with a running demo |
| A10 | `idempotency_keys.request_hash` is `varchar(64)` (not `char(64)`) | Avoids space padding |
| A11 | Reviewer prerequisite is Docker with Compose **v2.24+** | `!reset` in the e2e override |

---

## Developer loop (used by every task)

All commands run from the repo root. Define once per shell:

```bash
dev() { docker compose --profile dev run --rm dev "$@"; }
```

- Run one test file: `dev npx vitest run <path>`
- Run a project: `dev npx vitest run --project api-unit`
- Format: `dev npx prettier --write .`
- Lint / typecheck: `dev npm run lint` · `dev npm run typecheck`
- Full gate (what CI runs): `docker compose --profile test run --rm --build test`
- Add a dependency: `dev npm install -w <workspace> <pkg>@<range>` (updates host `package.json` and lockfile through the bind mount)

The `dev` service needs a lockfile to exist; PR 1 Task 1 bootstraps it with a one-off `docker run`.

---

## PR map (execute in order)

| PR | Branch | File | Delivers |
|---|---|---|---|
| 1 | `feat/foundation-shared-contract` | `01-foundation-shared-contract.md` | Workspace tooling, Docker test/dev harness, CI test job, CLAUDE.md, `@foci/shared` schemas |
| 2 | `feat/api-domain-in-memory` | `02-api-domain-in-memory.md` | Domain model/errors/ports, in-memory adapters, repository contract suite |
| 3 | `feat/api-postgres` | `03-api-postgres.md` | Migrations, Postgres adapters, unit of work, probe, DB test harness |
| 4 | `feat/api-service` | `04-api-service.md` | `TodoService`, `HealthService`, request hashing |
| 5 | `feat/api-http` | `05-api-http.md` | Config, logging, validation, problem mapping, routes, runtime, server, api/migrate images, Compose default stack |
| 6 | `test/api-concurrency` | `06-api-concurrency.md` | Concurrency invariant suite |
| 7 | `feat/api-openapi` | `07-api-openapi.md` | OpenAPI document, Swagger UI, conformance tests |
| 8 | `feat/web-todos` | `08-web-todos.md` | Web app (client, hooks, components, dialog), web image + nginx |
| 9 | `test/e2e-ci` | `09-e2e-ci.md` | Playwright e2e target/profile, CI e2e + images jobs |
| 10 | `docs/documentation` | `10-docs.md` | README, architecture/api/concurrency/testing docs, ADRs |
| 11 | `feat/web-dev-portal` | `11-web-dev-portal.md` | `/dev` portal rendering the docs |
| — | review repo `main` | `12-review-repo.md` | Separate subsystem: Task 1 alongside PR 1, Task 2 after every PR, Tasks 3–6 after PR 11 |

## Per-PR procedure (applies to every PR file)

1. `git switch main && git pull --ff-only` (once a remote exists) then `git switch -c <branch>`.
2. Execute the tasks in order; each task ends with its own commit.
3. Run the full gate: `docker compose --profile test run --rm --build test` → must pass with 100% coverage.
4. Curate: fold fixups into their target commits with `git commit --fixup=<sha>` then `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash main` (non-interactive). Verify each commit still builds: `git rebase main --exec "docker compose --profile test run --rm --build test"` (skip for single-commit PRs).
5. Milestone review (review-repo plan): run the code review on `main...HEAD`, triage, fold fixes in as fixups, re-run the gate.
6. Push and open the PR (`gh pr create`) with a What/Why description linking the spec section; after CI is green, merge with `gh pr merge --merge --delete-branch`.

The GitHub remote and review repo are created in PR 1 Task 6.
