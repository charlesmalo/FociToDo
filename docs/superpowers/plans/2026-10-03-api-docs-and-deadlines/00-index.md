# API docs as a local artifact, and deadlines as UTC instants — Plan index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each plan file task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-10-03-api-docs-and-deadlines-design.md](../../specs/2026-10-03-api-docs-and-deadlines-design.md)

| #   | Plan file                                        | Where                                          | Delivers                                                        |
| --- | ------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------- |
| 1   | [01-api-docs-local.md](01-api-docs-local.md)     | app, branch `refactor/api-docs-local` → PR     | Spec Part A, ADR 0016, this spec and these plans                |
| 2   | [02-deadline-instants.md](02-deadline-instants.md) | app, branch `feat/deadline-instants` → PR    | Spec Part B, ADR 0017                                           |

Plan 2 starts from `main` after PR 1 merges.

## Global constraints (all plans)

- Docker is the only prerequisite; never run host `node`/`npm`. App: `docker compose --profile dev run --rm dev <cmd>`, gate `docker compose --profile test run --rm --build test`, e2e `(docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e; rc=$?; docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml down -v; exit $rc)`. Colima mounts only `$HOME` — scratch under `~/workspace`, never `/tmp`, for anything a container mounts. Never `down -v` on the default `foci-todo` project (it holds the demo data).
- **Tests:** TDD — failing test first; test and implementation in the same commit. Coverage stays at **100%** (lines, branches, functions, statements) with no `v8 ignore` and no new coverage exclusions; every changed behaviour has a test that would fail without the change; tests mirror source paths; no non-null assertions (lint). Existing tests that encode the old behaviour are **updated**, never deleted to make the suite pass, unless the behaviour itself is removed (then the test asserts its absence).
- `.js` import extensions in packages/api; web imports extensionless. Conventional Commits with scope; every commit green; trailer `Co-Authored-By: Claude <model that wrote it> <noreply@anthropic.com>`; curate with `--fixup` + autosquash before the PR.
- Never edit generated files by hand: `apps/api/openapi.json` (`UPDATE_OPENAPI=1`), `docs/diagrams/**` (diagrams generator), `docs/api/index.html` (`UPDATE_API_DOCS=1`, added by plan 1).
- Committed text covers only the code, its behaviour and the decisions behind it.
