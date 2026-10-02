# Docs diagrams as images, and removal of the `/dev` portal — Design

- **Date:** 2026-10-02
- **Status:** Approved in conversation 2026-10-02 · awaiting written-spec review
- **Amends:** [2026-09-30-foci-todo-design.md](2026-09-30-foci-todo-design.md) (FR-10, NFR-9, ADR 0011)

## 1. Why

The in-app developer portal (`/dev`, FR-10) exists to show the repository's Markdown and Mermaid diagrams. GitHub already renders that Markdown and every Mermaid block, so the portal duplicates it — and it is development material shipped in the production web app, with its own dependency tree (`mermaid`, `react-markdown`, `remark-gfm`, and the `lodash-es` override needed only for Mermaid, finding F-60).

Goals:

1. Every diagram can be **previewed as an image** from the README and the documents it links to, in any Markdown viewer — not only on GitHub.
2. The README maps every supporting document to its diagrams, each with a link to the **Mermaid source** and to its **image**.
3. The production web app contains **only the to-do application**.
4. Images can never silently drift from their Mermaid source, and a Mermaid syntax error can never reach `main`.

## 2. Diagram images

### 2.1 Source of truth and layout

- The Mermaid text in the `.md` files stays the single source of truth. Images are generated files, like `apps/api/openapi.json`, and are never edited by hand.
- Diagram sources: every ```` ```mermaid ```` block in `README.md` and `docs/*.md` (today: README 2, architecture 6, api 7, concurrency 3, testing 1 — 21 in total). ADRs contain none.
- Each diagram has a stable **id** `<doc>/<slug>`:
  - `<doc>` = `readme` for `README.md`, otherwise the file name without extension (`architecture`, `api`, `concurrency`, `testing`).
  - `<slug>` = the nearest preceding Markdown heading's text, lower-cased, with every run of characters outside `a-z0-9` replaced by one `-` and leading/trailing `-` removed (e.g. `### Create — \`POST /api/todos\`` → `create-post-api-todos`); if two diagrams share a heading, the second and later get `-2`, `-3`, ….
- Image path: `docs/diagrams/<doc>/<slug>.svg`.
- `docs/diagrams/manifest.json` lists, per id: source file, heading, image path, and the SHA-256 of the diagram's Mermaid text (normalised: trimmed, `\n` line endings).

### 2.2 How a document shows a diagram

At each diagram, the document shows the image inline, then the Mermaid source collapsed underneath:

````markdown
### Create — `POST /api/todos`

![Create — POST /api/todos (sequence diagram)](diagrams/api/create-post-api-todos.svg)

<details><summary>Mermaid source</summary>

```mermaid
sequenceDiagram
  …
```

</details>
````

- The image previews in any viewer; GitHub also renders the Mermaid block live when expanded.
- Image paths are relative to the document (`diagrams/…` from `docs/*.md`, `docs/diagrams/…` from `README.md`).
- Alt text is the heading text plus the diagram kind, for accessibility.

### 2.3 README map

The README's one-line "More:" list is replaced by a **"Documentation and diagrams"** section: one sub-block per document (README, Architecture, API, Concurrency, Testing, and the ADR index without diagrams), each a short sentence on what the document covers plus a table:

````markdown
| Diagram | Image | Mermaid source |
|---|---|---|
| Create — `POST /api/todos` | [SVG](docs/diagrams/api/create-post-api-todos.svg) | [docs/api.md#create--post-apitodos](docs/api.md#create--post-apitodos) |
````

The Mermaid-source link targets the GitHub anchor of the diagram's heading. The table is hand-maintained Markdown; the gate check (§2.5) verifies every manifest id appears in it and that no row points at a missing image.

### 2.4 Generator

- Command: `docker compose --profile docs run --rm --build diagrams` (Docker only, NFR-0; `--build` so the tool image always matches the checked-out code).
- Runs the pinned official Mermaid CLI image; renders each diagram to SVG with a committed config file: `htmlLabels: false` (labels are real SVG `<text>`, so the image renders correctly when GitHub shows it via `<img>`), deterministic ids, a fixed theme and white background.
- Writes all SVGs and `manifest.json`, deletes images whose id no longer exists, and exits non-zero naming `file:line` on any Mermaid syntax error.
- Output is deterministic: running it twice on the same sources produces byte-identical files (verified when implemented).
- If SVG text labels do not render correctly as an `<img>` on GitHub, the generator emits PNG instead and the spec is amended — decided by an empirical check during implementation, not assumed.

### 2.5 Freshness check (test gate)

- A small TypeScript tool (Markdown → diagram extraction, id/slug rules, hashing, manifest comparison) with unit tests at the project's 100% coverage, following the repository's test conventions.
- A gate test, run by the existing `docker compose --profile test run --rm --build test` without a browser, fails when:
  - a diagram's source hash differs from the manifest (stale image),
  - a manifest id has no image file, or an image file has no manifest id (missing / orphan),
  - a document's diagram is not shown in the §2.2 shape (image link to its own id + `<details>` source), or
  - a manifest id is missing from the README map, or a map row points at a missing image.
- Each failure message names the id and the fix: `run: docker compose --profile docs run --rm --build diagrams`.

### 2.6 CI

A CI step runs the generator and then `git diff --exit-code -- docs/diagrams`, proving the committed images are exactly what the pinned toolchain produces and that every diagram parses.

## 3. Removing the `/dev` portal

- Delete `apps/web/src/dev/` and its tests; `App.tsx` renders only the to-do page (no lazy chunk, no path routing). Remove the header "Developer" link.
- Remove `mermaid`, `react-markdown`, `remark-gfm` from `apps/web` and the root `lodash-es` override; regenerate the lockfile.
- Remove build-info plumbing used only by the portal: Vite/Vitest `define` of `__APP_VERSION__`, `__GIT_SHA__`, `__BUILD_DATE__`, their type declarations, the Dockerfile `ARG`s and their compose build args, and the CI `GIT_SHA` environment.
- Remove the ESLint import-boundary zone for `apps/web/src/dev` and update the CLAUDE.md rule that names it.
- Remove the e2e journey "the developer portal renders the docs with diagrams" (8 journeys remain). Diagram validity is now guarded by §2.4–§2.6.
- Coverage stays at 100% with no new exclusions.
- Docs: remove the `/dev` row from the README's URL table; retake `docs/images/screenshot.png` without the link; mark ADR 0011 *Superseded by 0015*; add **ADR 0015 — Docs and diagrams live in the repository** (context: duplication with GitHub rendering, development material in production code; decision: §2 + this section; consequences); update the ADR index.
- The Swagger UI at `/api/docs` is unaffected.

## 4. Requirement changes

| Requirement | Change |
|---|---|
| FR-10 (browse docs at `/dev`) | **Removed** — superseded by ADR 0015; docs and diagrams are read in the repository |
| NFR-9 (diagrams render) | Now verified by the generator, the gate freshness check and the CI reproduction step instead of the e2e journey |
| New: DOC-1 | Every Mermaid diagram has a committed, up-to-date image and appears in the README map with links to its source and image |

## 5. Delivery

Two pull requests, in this order, each curated and green at every commit:

1. **PR A — remove `/dev`** (`refactor/remove-dev-portal`): this spec and its plans, §3 in full, ADR 0015.
2. **PR B — diagram images** (`docs/diagram-images`): the tool and tests, generator and compose service, CI step, all 21 images, document restructuring (§2.2), README map (§2.3).

PR A lands first: if the documents were restructured while the portal still existed, the portal would show broken image links and raw `<details>` markup until the portal was removed. Between the two merges no diagram changes, and PR B's own CI renders every diagram, so no diagram error can slip through the gap.

After both merge, the companion review repository is refreshed: verify and scans re-run on the new `main`; traceability matrix (FR-10 removed, NFR-9 re-pointed, DOC-1 added); a review note per PR; the sign-off updated to the new commit.

## 6. Out of scope

- Rendering diagrams for any file other than `README.md` and `docs/*.md`.
- Changing any diagram's content.
- Any change to the API, the to-do UI behaviour, or the Swagger UI.
