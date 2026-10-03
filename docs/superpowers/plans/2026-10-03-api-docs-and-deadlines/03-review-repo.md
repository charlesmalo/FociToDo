# Review repository update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The independent acceptance and storyboard harnesses in `~/workspace/FociToDo-review` check the new behaviour (API docs not served; deadlines as UTC instants with Overdue / Due soon), re-run on the new app `main`, and the records and sign-off are refreshed.

**Spec:** [2026-10-03-api-docs-and-deadlines-design.md](../../specs/2026-10-03-api-docs-and-deadlines-design.md) §4 — with [00-index.md](00-index.md) (global constraints). Separation rules of the 2026-10-02 acceptance-storyboard spec §2 still bind: expectations come only from the brief, the design specs, `docs/api.md`, the README and the API's documented contract (now `apps/api/openapi.json` in the app repository, read-only); never the app's tests.

Repository: `~/workspace/FociToDo-review`, `main`, push after each task; never force-push; never read `.env` (pass `-e APP_REF=<full sha>`).

### Task 1: Acceptance catalogue and checks

- [ ] Update `acceptance/expectations.md` and the checks:
  - **Changed rows** (keep IDs, update text and source): every `dueDate` expectation becomes `dueAt` — BR-02, BR-07, BR-13 (overdue = deadline in the past), BR-15/16 (`sort=dueAt`, nulls last), DR-11..DR-15 (accepted/rejected `dueAt` forms: offset and `Z` accepted and normalised to `…Z` UTC, bare date / no offset / impossible date / year 0000 / year 10000 → 400 naming `dueAt`), DR-18 (overdue boundary: a deadline a few seconds in the past is overdue, a few minutes ahead is not), RA-02 (overdue is the same whatever the client's timezone — send the same instant with two different offsets and get identical responses), RA-03, RA-05 (`dueAt: null` clears), RA-12 (`dueAt` normalised to UTC, `createdAt` UTC), RA-14 (no deadline sorts last); AD-02 and AD-03 become "`GET /api/openapi.json` → 404 problem" and "`GET /api/docs/` → 404 problem" (source: spec 2026-10-03 §2.1).
  - **New rows** (next free IDs in their sections): DS-01 `isDueSoon` true for a deadline 2 hours ahead, false 25 hours ahead, false when completed, false without a deadline; DS-02 `status=due-soon` returns only due-soon todos (own prefix); DS-03 a due-soon todo is not overdue and vice versa; DS-04 `sort=dueDate` → 400 (renamed key); DR-20 the same instant in different offsets is one idempotent create (replay) — and a different instant with the same key → 422.
  - Avoid boundary flakiness: deadlines in checks are at least 60 s away from any boundary.
- [ ] Run `acceptance` on the new app SHA (expect every row PASS); stop and report any FAIL with the transcript. Commit `feat(acceptance): deadlines as UTC instants and API docs no longer served` with the evidence; push.

### Task 2: Storyboard

- [ ] Update journeys for the **Due date** / **Due time** inputs (17:00 prefill shown in a frame), the **Due soon** badge (seeded deadline 2 h ahead) next to **Overdue**, and the Show → **Due soon** filter; add a journey `12-two-timezones.spec.ts` that opens the same seeded tasks in browser contexts with `timezoneId: 'America/New_York'` and `'Asia/Tokyo'` (captured as two frames, both asserting the same badges and different local times), paired with the updated wireframes from the app's `docs/ui.md` (wireframe ids may change — the pairing check is authoritative).
- [ ] Run `storyboard` on the new app SHA; every wireframe paired. Commit `feat(storyboard): local date and time, due soon, and two timezones` with the evidence; push.

### Task 3: Re-runs, records, sign-off

- [ ] Run `verify`, `stress` and `scans` on the new app SHA (the API's dependency tree changed and the schema changed, so all three are relevant). Stop and report any failure.
- [ ] Findings: one row per review finding of the two app PRs (from their review notes), decisions with reasons; the API-docs removal and the deadline change themselves are not findings. Reviews: `reviews/PR-22-…md`, `reviews/PR-23-…md` (real PR numbers) in the existing format. Matrix: DR-4 / DR-8 rows re-pointed to `dueAt` / `isDueSoon` code and tests at the new SHA; FR-10-like "API explorer" row (if any) → "served: no; local artifact docs/api/index.html" with the 404 checks as independent evidence; the Independent acceptance column updated with the new IDs. Sign-off: a new dated section for the new SHA, earlier sections kept as history; checklist copy; README (latest evidence links, PR enumeration, `.env.example` pin).
- [ ] Commit `docs(review): sign off FociToDo <short SHA>`; push; then the controller reviews every number against the evidence.
