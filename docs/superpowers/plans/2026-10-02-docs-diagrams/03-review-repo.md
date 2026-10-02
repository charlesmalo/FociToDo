# Review repository refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The companion repository `~/workspace/FociToDo-review` (github.com/charlesmalo/FociToDo-review) signs off the new app `main` — the commit after PR 1 and PR 2 — with fresh evidence, traceability and review notes.

**Architecture:** Documentation and evidence only; the existing `verify`, `stress` and `scans` harnesses are reused unchanged.

**Tech Stack:** Docker Compose harnesses in the review repo, Markdown.

**Spec:** [docs/superpowers/specs/2026-10-02-docs-diagrams-design.md](../../specs/2026-10-02-docs-diagrams-design.md) §4, §5 — read with [00-index.md](00-index.md) (global constraints).

Work directly on the review repo's `main` (its established workflow) and push; no force-push.

## Global Constraints

See [00-index.md](00-index.md#global-constraints-all-plans). In addition:

- Never read, print or edit the review repo's `.env`; pass the commit with `-e APP_REF=<full sha>` on every `docker compose run`.
- Every number written into `signoff.md`, the matrix or a review note is copied from an evidence file produced in this plan.
- Findings log rows keep the existing format and legend; new rows continue the numbering after the current last row.

## Review Focus

1. The scans must show `lodash-es` and `mermaid` gone: npm audit 0, and the web image's Trivy result unchanged or better — not silently skipped. Pinned in Task 1 Step 2.
2. The e2e count drops to 8 because one journey was removed on purpose; the sign-off must say so instead of reading as a regression. Pinned in Task 2 Step 3.
3. Matrix rows that cite `apps/web/src/dev`, `e2e` line numbers or the old diagram journey must be re-pointed; a stale citation is the most likely error. Pinned in Task 2 Step 1 (`grep`).

---

### Task 1: Evidence on the new `main`

**Files:** `evidence/<timestamp>/` (verify, stress, scans) in the review repo.

- [ ] **Step 1:** Record the new app `main`: `git -C ~/workspace/FociToDo fetch && git -C ~/workspace/FociToDo rev-parse origin/main` → `<SHA>`; confirm `gh run list --repo charlesmalo/FociToDo --branch main --limit 1` shows success for `<SHA>`.
- [ ] **Step 2:** From `~/workspace/FociToDo-review`, run each and confirm every `summary.md` names `<SHA>`:
  ```bash
  docker compose run --rm --build -e APP_REF=<SHA> verify
  docker compose run --rm --build -e APP_REF=<SHA> stress
  docker compose run --rm --build -e APP_REF=<SHA> scans
  ```
  Expected: verify PASS (gate, coverage 100/100/100/100, e2e `8 passed`); stress all invariants PASS with 0 failed requests; scans: api and web images 0 HIGH/CRITICAL, npm audit `found 0 vulnerabilities`, postgres findings unchanged from F-64/F-65. If anything fails, stop and report (no sign-off on red).
- [ ] **Step 3:** Commit the three evidence directories: `test(evidence): verify, stress and scans on <short SHA>` with the Co-Authored-By trailer; push.

### Task 2: Traceability, findings, reviews and sign-off

**Files:** `traceability/matrix.md`, `findings/log.md`, `reviews/PR-16-remove-dev-portal.md`, `reviews/PR-17-diagram-images.md` (use the real PR numbers), `signoff.md`, `README.md`, `checklists/release-readiness-<short SHA>.md`.

- [ ] **Step 1: Matrix** — FR-10 → status `Removed` citing ADR 0015 and PR 1; NFR-9 → verified by `packages/diagrams` (gate check), the `diagrams` CI job and the generator, citing files at `<SHA>`; add a DOC-1 row (spec §4) citing `packages/diagrams/src/check.ts`, `packages/diagrams/tests/check.test.ts` ("this repository"), `docs/diagrams/manifest.json` and the README map. Then `grep -n "apps/web/src/dev\|e2e/todos.spec.ts" traceability/matrix.md` and re-point every hit to its file and lines at `<SHA>`.
- [ ] **Step 2: Reviews and findings** — write one review note per PR in the existing `reviews/PR-*.md` format (scope, automated review output, findings, filled milestone checklist), from that PR's task and final review reports; log each review finding as a new row (Fix rows name the merge commit). F-60 (lodash-es via mermaid) gets a note that its root cause was removed by PR 1 (keep its Decision and history).
- [ ] **Step 3: Sign-off** — add a dated section for `<short SHA>`: recommendation, quality snapshot from the new evidence (state that e2e is 8/8 because the portal journey was removed with the portal, and diagram validity moved to the gate and CI), findings counts recounted from the log, links to the new evidence. Keep the de70329 sign-off below it as history. Copy the release-readiness checklist to `checklists/release-readiness-<short SHA>.md` with an evidence link per box. Point the README's "latest evidence" links at the new directories.
- [ ] **Step 4:** Commit (`docs(review): sign off FociToDo <short SHA>`), push, then have the change reviewed (spec compliance + every number checked against evidence) before reporting done.
