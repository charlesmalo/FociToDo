# The brief's dueDate, cache and robustness fixes, and docs kept in sync with the code — Design

- **Date:** 2026-10-03
- **Status:** Approved 2026-10-03
- **Amends:** [2026-10-03-api-docs-and-deadlines-design.md](2026-10-03-api-docs-and-deadlines-design.md) (deadline contract), ADR 0014 and ADR 0017

## 1. Why

A read-only code review of `3dbb2eb` found these gaps. Everything that works today keeps working. The gate stays at 100% coverage, and every test stays deterministic.

1. **The brief's own field is rejected.** The brief names `dueDate` ("YYYY-MM-DD format is fine"). The API accepts only `dueAt`, so `{"dueDate":"2026-10-10"}` is a 400.
2. **`GET /api/todos/:id` can serve stale flags through 304.** The route sets `ETag: "<version>"`, and nothing sets `Cache-Control`. Express answers a matching `If-None-Match` with 304, and browsers revalidate. `isOverdue` and `isDueSoon` change with the clock but never bump `version`. Separately, the details dialog never refetches.
3. **A lone UTF-16 surrogate in a title or description is a 500.** It is a 500 when an `Idempotency-Key` is sent, because Postgres `jsonb` rejects the escape. Without the key, the character is silently stored as U+FFFD.
4. **The README screenshot is stale, and nothing proves diagrams match the code.** The hero image still shows the date-only UI. The gate proves each SVG matches its Mermaid source, but not that the Mermaid matches the code.
5. **The edit form can reset a chosen time to 17:00.** Backspacing a segment of the date input briefly reports `''`, which clears the time. Re-entering the date then refills 17:00.
6. **After a 412 in the edit dialog, saving again reverts another writer's change** to fields the user never touched. The form freezes every value and PATCH sends all of them.
7. **Smaller accuracy gaps:**
   - eight API source files are tested through shared suites rather than mirrored files, and nothing says so;
   - the CHECK constraints are overstated in `docs/architecture.md`;
   - ADR 0017 overstates the 422 case;
   - `bin.ts` is missing from the coverage-exclusion list;
   - the runtime `api` image is not pinned to UTC;
   - an impossible date in the form shows the API's "timezone offset" message;
   - the README does not say that updates use PATCH with `If-Match`.
8. **One end-to-end journey depends on the time of day.** The form-entry deadline journey types "New York now + 3 h". On the two daylight-saving nights a year, that wall-clock time can be repeated or skipped, which shifts the expected Tokyo time by an hour.
9. **The docs pointed at tooling outside this repository.** The repository must stand alone.

## 2. Deadlines: the brief's `dueDate` alongside `dueAt` (ADR 0018, amends 0017)

This is an extension, not a reversal. `dueAt`, the exact instant, stays the single stored value and the source of truth. `dueDate` is the brief's date-only way to write and read it.

**Requests (create and PATCH)**
- Each request accepts either `dueDate` or `dueAt`.
- `dueDate` is a real calendar date `YYYY-MM-DD`, with a year from 0001 to 9999, or `null` to clear the deadline.
  - The validator is the one the repository used before deadlines became instants: Zod `iso.date()` plus the year-0000 refinement.
  - Its message is `Due date must be a real date in YYYY-MM-DD format`.
- `dueAt` is unchanged: RFC 3339 with an offset or `Z`. A bare date sent as `dueAt` stays a 400.
- Sending both keys, even when one of them is `null`, is a 400. The issue sits on `dueDate` with the message `Send either dueDate or dueAt, not both`.
- A date-only deadline means **23:59:59 UTC that day**. This is the same rule migration `1759190400002` used for existing dates, so the status of a deadline is the same whichever field set it.
- The shared schemas normalise both forms into one output field, `dueAt`. Domain, service and repositories stay unchanged.
- The PATCH "at least one field" message names `dueDate` too.

**Responses**
- Every `TodoView` also carries `dueDate`: the UTC calendar date of `dueAt` (`YYYY-MM-DD`), or `null`.
- **Round-trip:** sending `dueDate: "2026-10-10"` returns `dueAt: "2026-10-10T23:59:59.000Z"` and `dueDate: "2026-10-10"`.
- **Documented consequence:** `dueDate` is the UTC date, so a deadline of 22:00 on 10 Oct in New York reads `2026-10-11`. The web app keeps showing `dueAt` in local time.

**List query**
- `sort=dueDate` is accepted as an alias of `sort=dueAt`. The parsed query always says `dueAt`.

**Idempotency**
- **The request hash** already uses the parsed body. Both forms parse to the same `dueAt`, so `dueDate` and the equivalent `dueAt` count as the same request.
- **Cached replay bodies** are parsed with `TodoViewSchema`, so a body cached before this change would 500 on replay.
  - A new migration, `1759190400003_due-date-in-cached-responses.sql`, adds `dueDate` to cached response bodies. It is up and down, following the pattern of `1759190400002`.
  - The up migration sets `dueDate` = `left(dueAt, 10)`, or `null`. The down migration removes the key.
  - It has an integration test like `dueAtMigration.int.test.ts`.
  - The latest-migration name pinned in `PgDatabaseProbe.int.test.ts` is updated.

**Tests**
- **Shared schema:**
  - a valid date;
  - an impossible date (`2026-02-30`);
  - year bounds (`0000` rejected, `0001` and `9999` accepted);
  - `null` clears;
  - both keys sent gives a 400 on `dueDate`;
  - the `sort=dueDate` alias.
- **Domain `toView`:** `dueDate` derivation, including the New York evening case.
- **Service and route integration** through both create and PATCH, plus the idempotent equivalence of the two forms.
- **OpenAPI conformance.**
- **One end-to-end API case** with far-future dates. Nothing depends on wall-clock time.

**Generated files and docs**
- Regenerate `apps/api/openapi.json`, then `docs/api/index.html`, with the CLAUDE.md commands.
- Update `docs/api.md`.
- Add a README assumption naming both fields, their formats, the end-of-day UTC rule, and that a response's `dueDate` is the UTC date.
- Add **ADR 0018, "Deadlines accept the brief's dueDate alongside dueAt"**, status *Accepted, amends 0017*, and add it to the ADR index.
- Update any Mermaid diagram that lists `TodoView` or request fields, regenerated with the diagrams command.

## 3. API robustness

**No-store and no conditional GET**
- One small middleware, `apps/api/src/http/apiCacheHeaders.ts`, is mounted on `/api` before every route and has a mirrored unit test. It:
  - sets `Cache-Control: no-store` on every API response, problem responses included;
  - deletes `If-None-Match` and `If-Modified-Since` from the request.
- A one-line comment explains why: the ETag versions the stored todo for `If-Match`, while the flags in a response come from the clock.
- **Integration test:** a GET with `If-None-Match` equal to the current ETag returns **200 with a body**, never 304, and carries `Cache-Control: no-store`.
- **Docs:** add "no conditional GET; the ETag is for `If-Match`" to the `docs/api.md` conventions, and add the same point to the "What is not guaranteed" list in `docs/concurrency.md`.

**Lone surrogates**
- The title and description schemas get a refinement next to `hasNoNul`. It rejects `/\p{Cs}/u`, because the TypeScript library target is ES2023 and does not include `String.prototype.isWellFormed`.
- The messages follow the NUL style: `Title must not contain an unpaired surrogate character`, and the same for Description.
- **Schema tests:** a lone high surrogate and a lone low surrogate are rejected; a valid pair (an emoji) is accepted.
- **Route tests:** create with an `Idempotency-Key`, create without one, and PATCH all return 400 `application/problem+json`.

**UTC in the runtime image**
- The `api` stage in the Dockerfile sets `ENV TZ=UTC`. It starts `FROM node` again, so it does not inherit the base stage's setting. `migrate` is built `FROM api` and inherits it.

## 4. Web app

- **The details dialog refreshes like the list.**
  - `useTodo` uses the same refetch interval as `useTodoList`.
  - The constant `LIST_REFETCH_INTERVAL_MS` is renamed `TODO_REFETCH_INTERVAL_MS`, still `60_000`.
  - A README assumption records the consequence: the server decides the badges, and a badge can lag a passing deadline by up to 60 s. The list also refreshes on window focus and after every change.
- **The chosen due time is kept.**
  - `TodoForm` keeps the last chosen time when the date input empties.
  - While there is no date, the time input renders empty and disabled. The kept time comes back when a date returns.
  - 17:00 is the default only if no time was ever chosen.
  - Submitting with no date still sends no deadline.
- **Impossible dates get a form message.**
  - The form recognises an impossible date (the existing round-trip check) and shows `Enter a real date` under Due date. No request is sent.
  - The pinned test is updated. The API message is unchanged.
- **PATCH sends only what changed.**
  - PATCH contains only the fields that differ from the form's starting values. The deadline, date plus time, counts as one field. An untouched deadline is not sent, so the stored instant is preserved exactly.
  - Saving with no changes closes the dialog without a request.
  - **After a 412:** fields the user did not change adopt the reloaded values, and edited fields keep the user's input. The reloaded values become the new starting values.
  - The conflict notice text stays accurate. The README statement that lost updates are impossible then holds for the web app too.
- **Tests (React Testing Library)** cover:
  - date → `''` → date keeps 09:00;
  - clearing the date and saving clears the deadline;
  - an untouched deadline is not resent;
  - an impossible date shows the form message;
  - the two-writer scenario: B changes the description, A's stale title edit gets a 412, A saves again, and B's description survives;
  - no-change save;
  - the shared interval on both queries.
- **The form-entry end-to-end journey becomes deterministic.**
  - It types the fixed deadline 15 Jan 2030 09:30 in an `America/New_York` context.
  - It asserts that the API stored exactly `2030-01-15T14:30:00.000Z`. January 2030 in New York is EST, UTC−5.
  - It asserts both cities' displayed times, computed from that instant.
  - The badge part of the timezone story stays in the API-seeded journey, whose deadlines are hours away from any boundary.

## 5. Docs provably in sync with the code

### 5.1 Generated screenshots

- **The generator** runs Playwright scenes in the pinned Playwright image. The code lives in a top-level `screenshots/` directory, outside Vitest coverage like `e2e/`. It renders the **built** web app, served statically, with `/api` route-mocked from fixtures.
  - The fixtures are validated against `TodoViewListSchema` and `TodoViewSchema` before use, so they cannot drift from the contract.
- **Determinism:**
  - viewport 1100×760;
  - `deviceScaleFactor: 1`;
  - locale `en-US`;
  - timezone `UTC`;
  - `reducedMotion: 'reduce'`;
  - the page clock fixed with Playwright's clock API;
  - fixture deadlines as fixed dates, with flags taken from the fixtures, so no real clock is involved.
- **Two scenes:**
  - `docs/images/screenshot.png`, the README hero: a list with overdue, due-soon, completed and no-deadline rows;
  - `docs/images/edit-dialog.png`, the edit dialog with the Due date and Due time inputs, shown in the README and in `docs/ui.md`.
- **Manifest:** `docs/images/manifest.json` records, as sha256:
  - one hash over every UI input: `apps/web/src/**`, `apps/web/index.html`, `packages/shared/src/**`, and the scenes, fixtures and generator;
  - the Playwright version;
  - each image's hash.
  - Dependency lockfiles are deliberately not inputs. Only the Playwright version is pinned into the hash, so an unrelated lockfile change does not force a regeneration.
- **Command:** `docker compose --profile docs run --rm --build screenshots`, a new service next to `diagrams`.
- **Gate check (no browser, so it cannot flake):** logic in `packages/diagrams` (`screenshots.ts`), reusing its repo, manifest and check helpers, at 100% unit coverage, and run in the gate the same way as the diagram check. It fails when:
  - the recomputed input hash differs from the manifest;
  - an image's hash differs from the manifest, which means a hand edit;
  - an image referenced from the README or docs is missing from the manifest.
  - On failure it prints the exact regenerate command, as the diagram check does.
- **Line endings:** `.gitattributes` already forces LF line endings (`* text=auto eol=lf`) and treats `*.png` as binary, so hashes are identical on every platform.
- **No CI regeneration:** CI does not regenerate screenshots. Pixel output differs between CPU architectures, so the gate proves only that the inputs have not changed since the images were generated, and that the images were not hand-edited.

### 5.2 Diagram content freshness

- **The map file:** one hand-written file, `docs/diagram-depicts.json`, maps each diagram id to the source paths it depicts.
  - Paths are specific files, not whole trees, so an unrelated edit does not flag a diagram.
  - Conceptual diagrams such as "How this was built" declare `[]`.
  - Nothing is placed between a heading and its bare Mermaid block, so the layout CLAUDE.md requires is unchanged.
- **Stamping:** the diagrams manifest gains a `depictsHash` per diagram, the sha256 of the declared files, written by the regenerate command.
- **The gate fails when:**
  - a declared file changes until the diagram is reviewed, updated and re-stamped;
  - a diagram has no declaration;
  - a declaration names a missing file or an unknown diagram.
- **The existing CI job,** which regenerates diagrams and requires no diff, keeps working, because the stamp is deterministic.

### 5.3 One-time sync

After sections 2–4 land:
1. Audit every Mermaid diagram and wireframe against the current code, in `docs/architecture.md`, `docs/api.md`, `docs/concurrency.md`, `docs/testing.md`, `docs/ui.md` and the README.
2. Fix any drift.
3. Regenerate the diagrams.
4. Regenerate the screenshots last, after every web change.

### 5.4 CLAUDE.md rules

- Any UI change regenerates the screenshots in the same commit.
- A diagram flagged stale is updated to match the code before it is re-stamped. Never re-stamp without reviewing.

## 6. Documentation accuracy and a self-contained repository

- **Mirror-path exception:** eight API source files are tested through the shared repository contract suite and the route tests rather than a mirrored file:
  - `createHttpApp.ts`;
  - the four in-memory adapter classes;
  - the two Postgres adapter classes;
  - `rows.ts`.
  - The exception is stated in CLAUDE.md, `docs/testing.md` and the README's "Tests mirror source paths" line. No duplicate test files are added.
- **`docs/architecture.md`:** the CHECK constraints are a backstop for core invariants (non-blank title, lengths, positive version). Full validation lives in the shared schema. No schema change.
- **ADR 0017, consequence bullet corrected:**
  - a retry across the deploy with no deadline replays;
  - a retry still sending `dueDate` got a 400 before hashing.
  - The shipped migration is untouched, because migrations are immutable.
- **`docs/testing.md`:** `packages/diagrams/src/bin.ts` is added to the coverage-exclusion list.
- **README assumptions:**
  - updates use PATCH;
  - PATCH and DELETE require `If-Match`;
  - Complete and Incomplete do not.
- **README "Design changes" section:** three bullets, each linking its ADR, phrased as deliberate course corrections, without dates or effort.
  - The in-app `/dev` portal became docs and diagrams in the repository (ADR 0015).
  - The served API explorer became a static generated reference (ADR 0016).
  - The date-only deadline became an instant, with the brief's `dueDate` kept (ADRs 0017 and 0018).
- **Original spec** (`2026-09-30-foci-todo-design.md`, which CLAUDE.md points to): a one-line banner at each section that still describes one of these. Historical content stays.
  - `dueDate` as the only deadline: "Superseded by ADR 0017 and ADR 0018".
  - The `/dev` portal: "Superseded by ADR 0015".
  - The served `/api/docs`: "Superseded by ADR 0016".
- **Deferred pagination (ADR 0019, "Pagination is out of scope (deferred)")** records the decision and the approach that would be built.
  - **Why it is out of scope:** this is a proof of concept with small lists.
  - **The approach that would be built:**
    - keyset pagination with optional `limit` (default 50, maximum 100) and `cursor` parameters;
    - a request without them returns the first page;
    - the response body stays the original array, with the next page in a `Link: rel="next"` header;
    - one index per sort, and a partial index for the deadline filters;
    - a "Load more" button.
  - **Rejected alternatives:** offset pages and a response envelope.
  - **Links:** README assumption 7 links the ADR, and `PgTodoRepository.list` gets a one-line comment.
- **Self-contained repository:**
  - remove every reference to tooling outside this repository from the tree: README, ADR 0014, `docs/ui.md`, and the specs and plans under `docs/superpowers/`;
  - delete the four plan files that only drove that repository, and update their plan indexes;
  - afterwards, a case-insensitive search of the tree for that repository's name, or for the phrases that described it, finds nothing.
  - Commit history is left as it is, because `main` is never rewritten.

## 7. Delivery

**One branch** (`feat/brief-duedate-and-docs-sync`), **one PR** with a merge commit as before (ADR 0014), and **six commits**. Each commit is atomic and green, with its tests, and with generated artefacts in the commit that changed their source.

| # | Commit | Covers |
|---|---|---|
| 1 | `docs(spec): design and plan for the brief's dueDate, cache, form and docs-sync fixes` | this spec and its plan |
| 2 | `feat(deadlines): accept the brief's dueDate alongside dueAt` | §2 |
| 3 | `fix(api): no-store without 304s, reject lone surrogates, UTC api image` | §3 |
| 4 | `fix(web): keep the chosen due time, send only changed fields, refresh details` | §4 |
| 5 | `feat(docs): screenshots and diagrams verified by the test gate` | §5.1, §5.2, §5.4 |
| 6 | `docs(repo): sync diagrams, design changes, deferred pagination, self-contained repo` | §5.3, §6 (screenshots regenerated last) |

**Process rules:**
- Intermediate commits during the work are squashed into these six before the PR opens.
- Review fixes go in as `--fixup` commits and are autosquashed.
- `main` is never rewritten.
- The PR is merged only after explicit approval.
- Committed text covers only the code, its behaviour and the decisions behind it.

## 8. Verification

Before the PR opens, and again after merge, record the exit codes and summaries of the following:

1. **The test gate,** `docker compose --profile test run --rm --build test`: exit 0 with 100% coverage. Run it **twice in a row**.
2. **The README end-to-end subshell:** exit 0.
3. **The app:** `docker compose up --build -d --wait`, then the README smoke test.
4. **Manual checks against the running stack:**
   - a POST of `{"title":"x","dueDate":"2030-01-02"}` returns 201 with both `dueDate` and `dueAt`;
   - `GET /api/todos/{id}` with `If-None-Match` set to that ETag returns 200 with `Cache-Control: no-store`;
   - a create with a lone surrogate and an `Idempotency-Key` returns 400.
5. **Freshness gates, on a scratch branch that is then deleted:**
   - a trivial web source edit makes the gate fail and print the screenshot regenerate command;
   - an edit to a depicted source makes it fail on diagram freshness.
6. **At the end:**
   - make a fresh `git clone` of `main` into a scratch directory under `~/workspace`;
   - run steps 1 and 2 there.

## 9. Out of scope

- Pagination (ADR 0019).
- Scheduling badge refreshes at the exact deadline (the 60 s refresh is documented).
- Regenerating screenshots in CI.
- Rewriting history.
