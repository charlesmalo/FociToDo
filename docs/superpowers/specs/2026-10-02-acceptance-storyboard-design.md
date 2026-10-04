# UI wireframes — Design

- **Date:** 2026-10-02
- **Status:** Approved 2026-10-02
- **Builds on:** [2026-10-02-docs-diagrams-design.md](2026-10-02-docs-diagrams-design.md) (diagram pipeline)

## 1. Why

The UI is a single page whose dialog switches between creating, viewing, editing and deleting, so its screen states are easy to lose track of. Each state needs one small, reviewable picture that stays in step with the code.

Goals:

1. Every screen state is described by a **wireframe**, a Mermaid `block-beta` diagram in `docs/ui.md`, using the strings the UI actually shows.
2. The wireframes flow through the existing diagram pipeline, so the gate fails when an image is stale, missing or orphaned.

## 2. Wireframes

### 2.1 Content

A new guide `docs/ui.md` describes the single-page UI and holds one Mermaid `block-beta` wireframe per screen state, each under its own heading (which gives it a stable diagram id `ui/<slug>`):

| Screen state                    | Shows                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Task list — loading             | header, filters, "Loading tasks…"                                                          |
| Task list — empty               | "No tasks yet. Add your first one."                                                        |
| Task list — with tasks          | rows with checkbox, title, due date, OVERDUE badge, a completed row                        |
| Task list — no match            | "No tasks match this filter."                                                              |
| Task list — load error          | error banner with Retry                                                                    |
| Filters and sorting             | Show (All / Completed / Incomplete / Overdue), Sort (Created / Due date / Title), Order |
| Dialog — new task               | Title, Description, Due date, Add task                                                     |
| Dialog — new task with errors   | field-level messages (e.g. empty title)                                                    |
| Dialog — task details           | title, status, due date, created, description, Edit / Delete                    |
| Dialog — edit task              | form prefilled, Save                                                                       |
| Dialog — delete confirmation    | "Delete this task?"                                                                        |
| Dialog — changed elsewhere      | conflict notice after a 412, edits kept                                                    |
| Dialog — task no longer exists  | "This task no longer exists."                                                              |

Exact visible strings are taken from the UI at implementation time (the list above is indicative).

### 2.2 Pipeline

- The wireframes flow through the existing diagram pipeline: generated SVG under `docs/diagrams/ui/`, image-first with collapsed source, README map block **UI** (linking `docs/ui.md`), gate-checked, CI-reproduced.
- `packages/diagrams`: `diagramKind` maps `block-beta` (and `block`) to `wireframe`, so alt text reads `<heading> (wireframe)`.
- `mermaid.config.json` adds `block: { useMaxWidth: false }` (verified 2026-10-02: Mermaid 12 renders `block-beta` with SVG text labels and no `foreignObject`, but with `width="100%"` unless this is set).
- `docs/architecture.md` (Frontend) and the README link `docs/ui.md`.

## 3. Delivery

One PR (`docs/ui-wireframes`): this spec, its plan and §2.

## 4. Out of scope

- Changing app behaviour.
- Pixel-level visual regression; the wireframes are documentation.
