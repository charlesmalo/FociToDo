# Plan 12 — Review Repository (`FociToDo-review`)

> Separate subsystem: its own repository at `~/workspace/FociToDo-review`, linear `main`, same commit conventions (Conventional Commits + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), same repo-local git author. Read `00-index.md` for global constraints. **Task 1 runs alongside app PR 1; Task 2 runs after every app PR; Tasks 3–6 run once the app is feature-complete (after app PR 11).**

**Goal:** independent assurance of the app: requirements traceability, milestone code reviews with triage, reproducible verification from a clean clone, concurrency stress with invariant checks, security and portability scans, and a one-page sign-off — all runnable with Docker only.

**Spec sections:** §11, D-8.

---

### Task 1: Bootstrap the repository

**Files (in `~/workspace/FociToDo-review`):**
- Create: `README.md`, `.gitignore`, `.env.example`, `checklists/milestone-review.md`, `checklists/release-readiness.md`, `traceability/matrix.md`, `findings/log.md`, `reviews/.gitkeep`, `evidence/.gitkeep`

- [ ] **Step 1: Initialise**

```bash
mkdir -p ~/workspace/FociToDo-review && cd ~/workspace/FociToDo-review
git init -b main
git config user.name "Charles Malo"
git config user.email "8965788+charlesmalo@users.noreply.github.com"
mkdir -p checklists traceability findings reviews evidence k6 scripts
touch reviews/.gitkeep evidence/.gitkeep
```

- [ ] **Step 2: Write the README, ignore file and environment template**

`README.md`:
````markdown
# FociToDo — Review & Assurance

Independent quality assurance for [FociToDo](https://github.com/charlesmalo/FociToDo): traceability, milestone reviews, reproducible verification, concurrency stress tests, security and portability checks, and a release sign-off. **Docker is the only prerequisite.**

| Folder | Contents |
|---|---|
| `traceability/` | Every requirement → implementing code → verifying tests → status |
| `reviews/` | One review per app PR: automated review output + solution-lead triage |
| `findings/log.md` | Every finding with severity, decision and the commit that resolved it |
| `checklists/` | Milestone-review and release-readiness checklists |
| `evidence/<date>/` | Raw outputs: test and coverage summaries, e2e report, k6 results, scans, timings |
| `signoff.md` | One-page release recommendation |

## Running the checks

```bash
cp .env.example .env            # set APP_REF to the commit under review
docker compose run --rm verify  # clean clone → cold build → tests → e2e → evidence
docker compose run --rm stress  # k6 scenarios against a fresh stack + invariant checks
docker compose run --rm scans   # Trivy, Hadolint, npm audit
```

`verify`, `stress` and `scans` drive Docker through the host socket. They mount this folder at the **same absolute path** as on the host so the app's relative bind mounts keep working; this is acceptable for local review tooling and is not used by the app itself.
````

`.gitignore`:
```gitignore
.env
work/
```

`.env.example`:
```dotenv
APP_REPO=https://github.com/charlesmalo/FociToDo.git
# Commit SHA or tag under review
APP_REF=main
```

- [ ] **Step 3: Write the checklists**

`checklists/milestone-review.md`:
```markdown
# Milestone review checklist (per app PR)

## Correctness
- [ ] Behaviour matches the spec sections the PR claims (status codes, headers, validation messages)
- [ ] Error precedence 400 → 428 → 404 → 412 preserved
- [ ] No silent catch-alls; unexpected errors become logged 500s

## Concurrency
- [ ] Every write is a single statement or inside the unit of work
- [ ] Version bumps only on real changes; conditional writes use the version
- [ ] New code paths covered by an invariant test if they touch shared state

## Tests
- [ ] Test written first (visible in the commit) and mirrors the source path
- [ ] 100% coverage without `v8 ignore`
- [ ] Assertions check behaviour, not implementation details or timings

## Architecture
- [ ] Layer rules respected (lint passes); composition only in `app.ts`
- [ ] No new dependency without a reason in the commit or an ADR

## Docs
- [ ] README / guides / OpenAPI still accurate (no drift)
- [ ] New decisions recorded as ADRs

## Security & operability
- [ ] Inputs validated with shared schemas; no secrets or stack traces in responses
- [ ] Images non-root; no dev dependencies in runtime images
```

`checklists/release-readiness.md`:
```markdown
# Release readiness checklist

- [ ] `verify` passes from a clean clone of the release commit (arm64 locally; amd64 in CI)
- [ ] Test gate green with 100% coverage; e2e green
- [ ] All stress invariants hold; no 5xx under load
- [ ] No critical/high vulnerabilities without an accepted, documented reason
- [ ] Hadolint clean or findings accepted
- [ ] Traceability matrix: every requirement implemented and verified
- [ ] Findings log: no open High findings
- [ ] README quick start followed verbatim on a clean machine
```

- [ ] **Step 4: Seed the traceability matrix and findings log**

`traceability/matrix.md` — one row per requirement ID from the spec §2 (FR-1…FR-10, DR-1…DR-8, NFR-0…NFR-10, D-1…D-9), columns `ID | Requirement | Implemented in | Verified by | Status`, every status initially `Planned`, e.g.:
```markdown
# Requirements traceability

| ID | Requirement | Implemented in | Verified by | Status |
|---|---|---|---|---|
| FR-1 | Add a to-do | | | Planned |
| FR-2 | List all to-dos | | | Planned |
| FR-3 | View a to-do by ID | | | Planned |
| FR-4 | Update title/description/due date | | | Planned |
| FR-5 | Mark complete | | | Planned |
| FR-6 | Mark incomplete | | | Planned |
| FR-7 | Delete | | | Planned |
| FR-8 | Filter (all/completed/incomplete/overdue) | | | Planned |
| FR-9 | Sort (createdAt/dueDate/title, asc/desc) | | | Planned |
| FR-10 | In-app developer documentation | | | Planned |
| DR-1 | id: server UUID | | | Planned |
| DR-2 | title: required, trimmed, 1–200 | | | Planned |
| DR-3 | description: optional, ≤2000, '' → null | | | Planned |
| DR-4 | dueDate: real YYYY-MM-DD, past allowed | | | Planned |
| DR-5 | isCompleted: default false | | | Planned |
| DR-6 | createdAt: UTC timestamp | | | Planned |
| DR-7 | version: read-only, ETag | | | Planned |
| DR-8 | isOverdue: derived, UTC | | | Planned |
| NFR-0 | Docker is the only prerequisite | | | Planned |
| NFR-1 | TypeScript on Node 24 LTS | | | Planned |
| NFR-2 | Persistence (Postgres volume) | | | Planned |
| NFR-3 | Storage behind ports, two adapters | | | Planned |
| NFR-4 | Concurrency guarantees | | | Planned |
| NFR-5 | Strict validation + problem details | | | Planned |
| NFR-6 | 100% coverage enforced | | | Planned |
| NFR-7 | Layer rules enforced by lint | | | Planned |
| NFR-8 | Multi-stage, non-root, prod-only images | | | Planned |
| NFR-9 | Docs for humans and AI, Mermaid | | | Planned |
| NFR-10 | OpenAPI from Zod + explorer | | | Planned |
| D-1 | Public app repository | | | Planned |
| D-2 | README: build/run | | | Planned |
| D-3 | README: tests | | | Planned |
| D-4 | README: design and testing rationale | | | Planned |
| D-5 | README: assumptions | | | Planned |
| D-6 | README: trade-offs | | | Planned |
| D-7 | Curated commit history via PRs | | | Planned |
| D-8 | Public review repository | | | Planned |
| D-9 | CI with the README's Docker commands | | | Planned |
```

`findings/log.md`:
```markdown
# Findings log

Severity: High (wrong behaviour or data risk) · Medium (robustness, maintainability) · Low (polish).
Decision: Fix · Accept (with reason) · Reject (with reason).

| ID | PR | Severity | Category | Finding | Decision | Resolution |
|---|---|---|---|---|---|---|
```

- [ ] **Step 5: Commit, confirm with the user, publish and link**

```bash
git add -A
git commit -F - <<'EOF'
docs: bootstrap the review repository

Checklists, a traceability matrix seeded from the spec's requirement
IDs, and an empty findings log.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
Ask the user before publishing: "Create public repo `charlesmalo/FociToDo-review` and push?" On yes:
```bash
gh repo create charlesmalo/FociToDo-review --public --description "Independent review and assurance for FociToDo" --source . --remote origin
git push -u origin main
```

---

### Task 2: Milestone review (repeat after every app PR, before merging it)

**Files:** `reviews/PR-<nn>-<slug>.md`, `findings/log.md`, `traceability/matrix.md`

- [ ] **Step 1: Run the automated review** on the app branch: invoke `superpowers:requesting-code-review` (or `/code-review high`) against `main...HEAD` of the app repo, asking it to apply `checklists/milestone-review.md`.

- [ ] **Step 2: Record the review and the triage** in `reviews/PR-<nn>-<slug>.md`:
```markdown
# Review — PR #<nn> <title>

- App commit range: `<base>..<head>` · Date: <YYYY-MM-DD> · Reviewer: Claude Code (automated) + solution-lead triage

## Automated review output
<paste the review findings verbatim>

## Triage
| Finding | Severity | Category | Decision | Reason |
|---|---|---|---|---|
| F-<n> <summary> | High/Medium/Low | correctness/concurrency/tests/docs/security/design | Fix/Accept/Reject | <one line> |

## Checklist
<copy of checklists/milestone-review.md with boxes ticked, notes on any unticked box>
```

- [ ] **Step 3: Fix in the app** — each `Fix` lands as a `--fixup` commit on the app branch, autosquashed before merge (per the app index). Re-run the app gate.

- [ ] **Step 4: Update the log and the matrix** — add every finding to `findings/log.md`; after the app PR merges, set `Resolution` to `PR #<nn> @ <merged short SHA>` (or the reason for Accept/Reject). Update `traceability/matrix.md` rows the PR implemented (`Implemented in` = files, `Verified by` = test files, `Status` = Done).

- [ ] **Step 5: Post the summary on the app PR**:
```bash
gh pr comment <nn> --repo charlesmalo/FociToDo --body "Milestone review: <n> findings (<x> fixed, <y> accepted, <z> rejected). Details: https://github.com/charlesmalo/FociToDo-review/blob/main/reviews/PR-<nn>-<slug>.md"
```

- [ ] **Step 6: Commit** — `docs(review): PR #<nn> <slug>` with the trailer.

---

### Task 3: Reproducible verification (`verify`)

**Files:** `Dockerfile.tools`, `compose.yaml`, `scripts/verify.sh`

- [ ] **Step 1: Tooling image and Compose service** (confirm `docker pull docker:29-cli` works; otherwise pin the newest `NN-cli` tag)

`Dockerfile.tools`:
```dockerfile
# Docker CLI (with compose and buildx plugins) plus git, bash and curl.
FROM docker:29-cli
RUN apk add --no-cache git bash curl jq coreutils
```

`compose.yaml`:
```yaml
name: foci-review

x-tools: &tools
  build:
    context: .
    dockerfile: Dockerfile.tools
  env_file: .env
  environment:
    HOST_DIR: ${PWD}
  working_dir: ${PWD}
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
    # Same absolute path as on the host, so the app's relative bind mounts resolve.
    - ${PWD}:${PWD}

services:
  verify:
    <<: *tools
    command: ['bash', 'scripts/verify.sh']
  stress:
    <<: *tools
    command: ['bash', 'scripts/stress.sh']
  scans:
    <<: *tools
    command: ['bash', 'scripts/scans.sh']
```

- [ ] **Step 2: The verify script**

`scripts/verify.sh`:
```bash
#!/usr/bin/env bash
# Clean clone of APP_REPO@APP_REF → cold build → healthy stack → test gate → e2e → evidence.
set -euo pipefail

STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
EVIDENCE="evidence/${STAMP}"
APP="work/app"
mkdir -p "${EVIDENCE}" work
rm -rf "${APP}"

git clone --quiet "${APP_REPO}" "${APP}"
git -C "${APP}" checkout --quiet "${APP_REF}"
SHA="$(git -C "${APP}" rev-parse HEAD)"
echo "Verifying ${APP_REPO} @ ${SHA}" | tee "${EVIDENCE}/summary.md"

cd "${APP}"
compose() { docker compose -p review-verify "$@"; }
# web is healthy only after db → migrate → api are (Compose depends_on chain).
# (`up --wait` is avoided: it can fail when the one-shot migrate container exits.)
wait_healthy() {
  for _ in $(seq 1 180); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q web)" 2>/dev/null)" = healthy ] && return 0
    sleep 1
  done
  return 1
}

start=$(date +%s)
compose build --no-cache --pull > "../../${EVIDENCE}/build.log" 2>&1
compose up -d > "../../${EVIDENCE}/up.log" 2>&1
wait_healthy
ready=$(( $(date +%s) - start ))
echo "- Cold build → healthy stack: ${ready}s ($(uname -m))" | tee -a "../../${EVIDENCE}/summary.md"
compose ps --format json > "../../${EVIDENCE}/services.json"
compose down -v > /dev/null 2>&1

set +e
docker compose -p review-test --profile test run --rm --build test > "../../${EVIDENCE}/test-gate.log" 2>&1
gate=$?
docker compose -p review-test --profile test down -v > /dev/null 2>&1
docker compose -p review-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e > "../../${EVIDENCE}/e2e.log" 2>&1
e2e=$?
docker compose -p review-e2e -f compose.yaml -f compose.e2e.yaml down -v > /dev/null 2>&1
set -e

cp -R reports "../../${EVIDENCE}/reports" 2>/dev/null || true
cd ../..
echo "- Test gate (lint, typecheck, tests, 100% coverage): $([ $gate -eq 0 ] && echo PASS || echo FAIL)" | tee -a "${EVIDENCE}/summary.md"
echo "- End-to-end: $([ $e2e -eq 0 ] && echo PASS || echo FAIL)" | tee -a "${EVIDENCE}/summary.md"
grep -E 'Statements|Branches|Functions|Lines' "${EVIDENCE}/test-gate.log" | tail -4 >> "${EVIDENCE}/summary.md" || true
exit $(( gate || e2e ))
```

- [ ] **Step 3: Run it and commit the evidence**

Run: `cp .env.example .env` (set `APP_REF` to the release commit SHA) then `docker compose run --rm --build verify`.
Expected: `summary.md` shows PASS/PASS, coverage 100% lines, and the cold-start time on `aarch64`. Record the amd64 evidence by linking the app's green CI run for the same SHA (GitHub runners are amd64) in `summary.md`.
```bash
git add Dockerfile.tools compose.yaml scripts/verify.sh evidence
git commit -m "feat(verify): reproducible clean-clone verification with evidence" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Concurrency stress (`stress`)

**Files:** `k6/common.js`, `k6/race-patch.js`, `k6/parallel-complete.js`, `k6/delete-storm.js`, `k6/idempotent-replay.js`, `k6/mixed-load.js`, `scripts/invariants.mjs`, `scripts/stress.sh`

- [ ] **Step 1: Shared k6 helpers**

`k6/common.js`:
```js
import http from 'k6/http';

export const BASE = __ENV.BASE_URL || 'http://web:8080/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createTodo(title) {
  const response = http.post(`${BASE}/todos`, JSON.stringify({ title }), { headers: JSON_HEADERS });
  if (response.status !== 201) throw new Error(`setup create failed: ${response.status}`);
  return response.json();
}

export function patch(id, version, body) {
  return http.patch(`${BASE}/todos/${id}`, JSON.stringify(body), {
    headers: { ...JSON_HEADERS, 'If-Match': `"${version}"` },
    tags: { name: 'PATCH /todos/:id' },
  });
}

export const jsonHeaders = JSON_HEADERS;
```

- [ ] **Step 2: Scenarios**

`k6/race-patch.js` — 50 VUs for 30 s repeatedly read-then-PATCH 5 shared todos:
```js
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE, createTodo, patch } from './common.js';

// 412 is an expected outcome of a lost race, not a failure.
http.setResponseCallback(http.expectedStatuses(200, 201, 412));
export const options = {
  vus: 50,
  duration: '30s',
  thresholds: { checks: ['rate==1'], http_req_failed: ['rate==0'] },
};
const successfulPatches = new Counter('successful_patches');

export function setup() {
  return { ids: Array.from({ length: 5 }, (_, i) => createTodo(`race-${i}`).id) };
}

export default function ({ ids }) {
  const id = ids[Math.floor(Math.random() * ids.length)];
  const current = http.get(`${BASE}/todos/${id}`, { tags: { name: 'GET /todos/:id' } });
  const response = patch(id, current.json('version'), { title: `edit ${__VU}-${__ITER}` });
  check(response, { 'PATCH is 200 or 412': (r) => r.status === 200 || r.status === 412 });
  if (response.status === 200) successfulPatches.add(1);
}
```

`k6/parallel-complete.js`:
```js
import http from 'k6/http';
import { check } from 'k6';
import { BASE, createTodo } from './common.js';

http.setResponseCallback(http.expectedStatuses(200, 201));
export const options = { vus: 40, iterations: 400, thresholds: { checks: ['rate==1'] } };

export function setup() {
  return { ids: Array.from({ length: 10 }, (_, i) => createTodo(`complete-${i}`).id) };
}

export default function ({ ids }) {
  const id = ids[__ITER % ids.length];
  check(http.post(`${BASE}/todos/${id}/complete`, null, { tags: { name: 'POST complete' } }), {
    'complete is 200': (r) => r.status === 200,
  });
}
```

`k6/delete-storm.js`:
```js
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE, createTodo } from './common.js';

http.setResponseCallback(http.expectedStatuses(201, 204, 404));
export const options = { vus: 30, iterations: 600, thresholds: { checks: ['rate==1'] } };
const deleted = new Counter('deleted');

export function setup() {
  return { ids: Array.from({ length: 20 }, (_, i) => createTodo(`delete-${i}`).id) };
}

export default function ({ ids }) {
  const id = ids[__ITER % ids.length];
  const response = http.del(`${BASE}/todos/${id}`, null, {
    headers: { 'If-Match': '"1"' },
    tags: { name: 'DELETE /todos/:id' },
  });
  check(response, { 'DELETE is 204 or 404': (r) => r.status === 204 || r.status === 404 });
  if (response.status === 204) deleted.add(1);
}
```

`k6/idempotent-replay.js`:
```js
import http from 'k6/http';
import { check } from 'k6';
import { BASE, jsonHeaders } from './common.js';

http.setResponseCallback(http.expectedStatuses(201));
export const options = { vus: 40, iterations: 800, thresholds: { checks: ['rate==1'] } };

export default function () {
  const n = __ITER % 20;
  const response = http.post(`${BASE}/todos`, JSON.stringify({ title: `replay-${n}` }), {
    headers: { ...jsonHeaders, 'Idempotency-Key': `stress-key-${n}` },
    tags: { name: 'POST /todos (keyed)' },
  });
  check(response, { 'keyed create is 201': (r) => r.status === 201 });
}
```

`k6/mixed-load.js`:
```js
import http from 'k6/http';
import { check } from 'k6';
import { BASE, createTodo, jsonHeaders, patch } from './common.js';

http.setResponseCallback(http.expectedStatuses(200, 201, 204, 404, 412));
export const options = {
  stages: [
    { duration: '10s', target: 50 },
    { duration: '30s', target: 50 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{name:GET /todos}': ['p(95)<250'],
    'http_req_failed': ['rate==0'],
    checks: ['rate==1'],
  },
};

export default function () {
  const todo = createTodo(`mixed-${__VU}-${__ITER}`);
  const list = http.get(`${BASE}/todos?sort=dueDate&order=asc`, { tags: { name: 'GET /todos' } });
  const edited = patch(todo.id, 1, { dueDate: '2030-01-01' });
  const completed = http.post(`${BASE}/todos/${todo.id}/complete`, null, { tags: { name: 'POST complete' } });
  const removed = http.del(`${BASE}/todos/${todo.id}`, null, {
    headers: { ...jsonHeaders, 'If-Match': '"3"' },
    tags: { name: 'DELETE /todos/:id' },
  });
  check({ list, edited, completed, removed }, {
    'list 200': (r) => r.list.status === 200,
    'edit 200': (r) => r.edited.status === 200,
    'complete 200': (r) => r.completed.status === 200,
    'delete 204': (r) => r.removed.status === 204,
  });
}
```

- [ ] **Step 3: Invariant checker**

`scripts/invariants.mjs` (runs with `node` inside `node:24-alpine`; reads k6 `--summary-export` files):
```js
// Usage: node invariants.mjs <scenario> <summary.json> <apiBase>
import { readFileSync } from 'node:fs';

const [scenario, summaryPath, base] = process.argv.slice(2);
const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
const counter = (name) => summary.metrics[name]?.count ?? 0;
const todos = await (await fetch(`${base}/todos`)).json();

const results = [];
const expect = (label, actual, expected) => results.push({ label, actual, expected, ok: actual === expected });

if (scenario === 'race-patch') {
  const raced = todos.filter((todo) => /^(race-\d|edit )/.test(todo.title));
  const versionGain = raced.reduce((sum, todo) => sum + (todo.version - 1), 0);
  expect('Σ(version − 1) equals successful PATCHes (no lost or phantom updates)', versionGain, counter('successful_patches'));
}
if (scenario === 'parallel-complete') {
  const done = todos.filter((todo) => todo.title.startsWith('complete-'));
  expect('every todo completed', done.every((todo) => todo.isCompleted), true);
  expect('each todo bumped exactly once', done.every((todo) => todo.version === 2), true);
}
if (scenario === 'delete-storm') {
  expect('exactly one successful delete per todo', counter('deleted'), 20);
  expect('no deleted todo remains', todos.filter((todo) => todo.title.startsWith('delete-')).length, 0);
}
if (scenario === 'idempotent-replay') {
  expect('one row per idempotency key', todos.filter((todo) => todo.title.startsWith('replay-')).length, 20);
}
if (scenario === 'mixed-load') {
  expect('no mixed-load todo left behind', todos.filter((todo) => todo.title.startsWith('mixed-')).length, 0);
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.label} (actual ${r.actual}, expected ${r.expected})`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
```

- [ ] **Step 4: Orchestration script**

`scripts/stress.sh`:
```bash
#!/usr/bin/env bash
# Fresh app stack per scenario → k6 → invariants → evidence.
set -euo pipefail
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
EVIDENCE="evidence/${STAMP}/stress"
APP="work/app"
mkdir -p "${EVIDENCE}" work
[ -d "${APP}" ] || git clone --quiet "${APP_REPO}" "${APP}"
git -C "${APP}" fetch --quiet && git -C "${APP}" checkout --quiet "${APP_REF}"

wait_healthy() {
  for _ in $(seq 1 180); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' "$(cd "${APP}" && docker compose -p review-stress ps -q web)" 2>/dev/null)" = healthy ] && return 0
    sleep 1
  done
  return 1
}

status=0
for scenario in race-patch parallel-complete delete-storm idempotent-replay mixed-load; do
  (cd "${APP}" && docker compose -p review-stress up -d --build >/dev/null)
  wait_healthy
  docker run --rm --network review-stress_default -v "${HOST_DIR}:${HOST_DIR}" -w "${HOST_DIR}" \
    grafana/k6:1.3.0 run --quiet --summary-export "${EVIDENCE}/${scenario}.json" "k6/${scenario}.js" \
    > "${EVIDENCE}/${scenario}.log" 2>&1 || status=1
  docker run --rm --network review-stress_default -v "${HOST_DIR}:${HOST_DIR}" -w "${HOST_DIR}" \
    node:24.21-alpine node scripts/invariants.mjs "${scenario}" "${EVIDENCE}/${scenario}.json" http://web:8080/api \
    | tee "${EVIDENCE}/${scenario}.invariants.txt" || status=1
  (cd "${APP}" && docker compose -p review-stress down -v >/dev/null)
done
exit $status
```
Before running, confirm the k6 image tag exists (`docker pull grafana/k6:1.3.0`); if not, pin the latest `1.x` tag shown on Docker Hub and update the script.

- [ ] **Step 5: Run, then commit scripts and evidence**

Run: `docker compose run --rm --build stress`
Expected: every `*.invariants.txt` line is `PASS`; k6 thresholds pass (no unexpected statuses, p95 list latency under 250 ms on this machine).
```bash
git add k6 scripts/invariants.mjs scripts/stress.sh evidence
git commit -m "feat(stress): k6 concurrency scenarios with post-run invariant checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Security and portability scans (`scans`)

**Files:** `scripts/scans.sh`

- [ ] **Step 1: Script**

`scripts/scans.sh`:
```bash
#!/usr/bin/env bash
# Image vulnerabilities (Trivy), Dockerfile lint (Hadolint), dependency audit (npm).
set -euo pipefail
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
EVIDENCE="evidence/${STAMP}/scans"
APP="work/app"
mkdir -p "${EVIDENCE}" work
[ -d "${APP}" ] || git clone --quiet "${APP_REPO}" "${APP}"
git -C "${APP}" fetch --quiet && git -C "${APP}" checkout --quiet "${APP_REF}"

(cd "${APP}" && docker compose -p review-scan build api web >/dev/null)
for image in review-scan-api review-scan-web; do
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest \
    image --quiet --severity HIGH,CRITICAL --ignore-unfixed "${image}" | tee "${EVIDENCE}/trivy-${image}.txt"
done
docker run --rm -i hadolint/hadolint < "${APP}/Dockerfile" | tee "${EVIDENCE}/hadolint.txt" || true
docker run --rm -v "${HOST_DIR}/${APP}:/app" -w /app node:24.21-alpine \
  npm audit --omit=dev --audit-level=high | tee "${EVIDENCE}/npm-audit.txt" || true
```

- [ ] **Step 2: Run, triage, commit**

Run: `docker compose run --rm --build scans`. Add every HIGH/CRITICAL item or Hadolint warning to `findings/log.md` with a decision (fix in the app via a follow-up PR, or accept with a reason). Pin `aquasec/trivy` to the tag reported by `docker run --rm aquasec/trivy:latest --version` before committing.
```bash
git add scripts/scans.sh evidence findings/log.md
git commit -m "feat(scans): Trivy, Hadolint and npm audit with triaged findings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Release sign-off

**Files:** `signoff.md`, `traceability/matrix.md`, `README.md` (link to the latest evidence)

- [ ] **Step 1: Final run on the release commit** — set `APP_REF` to the final `main` SHA of the app; run `verify`, `stress`, `scans`.

- [ ] **Step 2: Complete the matrix** — every row `Done` with implementing files and verifying tests, or an explicit note.

- [ ] **Step 3: Write `signoff.md`** (one page):
```markdown
# Release sign-off — FociToDo @ <short SHA>

**Recommendation:** <Ready to submit / Ready with noted risks / Not ready>

## Scope delivered vs requested
<table: brief requirement → delivered (link to matrix)>

## Quality snapshot
- Test gate: <PASS>, coverage <100/100/100/100>
- End-to-end: <n/n> journeys
- Concurrency stress: <n/n> invariants hold; p95 list latency <x> ms
- Images: <n> HIGH/CRITICAL vulnerabilities (<accepted reasons>)
- Cold start (clean clone → healthy): <x> s arm64; amd64 via CI run <link>

## Findings
<counts by severity and decision; open items with owners>

## Accepted risks and trade-offs
<bullets, linking ADRs>

## Evidence
<links to evidence/<date>/ folders and the app's CI run>
```

- [ ] **Step 4: Commit and push**
```bash
git add -A
git commit -m "docs: release sign-off for FociToDo <short SHA>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```
