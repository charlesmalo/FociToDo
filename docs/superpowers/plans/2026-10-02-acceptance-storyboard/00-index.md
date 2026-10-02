# UI wireframes, independent acceptance and storyboard — Plan index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each plan file task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-10-02-acceptance-storyboard-design.md](../../specs/2026-10-02-acceptance-storyboard-design.md)

| #   | Plan file                                              | Where                                              | Delivers                                                               |
| --- | ------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | [01-ui-wireframes.md](01-ui-wireframes.md)             | app, branch `docs/ui-wireframes` → PR              | Spec §3: `block-beta` support, `docs/ui.md` wireframes, README UI map  |
| 2   | [02-review-acceptance.md](02-review-acceptance.md)     | `~/workspace/FociToDo-review`, `main` (direct)     | Spec §4–§6: acceptance harness, storyboard harness, run, matrix, sign-off |

Plan 2 Tasks 1–2 do not depend on plan 1; plan 2 Tasks 3–4 need plan 1 merged (the storyboard pairs frames with the wireframes).

## Global constraints (both plans)

- **Separation (spec §2, binding):** review-repository code is written only from the brief, the spec (`docs/superpowers/specs/2026-09-30-foci-todo-design.md`, the API guide `docs/api.md`) and the README. It never imports, copies, adapts or runs anything under the app's `apps/*/tests`, `packages/*/tests` or `e2e/`, and talks to the app only over HTTP / a browser at `http://web:8080`, against a stack it starts itself from a clean clone. The app repository receives no review harness code or evidence.
- Docker is the only prerequisite. Never run host `node`/`npm`. App: `docker compose --profile dev run --rm dev <cmd>`, gate `docker compose --profile test run --rm --build test`, e2e `docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e` + `down -v`. Colima only mounts `$HOME`: scratch dirs under `~/workspace`, never `/tmp`, for anything a container mounts.
- App: coverage 100%, no `v8 ignore`, no non-null assertions (lint), tests mirror source paths, `.js` imports in packages, Conventional Commits with scope, every commit green, `Co-Authored-By: Claude <model that wrote it> <noreply@anthropic.com>`, never edit `apps/api/openapi.json` or `docs/diagrams/**` by hand.
- Review repo: never read, print or edit `.env`; pass `-e APP_REF=<full sha>`; scripts fail loudly (named message, non-zero exit) on any tool or harness error; every number written into docs is copied from an evidence file; Conventional Commits + trailer; push `main`, never force-push.
- No mention of hours or time spent, deadlines, or "core vs extension" tiers in any committed file.
