# Docs diagrams and `/dev` removal — Plan index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each plan file task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-10-02-docs-diagrams-design.md](../../specs/2026-10-02-docs-diagrams-design.md)

One branch and one pull request per plan file, in this order:

| #   | Plan file                                            | Branch                       | Delivers                                                                    |
| --- | ---------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| 1   | [01-remove-dev-portal.md](01-remove-dev-portal.md)   | `refactor/remove-dev-portal` | Spec §3, ADR 0015, this spec and these plans                                |
| 2   | [02-diagram-images.md](02-diagram-images.md)         | `docs/diagram-images`        | Spec §2: diagram tool, generator, gate check, CI step, images, README map   |
| 3   | [03-review-repo.md](03-review-repo.md)               | `main` of FociToDo-review    | Spec §5 follow-up: evidence, matrix, review notes and sign-off on new `main` |

Plan 2 starts from `main` after PR 1 merges; plan 3 starts after PR 2 merges.

## Global constraints (all plans)

- Docker is the only prerequisite (NFR-0). Never run host `node`/`npm`; use `docker compose --profile dev run --rm dev <cmd>` (`dev` below), the gate `docker compose --profile test run --rm --build test`, and e2e `docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e` followed by `docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml down -v`.
- Coverage stays at 100% (lines, branches, functions, statements); the only new coverage exclusion allowed is the logic-free entry point `packages/diagrams/src/bin.ts`.
- Tests mirror source paths (`src/a/B.ts` → `tests/a/B.test.ts`); TDD: failing test first, test and implementation in the same commit.
- API/shared/tool imports use `.js` extensions; web imports are extensionless.
- Conventional Commits with scope; every commit green; each commit ends with `Co-Authored-By: Claude <model that wrote it> <noreply@anthropic.com>`; curate with `--fixup` + autosquash before the PR.
- Never edit generated files by hand: `apps/api/openapi.json`, `docs/diagrams/**`.
- Never mention hours or time spent, deadlines, or "core vs extension" tiers in any committed file.
