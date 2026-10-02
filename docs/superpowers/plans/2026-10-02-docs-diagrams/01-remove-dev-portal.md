# Remove the `/dev` portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The production web app contains only the to-do application: the `/dev` portal, its dependencies, its build-info plumbing and its e2e journey are gone, and ADR 0015 records why.

**Architecture:** Pure removal. `App` renders `TodoPage` unconditionally; the header keeps only "+ New task". Build constants that existed only for the portal's build-info panel are removed end to end (Vite/Vitest `define`, type declarations, Dockerfile `ARG`s, compose build args, CI env).

**Tech Stack:** React 19, Vite, Vitest, Playwright, ESLint (import-x boundaries), Docker Compose, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-10-02-docs-diagrams-design.md](../../specs/2026-10-02-docs-diagrams-design.md) §3, §4, §5 — read with [00-index.md](00-index.md) (global constraints).

Branch: `refactor/remove-dev-portal` (already exists; it carries the spec and these plans).

## Global Constraints

See [00-index.md](00-index.md#global-constraints-all-plans). In addition:

- Remove exactly: `mermaid`, `react-markdown`, `remark-gfm` (from `apps/web/package.json`) and the root `"overrides": { "lodash-es": "4.18.1" }` block.
- e2e journeys after this plan: 8 (was 9).
- The Swagger UI at `/api/docs` is untouched.

## Review Focus

1. A bookmarked `http://localhost:8080/dev` (or `/dev/anything`) still loads — it now shows the to-do page via nginx's SPA fallback, never a blank page or an nginx 404. Pinned by the App test (renders the to-do page regardless of path) and a manual `curl` check in Task 1.
2. No leftover reference to the removed build constants (`__APP_VERSION__`, `__GIT_SHA__`, `__BUILD_DATE__`) or to `APP_VERSION`/`GIT_SHA`/`BUILD_DATE` build args anywhere — a stale reference would break `tsc` or silently pass dead config. Pinned by a `git grep` step in Task 1.
3. `lodash-es` is gone from the dependency tree entirely (not just un-overridden): `npm ls lodash-es` prints `(empty)`, and `npm audit --omit=dev` stays at 0. Pinned in Task 1 Step 9.
4. Docs that tell a reader how many e2e journeys exist or mention `/dev` are updated (README, CLAUDE.md, `docs/*.md`, AGENTS.md). Pinned by `git grep` in Task 2.
5. Keyboard focus after closing the dialog still lands on "+ New task" (the header lost its only other control). Pinned by the existing TodoPage/TodoDialog tests staying green — do not delete them.

---

### Task 1: Remove the portal from the web app

**Files:**

- Delete: `apps/web/src/dev/` (all 9 files), `apps/web/tests/dev/` (all 8 files)
- Modify: `apps/web/src/App.tsx`, `apps/web/tests/App.test.tsx`
- Modify: `apps/web/src/todos/components/TodoPage.tsx`, `apps/web/tests/todos/components/TodoPage.test.tsx`, `apps/web/src/todos/components/TodoPage.module.css` (only if it styles the removed link)
- Modify: `apps/web/package.json`, `package.json`, `package-lock.json`
- Modify: `apps/web/vite.config.ts`, `vitest.config.ts`; delete or trim `apps/web/src/vite-env.d.ts`
- Modify: `Dockerfile` (`build-web` stage), `compose.yaml` (`web.build.args`), `.github/workflows/ci.yml` (`GIT_SHA` env)
- Modify: `eslint.config.js` (two `/dev` zones), `CLAUDE.md` (web boundary rule)
- Modify: `e2e/todos.spec.ts` (delete the portal journey)

**Interfaces:**

- Produces: `App({ client, queryClient }: { client: TodoClient; queryClient: QueryClient })` — the `pathname` prop and the `isDevPath` export no longer exist.

- [ ] **Step 1: Write the failing tests**

Replace `apps/web/tests/App.test.tsx` with:

```tsx
import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { fakeClient } from './support/fixtures';

describe('App', () => {
  it('renders the todo page with its providers', async () => {
    const client = fakeClient({ list: vi.fn(async () => []) });
    render(<App client={client} queryClient={new QueryClient()} />);
    expect(screen.getByRole('heading', { name: 'FociToDo' })).toBeInTheDocument();
    expect(await screen.findByText('No tasks yet. Add your first one.')).toBeInTheDocument();
  });

  it('renders the todo page whatever the current path (old /dev bookmarks included)', () => {
    window.history.pushState({}, '', '/dev/anything');
    const client = fakeClient({ list: vi.fn(async () => []) });
    render(<App client={client} queryClient={new QueryClient()} />);
    expect(screen.getByRole('heading', { name: 'FociToDo' })).toBeInTheDocument();
    window.history.pushState({}, '', '/');
  });
});
```

In `apps/web/tests/todos/components/TodoPage.test.tsx`, replace the line

```tsx
    expect(screen.getByRole('link', { name: 'Developer' })).toHaveAttribute('href', '/dev');
```

with

```tsx
    expect(screen.queryByRole('link', { name: 'Developer' })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose --profile dev run --rm dev npx vitest run apps/web/tests/App.test.tsx apps/web/tests/todos/components/TodoPage.test.tsx`
Expected: FAIL — the second App test renders the portal's loading state instead of the to-do heading, and the TodoPage test finds the "Developer" link.

- [ ] **Step 3: Remove the portal code**

Replace `apps/web/src/App.tsx` with:

```tsx
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { TodoClientProvider } from './api/TodoClientContext';
import type { TodoClient } from './api/todoClient';
import { TodoPage } from './todos/components/TodoPage';

interface AppProps {
  client: TodoClient;
  queryClient: QueryClient;
}

export function App({ client, queryClient }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider client={client}>
        <TodoPage />
      </TodoClientProvider>
    </QueryClientProvider>
  );
}
```

In `apps/web/src/todos/components/TodoPage.tsx`, delete the line `<a href="/dev">Developer</a>`. The header's action group now holds one control, so change its wrapper from `<nav className={styles.actions}>` … `</nav>` to `<div className={styles.actions}>` … `</div>` (a navigation landmark around a single button is misleading to screen readers). If `TodoPage.module.css` has rules that target only the removed link (e.g. `.actions a`), delete them.

Delete the directories:

```bash
git rm -r apps/web/src/dev apps/web/tests/dev
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose --profile dev run --rm dev npx vitest run apps/web/tests/App.test.tsx apps/web/tests/todos/components/TodoPage.test.tsx`
Expected: PASS (3 tests in these two files' changed cases; all others unchanged).

- [ ] **Step 5: Remove the portal's dependencies**

In `apps/web/package.json`, delete the three lines for `"mermaid"`, `"react-markdown"` and `"remark-gfm"` from `dependencies`. In the root `package.json`, delete the whole block:

```json
  "overrides": {
    "lodash-es": "4.18.1"
  },
```

Regenerate the lockfile inside Docker:

```bash
docker compose --profile dev run --rm dev npm install --no-audit --no-fund
```

Expected: `package-lock.json` changes; no `mermaid`, `react-markdown`, `remark-gfm` or `lodash-es` entries remain (`grep -c '"node_modules/lodash-es"' package-lock.json` → `0`).

- [ ] **Step 6: Remove the build-info plumbing**

`apps/web/vite.config.ts` becomes:

```ts
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@foci/shared': fromHere('../../packages/shared/src/index.ts') },
  },
});
```

In `vitest.config.ts`, delete the `define: { __APP_VERSION__: …, __GIT_SHA__: …, __BUILD_DATE__: … },` block from the `web` project (keep `extends`, `plugins` and `test`).

`apps/web/src/vite-env.d.ts`: delete the comment line and the three `declare const` lines. If the file is then empty, `git rm` it; if it still holds `/// <reference types="vite/client" />`, keep only that line.

In `Dockerfile`, the `build-web` stage becomes:

```dockerfile
FROM source AS build-web
RUN npm run build -w @foci/web
```

In `compose.yaml`, the `web` service's `build` becomes:

```yaml
    build:
      context: .
      target: web
```

In `.github/workflows/ci.yml`, delete the two `env:` blocks that set `GIT_SHA: ${{ github.sha }}` (in the `e2e` and `images` jobs).

Check nothing still refers to them:

```bash
git grep -nE '__APP_VERSION__|__GIT_SHA__|__BUILD_DATE__|APP_VERSION|GIT_SHA|BUILD_DATE' -- ':!docs/superpowers'
```

Expected: no output.

- [ ] **Step 7: Remove the portal's lint boundary and update the rule text**

In `eslint.config.js`, delete the two zones whose `target`/`from` is `./apps/web/src/dev` (messages "todo feature must not depend on the dev portal" and "dev portal must not depend on todo feature internals"). Keep the `./apps/web/src` ← `./apps/api` zone.

In `CLAUDE.md`, replace the line

```markdown
- Web: the todo feature and the `/dev` portal never import each other; nothing in `apps/web` imports `apps/api`.
```

with

```markdown
- Web: nothing in `apps/web` imports `apps/api`.
```

- [ ] **Step 8: Remove the portal's e2e journey**

In `e2e/todos.spec.ts`, delete the whole `test('the developer portal renders the docs with diagrams', …)` block (from that `test(` line through its closing `});`). Delete any helper or import that only that block used.

- [ ] **Step 9: Run the full gate, the e2e suite and the dependency checks**

```bash
docker compose --profile test run --rm --build test
docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e; rc=$?
docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml down -v
echo "e2e exit: $rc"
docker compose --profile dev run --rm dev sh -c 'npm ls lodash-es mermaid react-markdown remark-gfm; npm audit --omit=dev --audit-level=high'
```

Expected: the gate exits 0 with 100/100/100/100 coverage; e2e `8 passed`, exit 0; `npm ls` prints `└── (empty)`; `npm audit` prints `found 0 vulnerabilities`.

Then check an old bookmark still works:

```bash
docker compose up --build -d --wait
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:8080/dev
docker compose down
```

Expected: `200` (nginx serves the SPA; the browser shows the to-do page).

- [ ] **Step 10: Commit**

```bash
git add -A apps/web package.json package-lock.json vitest.config.ts Dockerfile compose.yaml .github/workflows/ci.yml eslint.config.js CLAUDE.md e2e/todos.spec.ts
git commit -F - <<'EOF'
refactor(web): remove the /dev developer portal

The portal rendered the repository's Markdown and Mermaid diagrams inside
the production app, duplicating what GitHub already renders. Remove it with
its dependencies (mermaid, react-markdown, remark-gfm and the lodash-es
override they needed), its build-info constants and build args, its lint
boundary and its e2e journey. App now always renders the to-do page, so an
old /dev bookmark lands on the app.

Co-Authored-By: Claude <model> <noreply@anthropic.com>
EOF
```

---

### Task 2: Record the decision and update the docs

**Files:**

- Create: `docs/decisions/0015-docs-and-diagrams-in-the-repository.md`
- Modify: `docs/decisions/0011-in-app-developer-portal.md` (status line), `docs/decisions/README.md` (index)
- Modify: `README.md` (URL table; any `/dev` or journey-count mention), `docs/images/screenshot.png`
- Modify: `docs/superpowers/specs/2026-09-30-foci-todo-design.md` (FR-10 row), `docs/superpowers/specs/2026-10-02-docs-diagrams-design.md` (status line)
- Modify if they mention the portal or the e2e journey count: `docs/*.md`, `AGENTS.md`

**Interfaces:**

- Consumes: Task 1's removal.

- [ ] **Step 1: Write ADR 0015**

`docs/decisions/0015-docs-and-diagrams-in-the-repository.md`:

```markdown
# 0015 Docs and diagrams live in the repository

Status: Accepted · 2026-10-02 · Supersedes [0011](./0011-in-app-developer-portal.md)

## Context

The `/dev` portal (ADR 0011) rendered the repository's Markdown and Mermaid diagrams inside the web app. GitHub already renders the same Markdown and Mermaid, so the portal duplicated it, and it shipped development material — with `mermaid`, `react-markdown`, `remark-gfm` and a `lodash-es` security override — in the production image.

## Decision

Remove the portal: the production web app contains only the to-do application. Documentation is read in the repository, starting from the README, which maps every guide and diagram. Each Mermaid diagram also gets a generated SVG image committed under `docs/diagrams/`, shown above its collapsed Mermaid source, so it previews in any Markdown viewer; a test-gate check keeps images in step with their source.

## Consequences

- **Positive:** Smaller production app and dependency tree (three runtime packages and a security override gone); one copy of the docs, readable without running the app.
- **Negative:** Diagram images are generated files that must be regenerated when a diagram changes (enforced by the test gate); reading rendered docs needs GitHub or any Markdown viewer instead of the running app.

## Alternatives considered

Hiding the link but keeping `/dev` (ships unreachable code), a separate documentation site (extra build and hosting).
```

- [ ] **Step 2: Supersede ADR 0011 and update the index**

In `docs/decisions/0011-in-app-developer-portal.md`, replace `Status: Accepted · 2026-09-30` with:

```markdown
Status: Superseded by [0015](./0015-docs-and-diagrams-in-the-repository.md) · 2026-10-02 (accepted 2026-09-30)
```

In `docs/decisions/README.md`, change the 0011 row's decision text to `In-app \`/dev\` portal single-sourced from \`docs/\` (superseded by 0015)` and add a row:

```markdown
| [0015](./0015-docs-and-diagrams-in-the-repository.md) | Docs and diagrams live in the repository |
```

(Prettier realigns the table in Step 6.)

- [ ] **Step 3: Update the specs**

In `docs/superpowers/specs/2026-09-30-foci-todo-design.md`, change the FR-10 row's requirement cell to:

```markdown
~~Browse developer documentation (rendered diagrams, API explorer link, ADRs, build info) from within the web UI at `/dev`~~ — removed 2026-10-02, see [ADR 0015](../../decisions/0015-docs-and-diagrams-in-the-repository.md) and [the docs-diagrams spec](2026-10-02-docs-diagrams-design.md)
```

In `docs/superpowers/specs/2026-10-02-docs-diagrams-design.md`, change the status line to `- **Status:** Approved 2026-10-02`.

- [ ] **Step 4: Update the README and other docs**

In `README.md`, delete the URL-table row `| http://localhost:8080/dev | Developer portal: rendered docs, diagrams and decision records |`.

Find every other mention:

```bash
git grep -nE '/dev\b|[Dd]eveloper portal|portal|9 passed|nine journeys|9 journeys' -- README.md AGENTS.md CLAUDE.md docs/*.md docs/decisions/*.md e2e
```

For each hit that refers to the removed portal or to 9 e2e journeys, update it (8 journeys; no portal). Leave hits that are about the `dev` Compose profile, `/dev/null`, ADR 0011's own historical text, or ADR 0015.

- [ ] **Step 5: Retake the screenshot without the Developer link**

```bash
docker compose up --build -d --wait
curl -s -X POST localhost:8080/api/todos -H 'Content-Type: application/json' -d '{"title":"Buy oat milk","dueDate":"2030-01-15"}' >/dev/null
curl -s -X POST localhost:8080/api/todos -H 'Content-Type: application/json' -d '{"title":"File taxes","dueDate":"2026-04-30","description":"Receipts in the blue folder"}' >/dev/null
curl -s -X POST localhost:8080/api/todos -H 'Content-Type: application/json' -d '{"title":"Call the bank"}' >/dev/null
docker run --rm --network foci-todo_default -v "$PWD/docs/images":/out mcr.microsoft.com/playwright:v1.63.0-noble \
  npx -y playwright@1.63.0 screenshot --viewport-size=1100,700 http://web:8080 /out/screenshot.png
docker compose down -v
```

Expected: `docs/images/screenshot.png` shows the list with an OVERDUE badge on "File taxes" and only "+ New task" in the header. Open the PNG and confirm by eye. (`docker compose down -v` deletes the demo data volume — only run it on a stack you started for this step.)

- [ ] **Step 6: Format and run the gate**

```bash
docker compose --profile dev run --rm dev npx prettier --write README.md AGENTS.md CLAUDE.md docs
docker compose --profile test run --rm --build test
```

Expected: gate exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A README.md AGENTS.md CLAUDE.md docs
git commit -F - <<'EOF'
docs(decisions): record the removal of the developer portal (ADR 0015)

ADR 0015 supersedes 0011: docs and diagrams live in the repository, mapped
from the README. FR-10 is marked removed in the original spec, the README
no longer lists /dev, and the screenshot shows the header without the
Developer link.

Co-Authored-By: Claude <model> <noreply@anthropic.com>
EOF
```

---

### Finish: pull request

- [ ] Curate (`git rebase -i --autosquash main` only if fixups exist; never on `main`), push `refactor/remove-dev-portal`, open the PR against `main` with `gh pr create` (title `refactor: remove the /dev developer portal`; body: summary, the spec link, verification evidence — gate, e2e 8/8, `npm ls`/`npm audit`, `/dev` → 200; ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), wait for CI green (`gh pr checks --watch`). Merge only after the task reviews are clean.
