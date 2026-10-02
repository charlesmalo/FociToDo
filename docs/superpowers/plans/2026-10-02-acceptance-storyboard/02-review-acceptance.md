# Independent acceptance and storyboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The review repository checks every expectation of the app black-box with `curl` (transcripts as evidence), shows every UI journey as a storyboard beside its wireframe, and feeds both into the traceability matrix and the sign-off.

**Architecture:** Two new Docker-only harnesses beside `verify`, `stress` and `scans`. Each clones the app at `APP_REF`, starts it under its own Compose project with **no host port** (a review-repo override file), and drives `http://web:8080` from inside the project network: `acceptance` with Bash + `curl` + `jq` from the tools container (which joins the network), `storyboard` with Playwright in its own pinned image. Expectations live in one catalogue; storyboard frames are paired with the app's wireframe SVGs.

**Tech Stack:** Bash 5, curl, jq (tools image `docker:29-cli` + apk), Playwright 1.63.0 (`mcr.microsoft.com/playwright:v1.63.0-noble`), Node (in that image), Docker Compose v2.24+ (`!reset`).

**Spec:** [2026-10-02-acceptance-storyboard-design.md](../../specs/2026-10-02-acceptance-storyboard-design.md) §2, §4–§6 — with [00-index.md](00-index.md) (global constraints). Expectation sources: the brief (quoted in the spec §1 and §4.2), `docs/superpowers/specs/2026-09-30-foci-todo-design.md`, `docs/api.md`, `README.md` Assumptions.

Repository: `~/workspace/FociToDo-review`, branch `main`, push after each task (authorized), never force-push.

## Global Constraints

See [00-index.md](00-index.md#global-constraints-both-plans). In addition:

- **Separation:** nothing under `acceptance/` or `storyboard/` may read from the app's `apps/*/tests`, `packages/*/tests` or `e2e/`; the only app files the harnesses touch are `compose.yaml` (to start the stack) and, for the storyboard report, `docs/diagrams/ui/*.svg` and `docs/diagrams/manifest.json` (wireframes, read-only).
- **No host port:** both harnesses start the app with `-f compose.yaml -f <review>/harness/no-host-port.yaml` under projects `review-acceptance` / `review-storyboard`; they must work while the user's own app stack holds port 8080.
- **Fail loudly:** a harness error (stack not healthy, `curl` transport error, catalogue/check mismatch, Playwright crash, unpaired wireframe) exits non-zero with a message starting `acceptance.sh:` / `storyboard.sh:`; an expectation failure is recorded as FAIL and also makes the run exit 1.
- **Catalogue IDs:** `XX-NN` (two capital letters, two digits); each ID has exactly one check function `check_XX_NN`; each function has exactly one catalogue row.

## Review Focus

1. **Order-dependent data:** checks share one database. Every list/filter/sort check must create its own uniquely-prefixed todos and assert only on those (filter the response by prefix), never on totals or positions in the whole list. Pinned by the `prefix`/`mine` helpers in Task 1 and the sort checks in Tasks 1–2.
2. **"Today in UTC" near midnight:** overdue checks compute yesterday/today with `date -u` at check time; a run straddling midnight UTC could flip. The checks use dates ±2 days away except the one boundary check (`DR-18`), which records the date it used in its transcript.
3. **A harness that passes on a broken app:** proven in Task 1 Step 6 by three forced failures (an unimplemented catalogue row, a wrong expectation, an unreachable `BASE`) — each must make the run exit non-zero.
4. **Storyboard frames that do not show what the caption claims:** each frame is captured only after the step's assertions pass (Task 3 `frame()` helper is called after `expect`s), and the report fails on an unpaired wireframe.
5. **Persistence check leaving the stack broken:** after restarting `db` and `api`, the check waits until `/api/health` is 200 again before continuing; on timeout it fails the check (not the harness), saving the container logs beside the transcript, and the run continues.

---

### Task 1: Acceptance harness, catalogue format and the brief's actions

**Files (review repo):**

- Create: `harness/no-host-port.yaml`, `scripts/acceptance.sh`, `acceptance/lib.sh`, `acceptance/expectations.md`, `acceptance/checks/brief.sh`
- Modify: `compose.yaml` (service `acceptance`), `README.md` (Running the checks)

- [ ] **Step 1: No-host-port override**

`harness/no-host-port.yaml`:

```yaml
# Used by the acceptance and storyboard harnesses: run the app without publishing a host
# port, so it never clashes with a stack the reviewer already has on :8080.
services:
  web:
    ports: !reset []
```

- [ ] **Step 2: The check library**

`acceptance/lib.sh`:

```bash
#!/usr/bin/env bash
# Black-box HTTP checks against the app under review, sourced by scripts/acceptance.sh.
# Written from the brief, the spec and the README only — never from the app's own tests.

BASE="${BASE:-http://web:8080}"
SCRATCH="$(mktemp -d)"
H="${SCRATCH}/headers"
B="${SCRATCH}/body"
STATUS=""
TRANSCRIPT=/dev/null
FAILS=()
ID=""
VERSION=""

harness_fail() {
  echo "acceptance.sh: harness error: $*" >&2
  exit 2
}

# req METHOD PATH [curl args...]: sends one request, records it in the transcript.
req() {
  local method="$1" path="$2"
  shift 2
  : > "$H"
  : > "$B"
  STATUS="$(curl -sS --max-time 15 -o "$B" -D "$H" -w '%{http_code}' -X "$method" "${BASE}${path}" "$@")" \
    || harness_fail "curl transport error on ${method} ${path}"
  {
    printf '>>> %s %s' "$method" "$path"
    [ "$#" -gt 0 ] && printf ' %q' "$@"
    printf '\n'
    tr -d '\r' < "$H"
    head -c 4000 "$B"
    printf '\n\n'
  } >> "$TRANSCRIPT"
}

post_json() { local path="$1" body="$2"; shift 2; req POST "$path" -H 'Content-Type: application/json' --data-binary "$body" "$@"; }
patch_json() { local path="$1" body="$2"; shift 2; req PATCH "$path" -H 'Content-Type: application/json' --data-binary "$body" "$@"; }

# header NAME: value of the first response header NAME (case-insensitive), '' if absent.
header() {
  tr -d '\r' < "$H" | awk -v n="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" \
    'index(tolower($0), n ": ") == 1 { print substr($0, length(n) + 3); exit }'
}

# json FILTER: jq -r FILTER on the body, or '<not-json>' when the body is not JSON.
json() { jq -r "$1" "$B" 2>/dev/null || printf '<not-json>'; }

fail_check() { FAILS+=("$*"); }
expect_status() { [ "$STATUS" = "$1" ] || fail_check "status ${STATUS}, expected $1"; }
expect_4xx() { [[ "$STATUS" =~ ^4[0-9][0-9]$ ]] || fail_check "status ${STATUS}, expected a 4xx (never 5xx)"; }
expect_header() { local v; v="$(header "$1")"; [[ "$v" =~ $2 ]] || fail_check "header $1='${v}' does not match /$2/"; }
expect_no_header() { [ -z "$(header "$1")" ] || fail_check "unexpected header $1='$(header "$1")'"; }
expect_json() { local v; v="$(json "$1")"; [ "$v" = "$2" ] || fail_check "$1 = '${v}', expected '$2'"; }
expect_jq() { jq -e "$1" "$B" > /dev/null 2>&1 || fail_check "body does not satisfy: $1"; }

# expect_problem STATUS TYPE: RFC 9457 problem details of the given status and type.
expect_problem() {
  expect_status "$1"
  expect_header Content-Type '^application/problem\+json'
  expect_json .type "$2"
  expect_json .status "$1"
  expect_jq '.title | type == "string"'
}

# expect_field_error FIELD: a validation problem whose errors[] names FIELD.
expect_field_error() {
  expect_problem 400 /problems/validation-error
  jq -e --arg f "$1" '.errors | any(.field == $f)' "$B" > /dev/null 2>&1 \
    || fail_check "errors[] has no entry for field '$1'"
}

# create_todo JSON: POST it; sets ID and VERSION ('' and a recorded failure if not 201).
create_todo() {
  post_json /api/todos "$1"
  if [ "$STATUS" = 201 ]; then
    ID="$(json .id)"
    VERSION="$(json .version)"
  else
    fail_check "setup: create returned ${STATUS}"
    ID=""
    VERSION=""
  fi
}

# prefix NAME: a unique title prefix for one check's data.
prefix() { printf 'acc-%s-%s-' "$1" "$(head -c 6 /dev/urandom | od -An -tx1 | tr -d ' \n')"; }

# mine PREFIX: from a list response, the titles of todos whose title starts with PREFIX, in order
# ('' when the body is not a JSON array — never aborts the run).
mine() {
  { jq -r --arg p "$1" '.[] | select(.title | startswith($p)) | .title' "$B" 2> /dev/null || true; } \
    | tr '\n' ' ' | sed 's/ $//'
}

utc_date() { date -u -d "$1" +%Y-%m-%d; }
```

Checks run under the orchestrator's `set -euo pipefail`: every helper above returns 0 on an app failure (it records it with `fail_check`) and only `harness_fail` exits. In check code, guard anything that can fail (`[ -n "${ID}" ] || return 0` after a failed setup; `|| true` on ad-hoc `jq`).

- [ ] **Step 3: The orchestrator**

`scripts/acceptance.sh`:

```bash
#!/usr/bin/env bash
# Independent black-box acceptance: clean clone → app stack without a host port → curl checks
# from acceptance/expectations.md → evidence. Never uses the app's own tests.
set -Eeuo pipefail
: "${APP_REPO:?set APP_REPO (see .env.example)}"
: "${APP_REF:?set APP_REF (see .env.example)}"
ROOT="$(pwd)"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
OUT="evidence/${STAMP}/acceptance"
APP="work/app-acceptance"
PROJECT=review-acceptance
SELF="$(hostname)"
mkdir -p "${OUT}/transcripts" work

fail() {
  echo "acceptance.sh: $1" >&2
  exit 1
}

rm -rf "${APP}"
git clone --quiet "${APP_REPO}" "${APP}" || fail "git clone of ${APP_REPO} failed"
git -C "${APP}" checkout --quiet "${APP_REF}" || fail "cannot check out APP_REF=${APP_REF}"
SHA="$(git -C "${APP}" rev-parse HEAD)"

app_compose() { (cd "${APP}" && docker compose -p "${PROJECT}" -f compose.yaml -f "${ROOT}/harness/no-host-port.yaml" "$@"); }

teardown() {
  docker network disconnect "${PROJECT}_default" "${SELF}" > /dev/null 2>&1 || true
  app_compose down -v --remove-orphans > /dev/null 2>&1 || true
}
trap teardown EXIT
trap 'echo "acceptance.sh: unexpected error at line ${LINENO}" >&2' ERR

wait_healthy() {
  for _ in $(seq 1 180); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' "$(app_compose ps -q web)" 2> /dev/null)" = healthy ] && return 0
    sleep 1
  done
  return 1
}

app_compose down -v --remove-orphans > /dev/null 2>&1 || true
app_compose up -d --build > "${OUT}/up.log" 2>&1 || fail "compose up failed — see ${OUT}/up.log"
wait_healthy || { app_compose logs --no-color > "${OUT}/health-timeout.log" 2>&1 || true; fail "web did not become healthy within 180 s — see ${OUT}/health-timeout.log"; }
docker network connect "${PROJECT}_default" "${SELF}" || fail "cannot join network ${PROJECT}_default"

export APP PROJECT ROOT
# shellcheck source=/dev/null
source acceptance/lib.sh
for file in acceptance/checks/*.sh; do
  # shellcheck source=/dev/null
  source "${file}"
done

# Catalogue rows: | ID | Source | Expectation |
mapfile -t ROWS < <(awk -F'|' '/^\| [A-Z]{2}-[0-9]{2} \|/ { for (i = 2; i <= 4; i++) { gsub(/^ +| +$/, "", $i) } print $2 "\t" $3 "\t" $4 }' acceptance/expectations.md)
[ "${#ROWS[@]}" -gt 0 ] || fail "acceptance/expectations.md has no catalogue rows"

declare -A SEEN=()
total=0
failed=0
{
  echo "# Acceptance — ${APP_REPO} @ ${SHA}"
  echo
  echo "| ID | Source | Expectation | Result |"
  echo "|---|---|---|---|"
} > "${OUT}/results.md"

for row in "${ROWS[@]}"; do
  IFS=$'\t' read -r id source expectation <<< "${row}"
  [ -z "${SEEN[$id]:-}" ] || fail "duplicate catalogue id ${id}"
  SEEN[$id]=1
  fn="check_${id//-/_}"
  declare -F "${fn}" > /dev/null || fail "catalogue id ${id} has no check function ${fn}"
  TRANSCRIPT="${OUT}/transcripts/${id}.txt"
  : > "${TRANSCRIPT}"
  FAILS=()
  "${fn}"
  total=$((total + 1))
  if [ "${#FAILS[@]}" -eq 0 ]; then
    result=PASS
  else
    result=FAIL
    failed=$((failed + 1))
    printf 'FAIL: %s\n' "${FAILS[@]}" >> "${TRANSCRIPT}"
  fi
  printf '| %s | %s | %s | [%s](transcripts/%s.txt) |\n' "${id}" "${source}" "${expectation}" "${result}" "${id}" >> "${OUT}/results.md"
  printf '%s %s\n' "${result}" "${id}"
done

for fn in $(declare -F | awk '{ print $3 }' | grep '^check_'); do
  id="${fn#check_}"
  id="${id//_/-}"
  [ -n "${SEEN[$id]:-}" ] || fail "check function ${fn} has no catalogue row"
done

{
  echo "Acceptance of ${APP_REPO} @ ${SHA}"
  echo
  echo "- Expectations: ${total} · PASS $((total - failed)) · FAIL ${failed}"
  echo "- Results: [results.md](results.md) · transcripts in [transcripts/](transcripts/)"
} > "${OUT}/summary.md"
cat "${OUT}/summary.md"
[ "${failed}" -eq 0 ] || fail "${failed} expectation(s) failed — see ${OUT}/results.md"
```

In `compose.yaml`, add beside the other services:

```yaml
  acceptance:
    <<: *tools
    command: ['bash', 'scripts/acceptance.sh']
```

- [ ] **Step 4: The catalogue header and the brief's actions**

`acceptance/expectations.md` — start with this header, then the `BR` table (Task 2 appends the other areas; every table uses the same four columns so the runner can parse them):

```markdown
# Expectation catalogue

Every expectation the independent acceptance run checks, with where it comes from. Each row is proven by `check_<ID>` in `checks/*.sh`, black-box over HTTP through nginx at `http://web:8080`, using the requests the web front end sends. Sources: the take-home **brief**; the design **spec** (`docs/superpowers/specs/2026-09-30-foci-todo-design.md` in the app); the app's **api** guide (`docs/api.md`); **README** assumptions; **robustness** (hostile input the app must reject cleanly — a 4xx with problem details, never a 5xx).

## Brief actions

| ID | Source | Expectation |
|---|---|---|
| BR-01 | brief: Add | `POST /api/todos {"title"}` → 201, `Location: /api/todos/<id>`, `ETag: "1"`, body has id, title, description null, dueDate null, isCompleted false, createdAt, version 1 |
| BR-02 | brief: Add | Create with description and dueDate echoes both back |
| BR-03 | brief: List | `GET /api/todos` → 200 JSON array whose items carry title, dueDate, isCompleted (and isOverdue) |
| BR-04 | brief: View | `GET /api/todos/<id>` → 200 with `ETag` and the same todo |
| BR-05 | brief: Update | `PATCH` title with `If-Match` → 200, new title, version 2, `ETag: "2"`, other fields unchanged |
| BR-06 | brief: Update | `PATCH` description → changed |
| BR-07 | brief: Update | `PATCH` dueDate → changed |
| BR-08 | brief: Complete | `POST /api/todos/<id>/complete` → 200, isCompleted true |
| BR-09 | brief: Incomplete | `POST /api/todos/<id>/incomplete` → 200, isCompleted false |
| BR-10 | brief: Delete | `DELETE` with `If-Match` → 204, then `GET` → 404 |
| BR-11 | brief: filter (optional) | `?status=completed` returns only completed todos |
| BR-12 | brief: filter (optional) | `?status=incomplete` returns only incomplete todos |
| BR-13 | brief: filter (optional) | `?status=overdue` returns only incomplete todos due before today (UTC) |
| BR-14 | brief: filter (optional) | default and `?status=all` return completed and incomplete todos |
| BR-15 | brief: sort (optional) | `?sort=dueDate&order=asc` orders by due date ascending |
| BR-16 | brief: sort (optional) | `?sort=dueDate&order=desc` orders by due date descending |
| BR-17 | brief: sort (optional) | default order is newest first (`createdAt` desc) |
| BR-18 | brief: sort (optional) | `?sort=createdAt&order=asc` is oldest first |
| BR-19 | brief: sort (optional) | `?sort=title` orders by title, asc and desc |
| BR-20 | brief: Persistence | after restarting the api and db containers the app recovers on its own and the todo is still there |
| BR-21 | brief: Containerize (optional) | the web front end is served at `/` and deep links fall back to it (200 HTML) |
```

- [ ] **Step 5: The brief checks**

`acceptance/checks/brief.sh` — one function per row. Reference implementations (write all 21 in this style):

```bash
#!/usr/bin/env bash
# Brief actions (catalogue section "Brief actions").

check_BR_01() {
  create_todo '{"title":"Buy milk"}'
  expect_status 201
  expect_header Location "^/api/todos/${ID}\$"
  expect_header ETag '^"1"$'
  expect_jq '.id | test("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")'
  expect_json .title 'Buy milk'
  expect_json .description null
  expect_json .dueDate null
  expect_json .isCompleted false
  expect_json .version 1
  expect_jq '.createdAt | type == "string"'
}

check_BR_05() {
  create_todo '{"title":"Old","description":"keep","dueDate":"2030-01-02"}'
  [ -n "${ID}" ] || return 0
  patch_json "/api/todos/${ID}" '{"title":"New"}' -H 'If-Match: "1"'
  expect_status 200
  expect_header ETag '^"2"$'
  expect_json .title New
  expect_json .version 2
  expect_json .description keep
  expect_json .dueDate 2030-01-02
}

check_BR_15() {
  local p
  p="$(prefix BR15)"
  create_todo "{\"title\":\"${p}b\",\"dueDate\":\"2030-05-01\"}"
  create_todo "{\"title\":\"${p}a\",\"dueDate\":\"2030-01-01\"}"
  create_todo "{\"title\":\"${p}c\",\"dueDate\":\"2030-09-01\"}"
  create_todo "{\"title\":\"${p}none\"}"
  req GET '/api/todos?sort=dueDate&order=asc'
  expect_status 200
  local got
  got="$(mine "${p}")"
  [ "${got}" = "${p}a ${p}b ${p}c ${p}none" ] || fail_check "order '${got}', expected a b c none (no due date last)"
}

check_BR_21() {
  req GET /
  expect_status 200
  expect_header Content-Type '^text/html'
  req GET /some/deep/link
  expect_status 200
  expect_header Content-Type '^text/html'
}
```

`check_BR_20` must not call `harness_fail` on the 90 s timeout — a slow recovery is the app's fault, not the harness's, so it is recorded as a FAIL with the container logs saved for diagnosis, and the run continues to the remaining checks:

```bash
check_BR_20() {
  create_todo '{"title":"Survives a restart"}'
  [ -n "${ID}" ] || return 0
  (cd "${APP}" && docker compose -p "${PROJECT}" restart db api > /dev/null 2>&1) || harness_fail "restart of db/api failed"
  local up=0
  for _ in $(seq 1 90); do
    if curl -fsS --max-time 3 "${BASE}/api/health" > /dev/null 2>&1; then up=1; break; fi
    sleep 1
  done
  if [ "${up}" != 1 ]; then
    (cd "${APP}" && docker compose -p "${PROJECT}" logs --no-color) > "${TRANSCRIPT%.txt}.logs.txt"
    fail_check "app not healthy 90 s after restarting db and api (logs: ${TRANSCRIPT%.txt}.logs.txt)"
    return
  fi
  req GET "/api/todos/${ID}"
  expect_status 200
  expect_json .title 'Survives a restart'
}
```

Implement the remaining `check_BR_*` functions from their catalogue rows the same way: create the data the check needs (unique `prefix` for anything list-based), make the request, assert status, headers and body. For filters (BR-11..14) create one completed, one incomplete-future and one incomplete-overdue todo under one prefix (use `$(utc_date '-3 days')` for overdue and `$(utc_date '+3 days')` for future) and assert the set of `mine` titles for each query. For BR-19 use titles `${p}apple`, `${p}Banana`, `${p}cherry` and expect `apple Banana cherry` ascending (case-insensitive) and the reverse descending.

- [ ] **Step 6: Run it, and prove it fails loudly**

```bash
cd ~/workspace/FociToDo-review
docker compose run --rm --build -e APP_REF=<app main full sha> acceptance
```

Expected: 21 `PASS` lines, `Expectations: 21 · PASS 21 · FAIL 0`, exit 0. If any FAIL appears, read its transcript: report it (do not change the expectation to make it pass — the controller rules on whether the app or the catalogue is wrong).

Then prove three failure paths, reverting each change afterwards and deleting the evidence directories they produce:

1. Add a catalogue row `| BR-99 | test | missing |` → run exits 1 with `catalogue id BR-99 has no check function check_BR_99`.
2. Change one assertion to a wrong value (e.g. `expect_json .version 2` in BR-01) → that row is `FAIL`, its transcript ends with the `FAIL:` reason, and the run exits 1 with `1 expectation(s) failed`.
3. Make `BASE` point at an unreachable host (`-e BASE=http://nowhere:8080`) → exits 2 with `harness error: curl transport error`.

Also confirm `docker ps` shows no `review-acceptance` containers after each run (the trap tears down).

- [ ] **Step 7: Document and commit**

`README.md` "Running the checks": add

```bash
docker compose run --rm acceptance   # black-box curl checks of every expectation (catalogue: acceptance/expectations.md)
```

with one sentence: the run starts its own app stack with no host port, writes `evidence/<timestamp>/acceptance/` (results table + request/response transcripts), and is independent of the app's own tests.

Commit the harness and the passing run's evidence directory: `feat(acceptance): black-box curl checks of the brief's actions` (trailer). Push.

---

### Task 2: The rest of the catalogue — data rules, error contract, concurrency, assumptions, robustness, API docs

**Files:** append to `acceptance/expectations.md`; create `acceptance/checks/{data,errors,concurrency,assumptions,robustness,docs}.sh`.

**Interfaces:** consumes Task 1's `lib.sh` helpers (`req`, `post_json`, `patch_json`, `header`, `json`, `expect_*`, `create_todo`, `prefix`, `mine`, `utc_date`, `harness_fail`) and the runner contract (one `check_XX_NN` per row).

- [ ] **Step 1: Append the catalogue sections**

```markdown
## Data rules

| ID | Source | Expectation |
|---|---|---|
| DR-01 | spec: DR-1 | `id` is a server-generated UUID (a client-sent id is rejected as an unknown field) |
| DR-02 | spec: DR-6 | `createdAt` is an ISO-8601 UTC timestamp ending in `Z`, within a minute of now |
| DR-03 | spec: DR-2 | title is trimmed (`"  hi  "` → `"hi"`) |
| DR-04 | spec: DR-2 | a 200-character title is accepted |
| DR-05 | spec: DR-2 | a 201-character title → 400 naming `title` |
| DR-06 | spec: DR-2 | an empty title → 400 naming `title` |
| DR-07 | spec: DR-2 | a whitespace-only title → 400 naming `title` |
| DR-08 | spec: DR-3 | a 2000-character description is accepted |
| DR-09 | spec: DR-3 | a 2001-character description → 400 naming `description` |
| DR-10 | spec: DR-3 | an empty description is stored as `null` |
| DR-11 | spec: DR-4 | `dueDate` `2026-02-30` (not a real date) → 400 naming `dueDate` |
| DR-12 | spec: DR-4 | `dueDate` `2026-1-5` (not `YYYY-MM-DD`) → 400 naming `dueDate` |
| DR-13 | spec: DR-4 | a past `dueDate` (`2001-01-01`) is accepted |
| DR-14 | api: Conventions | the earliest date `0001-01-01` is accepted |
| DR-15 | api: Conventions | year `0000` → 400 naming `dueDate` |
| DR-16 | spec: DR-5 | `isCompleted` defaults to `false` and cannot be set on create (unknown field → 400) |
| DR-17 | spec: DR-7 | `version` is read-only: sending it in PATCH → 400 |
| DR-18 | spec: DR-8 | `isOverdue`: due yesterday (UTC) and incomplete → true; due today → false; due yesterday but completed → false |
| DR-19 | api: Conventions | every todo response's `ETag` equals `"<version>"` (create, get, patch, complete, incomplete) |

## Error contract

| ID | Source | Expectation |
|---|---|---|
| EC-01 | api: Problem types | a validation error is `application/problem+json` with `type /problems/validation-error`, `title`, `status 400` and `errors[]` of `{field, message}` |
| EC-02 | api: Problem types | `GET` of an unknown UUID → 404 `/problems/not-found` |
| EC-03 | api: Problem types | `GET /api/todos/abc` (not a UUID) → 400 naming `id` |
| EC-04 | api: Conventions | `PATCH` with a stale `If-Match` → 412 `/problems/version-conflict` |
| EC-05 | api: Conventions | `PATCH` without `If-Match` → 428 `/problems/precondition-required` |
| EC-06 | api: Conventions | `DELETE` without `If-Match` → 428 |
| EC-07 | api: Conventions | `DELETE` with a stale `If-Match` → 412 |
| EC-08 | spec §5 | `If-Match: *` → 400 |
| EC-09 | api: Conventions | a weak `If-Match: W/"1"` → 400 |
| EC-10 | api: Error precedence | invalid body and no `If-Match` → 400 (400 before 428) |
| EC-11 | api: Error precedence | valid body, no `If-Match`, unknown id → 428 (428 before 404) |
| EC-12 | api: Error precedence | valid body, `If-Match`, unknown id → 404 (404 before 412) |
| EC-13 | api: Endpoints | `POST` with `Content-Type: application/json; charset=latin1` → 415 problem |
| EC-14 | api: Endpoints | `PATCH` with an unsupported charset → 415 problem |
| EC-15 | api: Problem types | an unknown route `/api/nope` → 404 problem |
| EC-16 | api: Endpoints | `complete` / `incomplete` / `DELETE` of an unknown id (DELETE with `If-Match`) → 404 |
| EC-17 | api: Problem types | a body over 16 kB → 413 `/problems/payload-too-large` |

## Concurrency surface

| ID | Source | Expectation |
|---|---|---|
| CS-01 | spec §6 | completing a completed todo → 200 and the version does not change |
| CS-02 | spec §6 | marking an incomplete todo incomplete → 200 and the version does not change |
| CS-03 | api: Conventions | repeating a create with the same `Idempotency-Key` and body → 201, same id, `Idempotent-Replayed: true`, and only one todo exists |
| CS-04 | api: Conventions | the same key with a different body → 422 `/problems/idempotency-key-reuse` |
| CS-05 | openapi: IdempotencyKey | an invalid `Idempotency-Key` (contains a space, or 256 characters) → 400 |
| CS-06 | spec §6 | after a complete bumps the version, a PATCH with the old `If-Match` → 412 (no lost update) |
| CS-07 | api: Conventions | a first create with a key has no `Idempotent-Replayed` header |

## README assumptions

| ID | Source | Expectation |
|---|---|---|
| RA-01 | README assumption 1 | no authentication: requests without credentials succeed and no `WWW-Authenticate` challenge is sent |
| RA-02 | README assumption 2 | overdue is judged against today in UTC: due 2 days ago → overdue; due in 2 days → not |
| RA-03 | README assumption 3 | past due dates are allowed when creating and when updating |
| RA-04 | README assumption 4 | `PATCH {"description": null}` clears the description |
| RA-05 | README assumption 4 | `PATCH {"dueDate": null}` clears the due date |
| RA-06 | README assumption 4 | `PATCH {"title": null}` → 400 (the title cannot be cleared) |
| RA-07 | README assumption 4 | a PATCH changes only the fields it sends |
| RA-08 | README assumption 5 | complete and incomplete need no `If-Match` |
| RA-09 | README assumption 6 | a deleted todo is gone for good: absent from the list, `GET` → 404, a second `DELETE` with `If-Match` → 404 |
| RA-10 | README assumption 7 | no pagination: 60 created todos all appear in one list response; `?page=2` → 400 |
| RA-11 | README assumption 8 | idempotency keys apply to creates only: two PATCHes with the same key, each with the current `If-Match`, both apply |
| RA-12 | README assumption 9 | `dueDate` is returned exactly as sent (no timezone shift); `createdAt` is UTC |
| RA-13 | README assumption 10 | titles sort case-insensitively (`apple`, `Banana`, `cherry`) |
| RA-14 | README assumption 10 | todos without a due date sort last in both orders |

## Robustness

| ID | Source | Expectation |
|---|---|---|
| RB-01 | robustness | malformed JSON → 400 `/problems/malformed-json` |
| RB-02 | robustness | a `text/plain` body → 4xx problem, never 5xx |
| RB-03 | robustness | an empty body → 4xx problem |
| RB-04 | robustness | a JSON array body → 400 |
| RB-05 | robustness | an unknown field → 400 whose `errors[]` names it |
| RB-06 | robustness | `title` as a number → 400 naming `title` |
| RB-07 | robustness | `dueDate` as a number → 400 naming `dueDate` |
| RB-08 | robustness | a 10,000-character title → 400 naming `title` (not 5xx) |
| RB-09 | robustness | non-ASCII titles (accents, CJK, emoji, right-to-left) round-trip unchanged |
| RB-10 | api: Conventions | a NUL character (`\u0000`) in title or description → 400 |
| RB-11 | robustness | odd ids (`..%2F..%2Fetc`, a 1,000-character id, `%00`) → 4xx, never 5xx |
| RB-12 | spec §5 | an unknown `status` value → 400 |
| RB-13 | spec §5 | an unknown query key → 400 |
| RB-14 | robustness | `PUT /api/todos/<id>` (unsupported method) → 4xx problem |
| RB-15 | openapi: IfMatch | `If-Match: "9999999999"` (beyond the version limit) → 400 |
| RB-16 | robustness | deeply nested JSON (`{"title":{"a":{"b":…}}}` 50 levels) → 400, never 5xx |
| RB-17 | robustness | SQL-looking text in a title is stored literally and the list still works |
| RB-18 | robustness | HTML/script text in a title is stored and returned literally as JSON (no execution context) |

## API documentation and health

| ID | Source | Expectation |
|---|---|---|
| AD-01 | api: Endpoints | `GET /api/health` → 200 `{"status":"ok","db":"up",…}` |
| AD-02 | spec: OpenAPI | `GET /api/openapi.json` → 200 OpenAPI 3.1 document with paths for `/api/todos`, `/api/todos/{id}`, `/api/todos/{id}/complete`, `/api/todos/{id}/incomplete`, `/api/health` |
| AD-03 | README: Quick start | `GET /api/docs` → 200 HTML (the API explorer) |
```

- [ ] **Step 2: Implement the checks**

One function per row, in the file for its section (`data.sh` DR, `errors.sh` EC, `concurrency.sh` CS, `assumptions.sh` RA, `robustness.sh` RB, `docs.sh` AD). Reference implementations — write the rest in the same style:

```bash
check_DR_18() {
  local yesterday today
  yesterday="$(utc_date '-1 day')"
  today="$(utc_date 'today')"
  printf 'dates used: yesterday=%s today=%s (UTC)\n' "${yesterday}" "${today}" >> "${TRANSCRIPT}"
  create_todo "{\"title\":\"due yesterday\",\"dueDate\":\"${yesterday}\"}"
  expect_json .isOverdue true
  local overdue_id="${ID}"
  create_todo "{\"title\":\"due today\",\"dueDate\":\"${today}\"}"
  expect_json .isOverdue false
  [ -n "${overdue_id}" ] || return 0
  req POST "/api/todos/${overdue_id}/complete"
  expect_json .isOverdue false
}

check_EC_11() {
  patch_json /api/todos/00000000-0000-4000-8000-000000000000 '{"title":"x"}'
  expect_problem 428 /problems/precondition-required
}

check_CS_03() {
  local p key
  p="$(prefix CS03)"
  key="acc-$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  post_json /api/todos "{\"title\":\"${p}once\"}" -H "Idempotency-Key: ${key}"
  expect_status 201
  local first
  first="$(json .id)"
  post_json /api/todos "{\"title\":\"${p}once\"}" -H "Idempotency-Key: ${key}"
  expect_status 201
  expect_header Idempotent-Replayed '^true$'
  expect_json .id "${first}"
  req GET /api/todos
  [ "$(mine "${p}")" = "${p}once" ] || fail_check "expected exactly one '${p}once', got '$(mine "${p}")'"
}

check_RB_01() {
  post_json /api/todos '{"title": '
  expect_problem 400 /problems/malformed-json
}

check_RB_11() {
  local path
  for path in '/api/todos/..%2F..%2Fetc' "/api/todos/$(printf 'a%.0s' $(seq 1 1000))" '/api/todos/%00'; do
    req GET "${path}"
    expect_4xx
  done
}

check_AD_02() {
  req GET /api/openapi.json
  expect_status 200
  expect_jq '.openapi | startswith("3.1")'
  local p
  for p in /api/todos '/api/todos/{id}' '/api/todos/{id}/complete' '/api/todos/{id}/incomplete' /api/health; do
    jq -e --arg p "${p}" '.paths | has($p)' "${B}" > /dev/null 2>&1 || fail_check "openapi.json has no path ${p}"
  done
}
```

Rules for the rest: every 4xx assertion uses `expect_problem` with the exact status and type from `docs/api.md` where the catalogue names one, otherwise `expect_4xx` plus `expect_header Content-Type '^application/problem\+json'`; field errors use `expect_field_error <field>`; list-based checks use their own `prefix`; RA-10 creates 60 todos under one prefix and counts them with `jq` (and asserts `?page=2` → 400); EC-17 builds a body just over 16 kB (`{"title":"x","description":"<17,000 × a>"}`).

- [ ] **Step 3: Run**

`docker compose run --rm --build -e APP_REF=<app main full sha> acceptance` → every row executed exactly once (about 100). Report every FAIL with its transcript path and your reading of whether the app or the expectation is wrong — **do not** edit an expectation to make it pass and do not change the app. Commit the harness and this run's evidence (`feat(acceptance): data rules, error contract, concurrency, assumptions, robustness and API docs`), push.

---

### Task 3: Storyboard harness

Needs plan 01 merged (the wireframes exist on app `main`).

**Files (review repo):** create `storyboard/package.json`, `storyboard/package-lock.json` (generated), `storyboard/Dockerfile`, `storyboard/.dockerignore`, `storyboard/playwright.config.ts`, `storyboard/frame.ts`, `storyboard/journeys/*.spec.ts`, `storyboard/build-report.mjs`, `scripts/storyboard.sh`; modify `compose.yaml` (service `storyboard`), `README.md`.

- [ ] **Step 1: Package and image**

`storyboard/package.json`:

```json
{
  "name": "foci-review-storyboard",
  "private": true,
  "type": "module",
  "devDependencies": { "@playwright/test": "1.63.0" }
}
```

Generate the lockfile without host Node: `docker run --rm -v "$PWD/storyboard":/s -w /s node:24.21-alpine npm install --no-audit --no-fund` (commit `package-lock.json`; delete `storyboard/node_modules`; add `storyboard/node_modules` to `.gitignore`).

`storyboard/.dockerignore` (keeps a stray host `node_modules` out of the build context):

```
node_modules
```

`storyboard/Dockerfile`:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /storyboard
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
CMD ["sh", "-c", "npx playwright test && node build-report.mjs"]
```

`storyboard/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './journeys',
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://web:8080',
    viewport: { width: 1100, height: 760 },
  },
});
```

- [ ] **Step 2: Frame helper**

`storyboard/frame.ts`:

```ts
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

const OUT = process.env.OUT ?? '/out';

/** Captures one storyboard frame. Call it only after the step's assertions have passed. */
export async function frame(
  page: Page,
  journey: string,
  step: number,
  caption: string,
  wireframe: string,
): Promise<void> {
  mkdirSync(join(OUT, 'frames'), { recursive: true });
  const file = `${journey}-${String(step).padStart(2, '0')}.png`;
  await page.screenshot({ path: join(OUT, 'frames', file), animations: 'disabled' });
  appendFileSync(
    join(OUT, 'frames.jsonl'),
    `${JSON.stringify({ journey, step, caption, wireframe, file })}\n`,
  );
}
```

- [ ] **Step 3: Journeys (written from the brief)**

Files in `storyboard/journeys/`, numbered so they run in order on a fresh database: `01-empty-and-add.spec.ts`, `02-list-and-view.spec.ts`, `03-edit.spec.ts`, `04-complete-and-incomplete.spec.ts`, `05-filter-and-sort.spec.ts`, `06-validation.spec.ts`, `07-conflict.spec.ts`, `08-deleted-elsewhere.spec.ts`, `09-delete.spec.ts`, `10-reload.spec.ts`, `11-loading-and-error.spec.ts`. Seed data through the `request` fixture against `/api/todos` (black-box API, allowed); drive the UI with roles and visible text. Each step: act → `expect(...)` what the caption claims → `frame(...)` with the wireframe id it should match.

Reference journey:

```ts
import { expect, test } from '@playwright/test';
import { frame } from '../frame';

test('empty list, then add a task', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No tasks yet. Add your first one.')).toBeVisible();
  await frame(page, 'add', 1, 'First visit: the list is empty and invites adding a task.', 'ui/task-list-empty');

  await page.getByRole('button', { name: '+ New task' }).click();
  await expect(page.getByRole('dialog', { name: 'New task' })).toBeVisible();
  await frame(page, 'add', 2, '"+ New task" opens the New task dialog.', 'ui/dialog-new-task');

  await page.getByLabel('Title').fill('Buy oat milk');
  await page.getByLabel('Due date').fill('2030-01-15');
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('button', { name: 'Buy oat milk' })).toBeVisible();
  await frame(page, 'add', 3, 'After "Add task" the new task is in the list with its due date.', 'ui/task-list-with-tasks');
});
```

Required frames (journey → wireframe), at least:

| Journey | Frames and wireframe ids |
|---|---|
| add | empty list `ui/task-list-empty`; New task dialog `ui/dialog-new-task`; task in list `ui/task-list-with-tasks` |
| list-and-view | list with one overdue (due 2 days ago, UTC), one future, one completed `ui/task-list-with-tasks`; details of the overdue task `ui/dialog-task-details` |
| edit | Edit task form prefilled `ui/dialog-edit-task`; saved title shown in details `ui/dialog-task-details` |
| complete | checkbox ticks a task, shown completed `ui/task-list-with-tasks`; unticked again `ui/task-list-with-tasks` |
| filter-and-sort | the three controls `ui/filters-and-sorting`; Show: Overdue lists only overdue tasks `ui/task-list-with-tasks`; tick every overdue task, then Show: Overdue → "No tasks match this filter." `ui/task-list-no-match` (untick them again afterwards); Sort by Title, Ascending → titles in case-insensitive order `ui/task-list-with-tasks` |
| validation | Add task with an empty title shows "Title is required" `ui/dialog-new-task-with-errors` |
| conflict | open a task, Edit, change the title; meanwhile PATCH it through the API with the current `If-Match`; Save shows the changed-elsewhere notice with the edit kept `ui/dialog-changed-elsewhere` |
| deleted-elsewhere | list shows a task; DELETE it through the API; click it → "This task no longer exists." `ui/dialog-task-no-longer-exists` |
| delete | Delete → "Delete this task?" `ui/dialog-delete-confirmation`; Yes, delete → gone from the list `ui/task-list-with-tasks` |
| reload | reload the page → the same tasks `ui/task-list-with-tasks` |
| loading-and-error | delay `**/api/todos**` with `page.route` → "Loading tasks…" `ui/task-list-loading`; abort it → the error banner with Retry, asserted with `{ timeout: 15_000 }` (the client retries with backoff) `ui/task-list-load-error`; unroute and Retry → the list `ui/task-list-with-tasks` |

- [ ] **Step 4: Report builder**

`storyboard/build-report.mjs`:

```js
// Builds storyboard.md: each frame beside the wireframe of the screen it should match.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT ?? '/out';
const DIAGRAMS = process.env.APP_DIAGRAMS ?? '/app-diagrams';
const SHA = process.env.APP_SHA ?? 'unknown';

const frames = readFileSync(join(OUT, 'frames.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const wireframes = JSON.parse(readFileSync(join(DIAGRAMS, 'manifest.json'), 'utf8'))
  .diagrams.filter((d) => d.id.startsWith('ui/'));
const known = new Map(wireframes.map((d) => [d.id, d]));

const problems = [];
for (const f of frames) if (!known.has(f.wireframe)) problems.push(`frame ${f.file} names unknown wireframe ${f.wireframe}`);
for (const d of wireframes) if (!frames.some((f) => f.wireframe === d.id)) problems.push(`wireframe ${d.id} has no frame`);
if (problems.length > 0) {
  console.error(`storyboard: ${problems.join('\n')}`);
  process.exit(1);
}

mkdirSync(join(OUT, 'wireframes'), { recursive: true });
for (const d of wireframes) {
  const source = join(DIAGRAMS, 'ui', `${d.id.slice(3)}.svg`);
  if (!existsSync(source)) { console.error(`storyboard: missing ${source}`); process.exit(1); }
  copyFileSync(source, join(OUT, 'wireframes', `${d.id.slice(3)}.svg`));
}

// Escapes a caption/heading for use as an HTML alt attribute (double quote) or a Markdown
// table cell (pipe) — captions are free text from journeys/*.spec.ts, so either can appear.
const forAlt = (s) => s.replaceAll('"', '&quot;');
const forCell = (s) => s.replaceAll('|', '\\|');

const journeys = [...new Set(frames.map((f) => f.journey))];
const lines = [`# Storyboard — FociToDo @ ${SHA}`, '', `${frames.length} frames across ${journeys.length} journeys; every wireframe in the app's docs/ui.md is paired with at least one frame. Each frame was captured only after the step's assertions passed.`, ''];
for (const journey of journeys) {
  lines.push(`## ${journey}`, '', '| # | Wireframe | Running app | What happened |', '|---|---|---|---|');
  for (const f of frames.filter((x) => x.journey === journey)) {
    const w = known.get(f.wireframe);
    lines.push(`| ${f.step} | <img src="wireframes/${f.wireframe.slice(3)}.svg" width="360" alt="${forAlt(w.heading)}"> | <img src="frames/${f.file}" width="420" alt="${forAlt(f.caption)}"> | ${forCell(f.caption)} |`);
  }
  lines.push('');
}
writeFileSync(join(OUT, 'storyboard.md'), lines.join('\n'));
console.log(`storyboard: ${frames.length} frames, ${journeys.length} journeys, ${wireframes.length} wireframes paired`);
```

- [ ] **Step 5: Orchestrator and compose service**

`scripts/storyboard.sh` follows `scripts/acceptance.sh`'s structure (fresh clone into `work/app-storyboard`, project `review-storyboard`, `harness/no-host-port.yaml`, `set -Eeuo pipefail`, a pre-clean `app_compose down -v --remove-orphans > /dev/null 2>&1 || true` before `up`, `trap teardown EXIT` and `trap 'echo "storyboard.sh: unexpected error at line ${LINENO}" >&2' ERR`, `wait_healthy`, named `fail()`), then:

```bash
OUT="evidence/${STAMP}/storyboard"
mkdir -p "${OUT}"
docker build -q -t foci-review-storyboard storyboard > /dev/null || fail "storyboard image build failed"
docker run --rm --network "${PROJECT}_default" \
  -e BASE_URL=http://web:8080 -e OUT=/out -e APP_DIAGRAMS=/app-diagrams -e APP_SHA="${SHA}" \
  -v "${HOST_DIR}/${OUT}:/out" -v "${HOST_DIR}/${APP}/docs/diagrams:/app-diagrams:ro" \
  foci-review-storyboard > "${OUT}/playwright.log" 2>&1 \
  || fail "storyboard run failed — see ${OUT}/playwright.log"
echo "Storyboard of ${APP_REPO} @ ${SHA}: $(tail -n 1 "${OUT}/playwright.log")" | tee "${OUT}/summary.md"
```

`compose.yaml`: service `storyboard` (`<<: *tools`, `command: ['bash', 'scripts/storyboard.sh']`). README "Running the checks": `docker compose run --rm storyboard   # every UI journey as captioned screenshots beside its wireframe`.

- [ ] **Step 6: Run and verify**

`docker compose run --rm --build -e APP_REF=<app main full sha> storyboard` → exit 0; `storyboard.md` lists every journey; open at least four frames (Read the PNGs) and confirm each shows what its caption says; confirm all 13 wireframes are paired. Prove the pairing check: temporarily change one frame's wireframe id to `ui/nope` → run exits 1 naming it; revert and delete that evidence. Commit (`feat(storyboard): every UI journey beside its wireframe`) with this run's evidence; push.

---

### Task 4: Run both on the app's `main`, record findings, matrix and sign-off

- [ ] **Step 1: Runs.** With `<SHA>` = app `main` (CI green), run `acceptance` and `storyboard` (and re-run `verify` and `scans` only if the app changed since the last sign-off's evidence). Every summary must name `<SHA>`.
- [ ] **Step 2: Failures.** For each FAIL or storyboard defect: add a finding row (next ID; Severity per the legend; Decision `Fix` if the app is wrong, `Reject` with reason if the expectation is wrong). **Stop and report** app defects to the controller before continuing — they are fixed in the app through its own PR and review, then Step 1 re-runs.
- [ ] **Step 3: Matrix.** Add an **Independent acceptance** column to `traceability/matrix.md`: for each requirement row, the catalogue IDs and storyboard journeys that prove it from outside, or `not observable from outside (<reason>)` (e.g. coverage, commit history). Keep the existing app-test citation column unchanged and separate.
- [ ] **Step 4: Sign-off and README.** New dated sign-off section for `<SHA>`: acceptance totals by section (BR, DR, EC, CS, RA, RB, AD) and by source, storyboard frames/journeys and a link to `storyboard.md`, findings counts recounted from the log, recommendation (unchanged unless the new evidence changes it), earlier sections kept as history. A release-readiness checklist copy for `<SHA>` with an evidence link per box. README "latest evidence" links updated.
- [ ] **Step 5:** Commit (`docs(review): independent acceptance and storyboard for <short SHA>`), push; then the controller reviews every number against the evidence.
