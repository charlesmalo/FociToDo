# FociToDo — instructions for AI agents

Full-stack to-do app: npm-workspaces monorepo (`packages/shared`, `packages/diagrams`, `apps/api`, `apps/web`).
Design: `docs/superpowers/specs/2026-09-30-foci-todo-design.md`. Plan: `docs/superpowers/plans/2026-09-30-foci-todo/`.

## Commands (Docker only — never assume host Node)

```bash
dev() { docker compose --profile dev run --rm dev "$@"; }   # developer shell helper
dev npx vitest run <file>                                  # one test file
dev npx prettier --write .                                 # format
docker compose --profile test run --rm --build test        # full gate: format, lint, typecheck, tests, 100% coverage
docker compose up --build -d                               # run the app on http://localhost:8080
docker compose --profile docs run --rm --build diagrams    # regenerate docs/diagrams after editing a Mermaid block
docker compose --profile docs run --rm --build screenshots    # regenerate docs/images after any UI change
docker compose --profile dev run --rm -e UPDATE_API_DOCS=1 dev npx vitest run packages/diagrams/tests/apiDocs.test.ts   # regenerate docs/api/index.html after regenerating `apps/api/openapi.json` (`UPDATE_OPENAPI=1`, a separate run)
```

## Architecture rules

Enforced by ESLint (import boundaries):

- API layers: `http → service → domain`; `service` depends on repository **ports** only.
- `domain/` imports nothing from `service/`, `repository/`, `http/`, `pg`, `express`.
- Web: nothing in `apps/web` imports `apps/api`.

Conventions (kept by review, not by lint):

- Only `repository/postgres/` touches SQL; only `apps/web/src/api/todoClient.ts` calls `fetch`.
- `app.ts` is the only composition root; wire dependencies by hand through constructors.
- `@foci/shared` Zod schemas are the single source of truth for validation and the OpenAPI document.

## Testing rules

- TDD: write the failing test first; test and implementation land in the same commit.
- Tests mirror source paths: `src/a/B.ts` → `tests/a/B.test.ts` in the same package. Exception: `apps/api/src/http/createHttpApp.ts`, the in-memory adapters (`InMemoryDatabase`, `InMemoryIdempotencyStore`, `InMemoryTodoRepository`, `InMemoryUnitOfWork`), the Postgres adapters (`PgIdempotencyStore`, `PgTodoRepository`) and `repository/postgres/rows.ts` are tested through the shared repository contract suite (`tests/repository/repository.contract.ts`) and the route tests rather than a mirrored file.
- Suffixes: `.test.ts(x)` unit, `.int.test.ts` needs Postgres, `.concurrency.test.ts` concurrency invariants.
- Coverage must stay at 100%. Inject clocks, id generators and pools instead of adding `v8 ignore`.
- Concurrency tests assert invariants, never timings.

## Conventions

- Plain TypeScript: classes and interfaces, no DI container, no enums, no decorators.
- API/shared imports use `.js` extensions; web imports are extensionless.
- Conventional Commits with scope; every commit green; end each commit with a `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer naming the Claude model that authored it.
- One branch and PR per plan file; curate with `--fixup` + autosquash before opening the PR.
- Never edit generated files by hand (`apps/api/openapi.json`, `docs/api/index.html`, `docs/diagrams/`, `docs/images/`).
- New or edited diagram: keep it a bare ```mermaid block at column 0 under its heading, shown as image + collapsed `<details>` source, with a README map row; run the regenerate command — the gate prints the exact lines expected.
- Any UI change (apps/web/src, apps/web/index.html, packages/shared/src, screenshots/) regenerates the screenshots in the same commit, from a clean tree (no untracked files under the input folders) — the gate prints the command.
- A diagram flagged stale (its depicted sources in docs/diagram-depicts.json changed) is updated to match the code before re-stamping with the diagrams command. Never re-stamp without reviewing.
