# API docs as a local artifact — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The running app no longer serves `/api/docs` or `/api/openapi.json` (both 404); the API reference is a generated, self-contained `docs/api/index.html` that opens from disk, kept in sync with `apps/api/openapi.json` by the test gate.

**Architecture:** Remove the docs router and `swagger-ui-express` from the API. Add a pure renderer `renderApiDocs(document, assets)` to the docs-tooling package `packages/diagrams`, with `swagger-ui-dist` pinned as a dev dependency there. A repository test rebuilds the HTML from the committed `openapi.json` and fails on drift (regenerate with `UPDATE_API_DOCS=1`).

**Tech Stack:** Express 5, Vitest + Supertest, Playwright (e2e), Swagger UI 5.33.0 (`swagger-ui-dist`), TypeScript.

**Spec:** [2026-10-03-api-docs-and-deadlines-design.md](../../specs/2026-10-03-api-docs-and-deadlines-design.md) §2 — with [00-index.md](00-index.md) (global constraints).

Branch: `refactor/api-docs-local` (exists; carries the spec and these plans).

## Review Focus

1. A request to `/api/docs`, `/api/docs/`, `/api/docs/index.html` or `/api/openapi.json` must get the API's 404 problem (`application/problem+json`, `/problems/not-found`) — not the SPA page and not a 500. Pinned in Task 1 (int test + e2e).
2. The local HTML must work from `file://` with no network: the spec and the viewer are inlined, and nothing in the page fetches a URL. Pinned in Task 2 Step 6 (open it with Playwright, offline, and screenshot it).
3. Inlined JSON or script containing `</script>` must not break the page. Pinned in Task 2 (renderer unit test with a hostile description).
4. The docs file must change whenever `openapi.json` changes. Pinned in Task 2 (repository test compares the committed file with a fresh render).

---

### Task 1: Stop serving API docs from the running app

**Files:**
- Delete: `apps/api/src/http/docsRoutes.ts`, `apps/api/tests/http/docsRoutes.test.ts`
- Modify: `apps/api/src/http/createHttpApp.ts`, `apps/api/tests/http/openapi.int.test.ts` (last test), `apps/api/package.json` (drop `swagger-ui-express`, `@types/swagger-ui-express`), `package-lock.json`, `e2e/api.spec.ts`
- Test: `apps/api/tests/http/createHttpApp.test.ts` if it exists, else the int test below

- [ ] **Step 1: Write the failing tests.** In `apps/api/tests/http/openapi.int.test.ts`, replace `it('serves the document and the explorer from the running app', …)` with:

```ts
  it.each(['/api/docs', '/api/docs/', '/api/docs/index.html', '/api/openapi.json'])(
    'does not expose API documentation at %s',
    async (path) => {
      const response = await api().get(path);
      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(response.body.type).toBe('/problems/not-found');
    },
  );
```

Keep every other test in that file (route/status conformance against `buildOpenApiDocument()`). In `e2e/api.spec.ts`, replace `test('serves the API explorer and deep links', …)` with:

```ts
  test('does not expose API docs, and deep links fall back to the app', async ({ request }) => {
    for (const path of ['/api/docs/', '/api/openapi.json']) {
      const response = await request.get(path);
      expect(response.status()).toBe(404);
      expect(response.headers()['content-type']).toMatch(/^application\/problem\+json/);
    }
    expect((await request.get('/any/deep/link')).status()).toBe(200);
  });
```

- [ ] **Step 2: Run to verify they fail.** `docker compose --profile dev run --rm dev npx vitest run apps/api/tests/http/openapi.int.test.ts` → FAIL (200 for the docs paths).

- [ ] **Step 3: Remove the docs router.** In `apps/api/src/http/createHttpApp.ts` delete the `createDocsRouter` import, the `buildOpenApiDocument` import (if now unused there), and the `app.use('/api', createDocsRouter(buildOpenApiDocument()));` line. `git rm apps/api/src/http/docsRoutes.ts apps/api/tests/http/docsRoutes.test.ts`. Remove `swagger-ui-express` and `@types/swagger-ui-express` from `apps/api/package.json`; regenerate the lockfile: `docker compose --profile dev run --rm dev npm install --no-audit --no-fund`. Keep `buildOpenApiDocument` (`apps/api/src/http/openapi.ts`) — it still generates `openapi.json` and backs the conformance tests. If `SCARF_ANALYTICS=false` in the Dockerfile was only for `swagger-ui-dist`, leave it (Task 2 still installs `swagger-ui-dist` in the dev dependencies of `packages/diagrams`).

- [ ] **Step 4: Verify.** The int test passes; `docker compose --profile test run --rm --build test` exits 0 with 100% coverage; the e2e command passes (8 journeys, the changed one included); `git grep -n "swagger-ui-express\|createDocsRouter" -- apps` prints nothing.

- [ ] **Step 5: Commit.** `refactor(api): stop serving the API explorer and OpenAPI document` (body: why — development material must not be reachable through the running app; the contract stays in `apps/api/openapi.json`; trailer).

---

### Task 2: Self-contained `docs/api/index.html`, generated and gate-checked

**Files:**
- Create: `packages/diagrams/src/apiDocs.ts`, `packages/diagrams/tests/apiDocs.test.ts`, `docs/api/index.html` (generated)
- Modify: `packages/diagrams/package.json` (devDependency `"swagger-ui-dist": "5.33.0"`), `package-lock.json`, `.prettierignore` (add `docs/api`), `README.md`, `docs/api.md`, `CLAUDE.md`, `docs/decisions/0009-openapi-from-zod.md` (status line), `docs/decisions/README.md`
- Create: `docs/decisions/0016-api-docs-as-a-repository-artifact.md`

**Interfaces:**
- Produces: `export interface SwaggerAssets { css: string; js: string }` and `export function renderApiDocs(document: unknown, assets: SwaggerAssets): string` in `packages/diagrams/src/apiDocs.ts`.

- [ ] **Step 1: Write the failing tests.** `packages/diagrams/tests/apiDocs.test.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderApiDocs } from '../src/apiDocs.js';

const assets = { css: 'body{margin:0}', js: 'window.SwaggerUIBundle=function(){};' };

describe('renderApiDocs', () => {
  it('inlines the stylesheet, the script and the spec, and disables "Try it out"', () => {
    const html = renderApiDocs({ openapi: '3.1.0', info: { title: 'T', version: '1' } }, assets);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>body{margin:0}</style>');
    expect(html).toContain('window.SwaggerUIBundle=function(){};');
    expect(html).toContain('"openapi":"3.1.0"');
    expect(html).toContain('supportedSubmitMethods: []');
    expect(html).toContain('validatorUrl: null');
    expect(html).not.toMatch(/<(script|link)[^>]+(src|href)=/);
  });

  it('cannot be broken out of by </script> in the spec or the script', () => {
    const html = renderApiDocs(
      { info: { description: '</script><script>alert(1)</script>' } },
      { css: '', js: 'var s="</script>";' },
    );
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });
});

describe('this repository', () => {
  it('has docs/api/index.html in sync with apps/api/openapi.json (regenerate with UPDATE_API_DOCS=1)', async () => {
    const root = new URL('../../../', import.meta.url);
    const require = createRequire(import.meta.url);
    const document = JSON.parse(await readFile(new URL('apps/api/openapi.json', root), 'utf8'));
    const html = renderApiDocs(document, {
      css: await readFile(require.resolve('swagger-ui-dist/swagger-ui.css'), 'utf8'),
      js: await readFile(require.resolve('swagger-ui-dist/swagger-ui-bundle.js'), 'utf8'),
    });
    const path = fileURLToPath(new URL('docs/api/index.html', root));
    if (process.env.UPDATE_API_DOCS === '1') await writeFile(path, html);
    expect(await readFile(path, 'utf8')).toBe(html);
  });
});
```

- [ ] **Step 2: Run to verify they fail.** `docker compose --profile dev run --rm dev npx vitest run packages/diagrams/tests/apiDocs.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement.** Add `"devDependencies": { "swagger-ui-dist": "5.33.0" }` to `packages/diagrams/package.json` and run `docker compose --profile dev run --rm dev npm install --no-audit --no-fund`. `packages/diagrams/src/apiDocs.ts`:

```ts
export interface SwaggerAssets {
  css: string;
  js: string;
}

/** `</script` inside inline JSON or JS would end the element early; `<\/script` is equivalent there. */
const closeTag = /<\/script/gi;
const inlineJs = (source: string): string => source.replace(closeTag, '<\\/script');
const inlineJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * One self-contained page: Swagger UI and the OpenAPI document inlined, so it opens from disk
 * with no server and no network. "Try it out" is off — no API stands behind a file — and the
 * online spec validator badge is off, so the page never calls out.
 */
export function renderApiDocs(document: unknown, assets: SwaggerAssets): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FociToDo API reference</title>
<style>${assets.css}</style>
</head>
<body>
<div id="swagger-ui"></div>
<script>${inlineJs(assets.js)}</script>
<script>
window.ui = SwaggerUIBundle({ spec: ${inlineJson(document)}, dom_id: '#swagger-ui', deepLinking: true, supportedSubmitMethods: [], validatorUrl: null });
</script>
</body>
</html>
`;
}
```

Add `docs/api` to `.prettierignore`. Generate: `docker compose --profile dev run --rm -e UPDATE_API_DOCS=1 dev npx vitest run packages/diagrams/tests/apiDocs.test.ts`, then run it again without the variable → PASS.

- [ ] **Step 4: Docs and decision record.**
  - **ADR 0016** `docs/decisions/0016-api-docs-as-a-repository-artifact.md` (same sections as the others): Context — the API explorer and the OpenAPI document were served by the running app to anyone who could reach it; that is development material. Decision — the app serves neither; `apps/api/openapi.json` stays the committed contract; `docs/api/index.html` is a generated, self-contained viewer (spec + Swagger UI inlined, "Try it out" off) checked by the gate. Consequences — positive: nothing documentation-related ships or is reachable in the running app, smaller API dependency tree, the reference opens offline; negative: no in-browser "Try it out" against a running stack (use `curl` or the README smoke test), a ~1.5 MB generated file in the repository. Alternatives — an environment flag (still in the production code path), keeping only the JSON endpoint (the contract still leaks).
  - ADR 0009 status: `Status: Accepted · 2026-09-30 · serving the document and explorer superseded by [0016](./0016-api-docs-as-a-repository-artifact.md)`; ADR index row for 0016.
  - README: remove the `/api/docs` row from the URL table; add "**API reference:** open [`docs/api/index.html`](docs/api/index.html) in a browser (generated from `apps/api/openapi.json`; works offline)"; the "Why OpenAPI?" bullet no longer says "interactive page at /api/docs" — say the reference is a local file.
  - `docs/api.md` intro: replace the explorer URL sentence with the local file and `apps/api/openapi.json`.
  - CLAUDE.md: generated files list adds `docs/api/index.html`; a command line `docker compose --profile dev run --rm -e UPDATE_API_DOCS=1 dev npx vitest run packages/diagrams/tests/apiDocs.test.ts   # regenerate docs/api/index.html after the API contract changes`. Same regenerate note next to the `UPDATE_OPENAPI=1` mention if CLAUDE.md or docs/testing.md has one.
  - `git grep -n "api/docs\|openapi.json" -- README.md docs/*.md docs/decisions AGENTS.md CLAUDE.md` → every remaining hit is accurate.

- [ ] **Step 5: Gate.** `docker compose --profile dev run --rm dev npx prettier --write README.md docs/api.md docs/decisions CLAUDE.md`; `docker compose --profile test run --rm --build test` → exit 0, 100% coverage.

- [ ] **Step 6: Prove it works from disk.** Render the file with Playwright's screenshot CLI (the CLI is downloaded by `npx`; the page itself makes no requests: the spec and viewer are inlined and `validatorUrl: null` disables Swagger UI's online validator badge):

```bash
docker run --rm -v "$PWD":/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble \
  npx -y playwright@1.63.0 screenshot --wait-for-timeout=3000 file:///w/docs/api/index.html /w/api-docs-check.png
```

Read the PNG: the page shows "FociToDo API" with the endpoint list, and expanding an operation shows no "Try it out" button. Delete the PNG; record what you saw in the report.

- [ ] **Step 7: Commit.** `docs(api): generate a self-contained API reference instead of serving it` (trailer).

---

### Finish: pull request

- [ ] Curate, push `refactor/api-docs-local`, open the PR (`refactor: API docs as a local artifact, not an endpoint`; body: summary, spec link, evidence — gate, e2e, 404 checks, offline screenshot; ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), wait for CI; merge only after reviews are clean.
