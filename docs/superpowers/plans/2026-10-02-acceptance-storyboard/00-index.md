# UI wireframes — Plan index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each plan file task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-10-02-acceptance-storyboard-design.md](../../specs/2026-10-02-acceptance-storyboard-design.md)

| #   | Plan file                                  | Where                                | Delivers                                                              |
| --- | ------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------- |
| 1   | [01-ui-wireframes.md](01-ui-wireframes.md) | app, branch `docs/ui-wireframes` → PR | Spec §2: `block-beta` support, `docs/ui.md` wireframes, README UI map |

## Global constraints

- Docker is the only prerequisite. Never run host `node`/`npm`. App: `docker compose --profile dev run --rm dev <cmd>`, gate `docker compose --profile test run --rm --build test`, e2e `docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e` + `down -v`. Colima only mounts `$HOME`: scratch dirs under `~/workspace`, never `/tmp`, for anything a container mounts.
- App: coverage 100%, no `v8 ignore`, no non-null assertions (lint), tests mirror source paths, `.js` imports in packages, Conventional Commits with scope, every commit green, `Co-Authored-By: Claude <model that wrote it> <noreply@anthropic.com>`, never edit `apps/api/openapi.json` or `docs/diagrams/**` by hand.
- Committed text covers only the code, its behaviour and the decisions behind it.
