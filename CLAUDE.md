# FociToDo — instructions for AI agents

Full-stack to-do app: npm-workspaces monorepo (`packages/shared`, `apps/api`, `apps/web`).
Design: `docs/superpowers/specs/2026-09-30-foci-todo-design.md`. Plan: `docs/superpowers/plans/2026-09-30-foci-todo/`.

## Commands (Docker only — never assume host Node)

```bash
dev() { docker compose --profile dev run --rm dev "$@"; }   # developer shell helper
dev npx vitest run <file>                                  # one test file
dev npx prettier --write .                                 # format
docker compose --profile test run --rm --build test        # full gate: format, lint, typecheck, tests, 100% coverage
docker compose up --build -d                               # run the app on http://localhost:8080
```

## Architecture rules

Enforced by ESLint (import boundaries):

- API layers: `http → service → domain`; `service` depends on repository **ports** only.
- `domain/` imports nothing from `service/`, `repository/`, `http/`, `pg`, `express`.
- Web: the todo feature and the `/dev` portal never import each other; nothing in `apps/web` imports `apps/api`.

Conventions (kept by review, not by lint):

- Only `repository/postgres/` touches SQL; only `apps/web/src/api/todoClient.ts` calls `fetch`.
- `app.ts` is the only composition root; wire dependencies by hand through constructors.
- `@foci/shared` Zod schemas are the single source of truth for validation and the OpenAPI document.

## Testing rules

- TDD: write the failing test first; test and implementation land in the same commit.
- Tests mirror source paths: `src/a/B.ts` → `tests/a/B.test.ts` in the same package.
- Suffixes: `.test.ts(x)` unit, `.int.test.ts` needs Postgres, `.concurrency.test.ts` concurrency invariants.
- Coverage must stay at 100%. Inject clocks, id generators and pools instead of adding `v8 ignore`.
- Concurrency tests assert invariants, never timings.

## Conventions

- Plain TypeScript: classes and interfaces, no DI container, no enums, no decorators.
- API/shared imports use `.js` extensions; web imports are extensionless.
- Conventional Commits with scope; every commit green; end each commit with a `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer naming the Claude model that authored it.
- One branch and PR per plan file; curate with `--fixup` + autosquash before opening the PR.
- Never edit generated files by hand (`apps/api/openapi.json`).
