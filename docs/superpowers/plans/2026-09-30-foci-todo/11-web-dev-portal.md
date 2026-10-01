# PR 11 — In-App Developer Portal

> Read `00-index.md` first. Branch: `feat/web-dev-portal`.

**Delivers:** a lazily loaded `/dev` section of the web app that renders the repository's README, guides and ADRs (bundled from the repo at build time — one source, no copies) with real Mermaid diagrams, rewrites links between documents into portal tabs, links to the API explorer and shows build information. A **Developer** link appears in the app header.

**Spec sections:** §7.4, FR-10, ADR 0011. Spec amendment A7: the Overview tab renders the whole README.

---

### Task 1: Document library, links and routes

**Files:**
- Create: `apps/web/src/dev/links.ts`, `apps/web/src/dev/routes.ts`, `apps/web/src/dev/docs.ts`, `apps/web/src/dev/useHash.ts`
- Test: `apps/web/tests/dev/links.test.ts`, `apps/web/tests/dev/routes.test.ts`, `apps/web/tests/dev/docs.test.ts`, `apps/web/tests/dev/useHash.test.tsx`

**Interfaces:**
- Produces:
  - `REPO_URL = 'https://github.com/charlesmalo/FociToDo/blob/main/'`, `isExternalOrAppLink(href: string): boolean`, `resolveRepoPath(fromPath: string, relative: string): string`, `linkTarget(fromPath: string, href: string | undefined): string`
  - `TABS` (`{ id, label, path }[]` for overview, architecture, api, concurrency, testing, decisions), `type TabId`, `DECISIONS_INDEX = 'docs/decisions/README.md'`, `interface Route { tab: TabId; path: string }`, `routeFromHash(hash: string): Route`
  - `interface DocPage { path: string; markdown: string }`, `interface DocLibrary { get(path: string): DocPage | undefined; assetUrl(fromPath: string, src: string | undefined): string | undefined }`, `createDocLibrary(markdownFiles, assetFiles): DocLibrary`, `docLibrary` (the bundled repository docs)
  - `useHash(): string` (re-renders on `hashchange`)

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/dev/links.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { REPO_URL, isExternalOrAppLink, linkTarget, resolveRepoPath } from '../../src/dev/links';

describe('resolveRepoPath', () => {
  it('resolves relative paths against the current document', () => {
    expect(resolveRepoPath('docs/api.md', './concurrency.md')).toBe('docs/concurrency.md');
    expect(resolveRepoPath('docs/decisions/README.md', '../testing.md')).toBe('docs/testing.md');
    expect(resolveRepoPath('README.md', 'docs/images/screenshot.png')).toBe('docs/images/screenshot.png');
  });
});

describe('isExternalOrAppLink', () => {
  it.each(['https://x.dev', 'mailto:a@b.c', '/api/docs', '#api'])('treats %s as final', (href) => {
    expect(isExternalOrAppLink(href)).toBe(true);
  });

  it('treats repository-relative paths as rewritable', () => {
    expect(isExternalOrAppLink('docs/api.md')).toBe(false);
  });
});

describe('linkTarget', () => {
  it('maps documents with a tab to the tab', () => {
    expect(linkTarget('README.md', 'docs/architecture.md')).toBe('#architecture');
    expect(linkTarget('docs/api.md', '../README.md')).toBe('#overview');
    expect(linkTarget('docs/testing.md', './concurrency.md#lost-update')).toBe('#concurrency');
  });

  it('maps ADRs to decision routes', () => {
    expect(linkTarget('docs/decisions/README.md', './0004-optimistic-locking-with-etags.md')).toBe(
      '#decisions/0004-optimistic-locking-with-etags',
    );
  });

  it('sends other repository files to GitHub', () => {
    expect(linkTarget('README.md', 'CLAUDE.md')).toBe(`${REPO_URL}CLAUDE.md`);
  });

  it('keeps external and app links', () => {
    expect(linkTarget('README.md', 'https://example.com')).toBe('https://example.com');
    expect(linkTarget('docs/api.md', '/api/docs')).toBe('/api/docs');
  });

  it('neutralises missing links', () => {
    expect(linkTarget('README.md', undefined)).toBe('#');
    expect(linkTarget('README.md', '')).toBe('#');
  });
});
```

`apps/web/tests/dev/routes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DECISIONS_INDEX, TABS, routeFromHash } from '../../src/dev/routes';

describe('routeFromHash', () => {
  it('defaults to the overview', () => {
    expect(routeFromHash('')).toEqual({ tab: 'overview', path: 'README.md' });
    expect(routeFromHash('#nonsense')).toEqual({ tab: 'overview', path: 'README.md' });
  });

  it.each(TABS.map((tab) => [tab.id, tab.path]))('selects the %s tab', (id, path) => {
    expect(routeFromHash(`#${id}`)).toEqual({ tab: id, path });
  });

  it('opens a single decision record', () => {
    expect(routeFromHash('#decisions/0004-optimistic-locking-with-etags')).toEqual({
      tab: 'decisions',
      path: 'docs/decisions/0004-optimistic-locking-with-etags.md',
    });
  });

  it('decodes the hash', () => {
    expect(routeFromHash('#%61pi')).toEqual({ tab: 'api', path: 'docs/api.md' });
  });

  it('falls back to the overview for a malformed hash', () => {
    expect(routeFromHash('#%E0%A4%A')).toEqual({ tab: 'overview', path: 'README.md' });
  });

  it('points the decisions tab at the index', () => {
    expect(routeFromHash('#decisions').path).toBe(DECISIONS_INDEX);
  });
});
```

`apps/web/tests/dev/docs.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createDocLibrary, docLibrary } from '../../src/dev/docs';
import { TABS } from '../../src/dev/routes';

const library = createDocLibrary(
  { '../../../../README.md': '# Readme', '../../../../docs/api.md': '# API' },
  { '../../../../docs/images/shot.png': '/assets/shot-abc123.png' },
);

describe('createDocLibrary', () => {
  it('indexes pages by repository path', () => {
    expect(library.get('README.md')).toEqual({ path: 'README.md', markdown: '# Readme' });
    expect(library.get('docs/api.md')?.markdown).toBe('# API');
    expect(library.get('docs/missing.md')).toBeUndefined();
  });

  it('resolves bundled assets relative to the page', () => {
    expect(library.assetUrl('README.md', 'docs/images/shot.png')).toBe('/assets/shot-abc123.png');
  });

  it('leaves unknown, absolute and missing sources alone', () => {
    expect(library.assetUrl('README.md', 'docs/images/other.png')).toBe('docs/images/other.png');
    expect(library.assetUrl('README.md', 'https://img.shields.io/x.svg')).toBe('https://img.shields.io/x.svg');
    expect(library.assetUrl('README.md', undefined)).toBeUndefined();
  });
});

describe('docLibrary (the real repository docs)', () => {
  it('contains every document a tab points to', () => {
    for (const tab of TABS) expect(docLibrary.get(tab.path), tab.path).toBeDefined();
  });

  it('contains every ADR listed in the decisions index', () => {
    const index = docLibrary.get('docs/decisions/README.md')?.markdown ?? '';
    const listed = [...index.matchAll(/\(\.\/(\d{4}-[\w-]+\.md)\)/g)].map((match) => match[1]);
    expect(listed.length).toBeGreaterThanOrEqual(14);
    for (const file of listed) expect(docLibrary.get(`docs/decisions/${file}`), file).toBeDefined();
  });

  it('bundles the README screenshot', () => {
    expect(docLibrary.assetUrl('README.md', 'docs/images/screenshot.png')).not.toBe(
      'docs/images/screenshot.png',
    );
  });
});
```

`apps/web/tests/dev/useHash.test.tsx`:
```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useHash } from '../../src/dev/useHash';

describe('useHash', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('tracks hash changes', () => {
    window.location.hash = '#api';
    const { result, unmount } = renderHook(() => useHash());
    expect(result.current).toBe('#api');
    act(() => {
      window.location.hash = '#testing';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toBe('#testing');
    unmount();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dev npx vitest run apps/web/tests/dev`
Expected: FAIL — modules under `src/dev` not found.

- [ ] **Step 3: Implement**

`apps/web/src/dev/links.ts`:
```ts
import { TABS } from './routes';

export const REPO_URL = 'https://github.com/charlesmalo/FociToDo/blob/main/';

/** URLs with a scheme, app paths and in-page anchors are used as-is. */
export function isExternalOrAppLink(href: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('/') || href.startsWith('#');
}

/** Resolves `relative` the way GitHub does: against the folder of the current document. */
export function resolveRepoPath(fromPath: string, relative: string): string {
  return new URL(relative, `https://repo.invalid/${fromPath}`).pathname.slice(1);
}

/** Where a Markdown link should point inside the portal. */
export function linkTarget(fromPath: string, href: string | undefined): string {
  if (href === undefined || href === '') return '#';
  if (isExternalOrAppLink(href)) return href;
  const path = resolveRepoPath(fromPath, href.split('#')[0] as string);
  const tab = TABS.find((candidate) => candidate.path === path);
  if (tab !== undefined) return `#${tab.id}`;
  const decision = /^docs\/decisions\/(\d{4}-[\w-]+)\.md$/.exec(path);
  if (decision !== null) return `#decisions/${decision[1] as string}`;
  return `${REPO_URL}${path}`;
}
```

`apps/web/src/dev/routes.ts`:
```ts
export const DECISIONS_INDEX = 'docs/decisions/README.md';

export const TABS = [
  { id: 'overview', label: 'Overview', path: 'README.md' },
  { id: 'architecture', label: 'Architecture', path: 'docs/architecture.md' },
  { id: 'api', label: 'API', path: 'docs/api.md' },
  { id: 'concurrency', label: 'Concurrency', path: 'docs/concurrency.md' },
  { id: 'testing', label: 'Testing', path: 'docs/testing.md' },
  { id: 'decisions', label: 'Decisions', path: DECISIONS_INDEX },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export interface Route {
  tab: TabId;
  path: string;
}

function decodeHash(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return ''; // malformed percent-encoding: treat as no route
  }
}

/** `#api` → API tab; `#decisions/0004-…` → one ADR; anything else → Overview. */
export function routeFromHash(hash: string): Route {
  const value = decodeHash(hash);
  const decision = /^decisions\/(\d{4}-[\w-]+)$/.exec(value);
  if (decision !== null) {
    return { tab: 'decisions', path: `docs/decisions/${decision[1] as string}.md` };
  }
  const tab = TABS.find((candidate) => candidate.id === value) ?? TABS[0];
  return { tab: tab.id, path: tab.path };
}
```

`apps/web/src/dev/docs.ts`:
```ts
import { isExternalOrAppLink, resolveRepoPath } from './links';

export interface DocPage {
  path: string;
  markdown: string;
}

export interface DocLibrary {
  get(path: string): DocPage | undefined;
  /** Bundled URL for an image referenced from a document, or the original source. */
  assetUrl(fromPath: string, src: string | undefined): string | undefined;
}

/** Glob keys look like `../../../../docs/api.md`; the library uses repository paths. */
const toRepoPath = (globKey: string): string => globKey.replace(/^(\.\.\/)+/, '');

export function createDocLibrary(
  markdownFiles: Record<string, string>,
  assetFiles: Record<string, string>,
): DocLibrary {
  const pages = new Map(Object.entries(markdownFiles).map(([key, text]) => [toRepoPath(key), text]));
  const assets = new Map(Object.entries(assetFiles).map(([key, url]) => [toRepoPath(key), url]));
  return {
    get: (path) => {
      const markdown = pages.get(path);
      return markdown === undefined ? undefined : { path, markdown };
    },
    assetUrl: (fromPath, src) => {
      if (src === undefined || isExternalOrAppLink(src)) return src;
      return assets.get(resolveRepoPath(fromPath, src)) ?? src;
    },
  };
}

/** The repository's own documents, bundled at build time — the portal never holds a copy. */
export const docLibrary = createDocLibrary(
  import.meta.glob<string>(
    ['../../../../README.md', '../../../../docs/*.md', '../../../../docs/decisions/*.md'],
    { query: '?raw', import: 'default', eager: true },
  ),
  import.meta.glob<string>('../../../../docs/images/*', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);
```

`apps/web/src/dev/useHash.ts`:
```ts
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dev npx vitest run apps/web/tests/dev`
Expected: PASS (the real-library tests rely on PR 10's docs and screenshot).

- [ ] **Step 5: Format and commit (gate after Task 2)**

Run: `dev npx prettier --write apps/web` and `dev npm run lint`.
```bash
git add apps/web
git commit -F - <<'EOF'
feat(web): add the developer-portal document library and routing

Bundles README, guides, ADRs and images from the repository at build
time and maps relative Markdown links to portal tabs, ADR routes or
GitHub.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Rendering (Markdown + Mermaid), portal page and app routing

**Files:**
- Create: `apps/web/src/dev/mermaid.ts`, `MermaidBlock.tsx`, `DocView.tsx`, `DevPortal.tsx`, `DevPortal.module.css` (under `apps/web/src/dev/`), `apps/web/src/vite-env.d.ts`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/todos/components/TodoPage.tsx`, `apps/web/vite.config.ts`, `vitest.config.ts` (web `define`), `Dockerfile` (build args), `compose.yaml` (web build args), `README.md` (portal row)
- Test: `apps/web/tests/dev/mermaid.test.ts`, `MermaidBlock.test.tsx`, `DocView.test.tsx`, `DevPortal.test.tsx` (under `apps/web/tests/dev/`), `apps/web/tests/App.test.tsx`, `apps/web/tests/todos/components/TodoPage.test.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces: `renderMermaid(id: string, code: string): Promise<string>`; `MermaidBlock({ code, render? })`; `DocView({ page, library })`; `DevPortal({ library? })`; `isDevPath(pathname: string): boolean`; `App({ client, queryClient, pathname? })`; build constants `__APP_VERSION__`, `__GIT_SHA__`, `__BUILD_DATE__`.

- [ ] **Step 1: Add dependencies and build constants**

Run: `dev npm install -w @foci/web react-markdown@^10.1.0 remark-gfm@^4.0.1 mermaid@^12.0.0`

`apps/web/src/vite-env.d.ts`:
```ts
// Build constants injected by Vite `define` (vite.config.ts / vitest.config.ts).
declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;
declare const __BUILD_DATE__: string;
```

In `apps/web/vite.config.ts`, add to the config object:
```ts
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? 'dev'),
    __GIT_SHA__: JSON.stringify(process.env.GIT_SHA ?? 'local'),
    __BUILD_DATE__: JSON.stringify(process.env.BUILD_DATE ?? 'unknown'),
  },
```

In `vitest.config.ts`, inside the `web` project object (next to `plugins`), add:
```ts
        define: {
          __APP_VERSION__: JSON.stringify('1.2.3'),
          __GIT_SHA__: JSON.stringify('abcdef0123456789'),
          __BUILD_DATE__: JSON.stringify('2026-10-01'),
        },
```

- [ ] **Step 2: Write the failing tests**

`apps/web/tests/dev/mermaid.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above imports and consts, so the mocks must be created with vi.hoisted.
const { initialize, render } = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (id: string) => ({ svg: `<svg id="${id}"></svg>` })),
}));
vi.mock('mermaid', () => ({ default: { initialize, render } }));

describe('renderMermaid', () => {
  it('initialises mermaid once (strict, neutral) and returns the SVG', async () => {
    const { renderMermaid } = await import('../../src/dev/mermaid');
    await expect(renderMermaid('m1', 'flowchart LR\nA-->B')).resolves.toBe('<svg id="m1"></svg>');
    await renderMermaid('m2', 'flowchart LR\nB-->C');
    expect(initialize).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'strict',
    });
    expect(render).toHaveBeenCalledWith('m2', 'flowchart LR\nB-->C');
  });
});
```

`apps/web/tests/dev/MermaidBlock.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MermaidBlock } from '../../src/dev/MermaidBlock';

describe('MermaidBlock', () => {
  it('shows progress, then the rendered diagram', async () => {
    const renderDiagram = vi.fn(async () => '<svg data-testid="svg"></svg>');
    render(<MermaidBlock code="flowchart LR" render={renderDiagram} />);
    expect(screen.getByRole('status')).toHaveTextContent('Rendering diagram…');
    expect(await screen.findByRole('img', { name: 'Diagram' })).toContainElement(
      screen.getByTestId('svg'),
    );
    expect(renderDiagram).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-\d+$/), 'flowchart LR');
  });

  it('falls back to the source when rendering fails', async () => {
    render(<MermaidBlock code="not a diagram" render={async () => Promise.reject(new Error('x'))} />);
    expect(await screen.findByText('not a diagram')).toBeInTheDocument();
  });

  it('ignores results that arrive after unmount', async () => {
    let resolve: (svg: string) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const first = render(
      <MermaidBlock code="a" render={() => new Promise<string>((r) => (resolve = r))} />,
    );
    const second = render(
      <MermaidBlock code="b" render={() => new Promise<string>((_r, j) => (reject = j))} />,
    );
    first.unmount();
    second.unmount();
    resolve('<svg></svg>');
    reject(new Error('late'));
    await Promise.resolve();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
```

`apps/web/tests/dev/DocView.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDocLibrary } from '../../src/dev/docs';
import { DocView } from '../../src/dev/DocView';
import { REPO_URL } from '../../src/dev/links';

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg data-testid="diagram"></svg>' })) },
}));

const markdown = `# Guide

| A | B |
|---|---|
| 1 | 2 |

See [API](./api.md), [ADR](./decisions/0004-optimistic-locking-with-etags.md), [rules](../CLAUDE.md), [explorer](/api/docs) and [RFC](https://www.rfc-editor.org/rfc/rfc9457).

![Shot](./images/shot.png)

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

\`\`\`bash
docker compose up
\`\`\`

Inline \`code\`.
`;

const library = createDocLibrary({}, { '../../../../docs/images/shot.png': '/assets/shot.png' });

describe('DocView', () => {
  it('renders GitHub-flavoured Markdown with rewritten links, bundled images and diagrams', async () => {
    render(<DocView page={{ path: 'docs/architecture.md', markdown }} library={library} />);
    expect(screen.getByRole('heading', { name: 'Guide' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'API' })).toHaveAttribute('href', '#api');
    expect(screen.getByRole('link', { name: 'ADR' })).toHaveAttribute(
      'href',
      '#decisions/0004-optimistic-locking-with-etags',
    );
    const rules = screen.getByRole('link', { name: 'rules' });
    expect(rules).toHaveAttribute('href', `${REPO_URL}CLAUDE.md`);
    expect(rules).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'explorer' })).toHaveAttribute('href', '/api/docs');
    expect(screen.getByRole('link', { name: 'explorer' })).not.toHaveAttribute('target');
    expect(screen.getByRole('img', { name: 'Shot' })).toHaveAttribute('src', '/assets/shot.png');
    expect(await screen.findByTestId('diagram')).toBeInTheDocument();
    expect(screen.getByText('docker compose up')).toBeInTheDocument();
    expect(screen.getByText('code').tagName).toBe('CODE');
  });
});
```

`apps/web/tests/dev/DevPortal.test.tsx`:
```tsx
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevPortal } from '../../src/dev/DevPortal';
import { createDocLibrary } from '../../src/dev/docs';

const library = createDocLibrary(
  {
    '../../../../README.md': '# Overview doc',
    '../../../../docs/api.md': '# API doc',
    '../../../../docs/decisions/README.md': '# Decisions index',
    '../../../../docs/decisions/0004-optimistic-locking-with-etags.md': '# 0004 Optimistic locking',
  },
  {},
);

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg></svg>' })) },
}));

function navigate(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('DevPortal', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('shows the overview, build info and a way back to the app', () => {
    render(<DevPortal library={library} />);
    expect(screen.getByRole('heading', { name: 'Overview doc' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Back to app' })).toHaveAttribute('href', '/');
    expect(screen.getByText('v1.2.3 · commit abcdef0 · built 2026-10-01')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

  it('switches tabs from the hash and links the API explorer', () => {
    render(<DevPortal library={library} />);
    navigate('#api');
    expect(screen.getByRole('heading', { name: 'API doc' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'API' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
    const explorer = screen.getByRole('link', { name: 'API explorer →' });
    expect(explorer).toHaveAttribute('href', '/api/docs');
    expect(explorer).toHaveAttribute('target', '_blank');
  });

  it('shows one decision with a link back to the index', () => {
    render(<DevPortal library={library} />);
    navigate('#decisions');
    expect(screen.getByRole('heading', { name: 'Decisions index' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '← All decisions' })).not.toBeInTheDocument();
    navigate('#decisions/0004-optimistic-locking-with-etags');
    expect(screen.getByRole('heading', { name: '0004 Optimistic locking' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← All decisions' })).toHaveAttribute('href', '#decisions');
  });

  it('reports a missing document', () => {
    render(<DevPortal library={library} />);
    navigate('#testing');
    expect(screen.getByRole('alert')).toHaveTextContent('Document not found.');
  });

  it('uses the bundled repository docs by default', () => {
    render(<DevPortal />);
    expect(screen.getByRole('heading', { level: 1, name: 'Developer portal' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'FociToDo' }).length).toBeGreaterThan(0);
  });
});
```

Replace `apps/web/tests/App.test.tsx` with:
```tsx
import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App, isDevPath } from '../src/App';
import { fakeClient } from './support/fixtures';

vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg></svg>' })) } }));

describe('isDevPath', () => {
  it.each([
    ['/dev', true],
    ['/dev/', true],
    ['/dev/anything', true],
    ['/', false],
    ['/developer', false],
  ])('%s → %s', (pathname, expected) => {
    expect(isDevPath(pathname)).toBe(expected);
  });
});

describe('App', () => {
  it('renders the todo page with its providers', async () => {
    const client = fakeClient({ list: vi.fn(async () => []) });
    render(<App client={client} queryClient={new QueryClient()} pathname="/" />);
    expect(screen.getByRole('heading', { name: 'FociToDo' })).toBeInTheDocument();
    expect(await screen.findByText('No tasks yet. Add your first one.')).toBeInTheDocument();
  });

  it('lazy-loads the developer portal on /dev', async () => {
    render(<App client={fakeClient()} queryClient={new QueryClient()} pathname="/dev" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading developer portal…');
    expect(await screen.findByRole('heading', { name: 'Developer portal' })).toBeInTheDocument();
  });

  it('reads the current location by default', () => {
    const client = fakeClient({ list: vi.fn(async () => []) });
    render(<App client={client} queryClient={new QueryClient()} />);
    expect(screen.getByRole('heading', { name: 'FociToDo' })).toBeInTheDocument();
  });
});
```

Append to the first test in `apps/web/tests/todos/components/TodoPage.test.tsx` (after rendering):
```tsx
    expect(screen.getByRole('link', { name: 'Developer' })).toHaveAttribute('href', '/dev');
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `dev npx vitest run apps/web/tests`
Expected: FAIL — `mermaid.ts`, `MermaidBlock`, `DocView`, `DevPortal`, `isDevPath` missing; Developer link missing.

- [ ] **Step 4: Implement**

`apps/web/src/dev/mermaid.ts`:
```ts
let initialised = false;

/** Loads mermaid on demand (it stays out of the todo bundle) and renders one diagram to SVG. */
export async function renderMermaid(id: string, code: string): Promise<string> {
  const { default: mermaid } = await import('mermaid');
  if (!initialised) {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
    initialised = true;
  }
  const { svg } = await mermaid.render(id, code);
  return svg;
}
```

`apps/web/src/dev/MermaidBlock.tsx`:
```tsx
import { useEffect, useState } from 'react';
import styles from './DevPortal.module.css';
import { renderMermaid } from './mermaid';

let sequence = 0;

interface MermaidBlockProps {
  code: string;
  render?: (id: string, code: string) => Promise<string>;
}

export function MermaidBlock({ code, render = renderMermaid }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    sequence += 1;
    render(`mermaid-${sequence}`, code).then(
      (result) => {
        if (active) setSvg(result);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [code, render]);

  if (failed) return <code>{code}</code>;
  if (svg === null) return <span role="status">Rendering diagram…</span>;
  // Mermaid output for our own docs, rendered with securityLevel "strict" (sanitised SVG).
  return (
    <span
      role="img"
      aria-label="Diagram"
      className={styles.diagram}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
```

`apps/web/src/dev/DocView.tsx`:
```tsx
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './DevPortal.module.css';
import type { DocLibrary, DocPage } from './docs';
import { linkTarget } from './links';
import { MermaidBlock } from './MermaidBlock';

interface DocViewProps {
  page: DocPage;
  library: DocLibrary;
}

export function DocView({ page, library }: DocViewProps) {
  const components: Components = {
    a: ({ href, children }) => {
      const target = linkTarget(page.path, href);
      return /^https?:/.test(target) ? (
        <a href={target} target="_blank" rel="noreferrer">
          {children}
        </a>
      ) : (
        <a href={target}>{children}</a>
      );
    },
    img: ({ src, alt }) => (
      <img src={library.assetUrl(page.path, src as string | undefined)} alt={alt} />
    ),
    code: ({ className, children }) =>
      className === 'language-mermaid' ? (
        <MermaidBlock code={String(children).trimEnd()} />
      ) : (
        <code className={className}>{children}</code>
      ),
  };

  return (
    <article className={styles.doc}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {page.markdown}
      </ReactMarkdown>
    </article>
  );
}
```

`apps/web/src/dev/DevPortal.module.css`:
```css
.portal {
  max-width: 64rem;
  margin: 0 auto;
  padding: var(--space-4);
}

.header {
  display: grid;
  gap: var(--space-1);
}

.header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.build {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.875rem;
}

.nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-block: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}

.nav a[aria-current='page'] {
  font-weight: 600;
  text-decoration: none;
}

.callout {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  background: var(--color-surface);
}

.doc {
  overflow-wrap: anywhere;
}

.doc table {
  border-collapse: collapse;
}

.doc th,
.doc td {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
}

.doc pre {
  overflow-x: auto;
  padding: var(--space-3);
  border-radius: var(--radius);
  background: var(--color-surface);
}

.doc img {
  max-width: 100%;
}

.diagram {
  display: block;
  overflow-x: auto;
}
```

`apps/web/src/dev/DevPortal.tsx`:
```tsx
import styles from './DevPortal.module.css';
import { docLibrary, type DocLibrary } from './docs';
import { DocView } from './DocView';
import { DECISIONS_INDEX, TABS, routeFromHash } from './routes';
import { useHash } from './useHash';

const BUILD = `v${__APP_VERSION__} · commit ${__GIT_SHA__.slice(0, 7)} · built ${__BUILD_DATE__}`;

export function DevPortal({ library = docLibrary }: { library?: DocLibrary }) {
  const route = routeFromHash(useHash());
  const page = library.get(route.path);

  return (
    <div className={styles.portal}>
      <header className={styles.header}>
        <a href="/">← Back to app</a>
        <h1>Developer portal</h1>
        <p className={styles.build}>{BUILD}</p>
      </header>
      <nav aria-label="Documentation" className={styles.nav}>
        {TABS.map((tab) => (
          <a
            key={tab.id}
            href={`#${tab.id}`}
            aria-current={route.tab === tab.id ? 'page' : undefined}
          >
            {tab.label}
          </a>
        ))}
      </nav>
      <main>
        {route.tab === 'api' && (
          <p className={styles.callout}>
            Try every endpoint in the{' '}
            <a href="/api/docs" target="_blank" rel="noreferrer">
              API explorer →
            </a>
          </p>
        )}
        {route.tab === 'decisions' && route.path !== DECISIONS_INDEX && (
          <p>
            <a href="#decisions">← All decisions</a>
          </p>
        )}
        {page === undefined ? (
          <p role="alert">Document not found.</p>
        ) : (
          <DocView page={page} library={library} />
        )}
      </main>
    </div>
  );
}
```

Replace `apps/web/src/App.tsx` with:
```tsx
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { TodoClientProvider } from './api/TodoClientContext';
import type { TodoClient } from './api/todoClient';
import { TodoPage } from './todos/components/TodoPage';

// Separate chunk: the portal (and mermaid) download only when /dev is opened.
const DevPortal = lazy(() => import('./dev/DevPortal').then((module) => ({ default: module.DevPortal })));

export function isDevPath(pathname: string): boolean {
  return pathname === '/dev' || pathname.startsWith('/dev/');
}

interface AppProps {
  client: TodoClient;
  queryClient: QueryClient;
  pathname?: string;
}

export function App({ client, queryClient, pathname = window.location.pathname }: AppProps) {
  if (isDevPath(pathname)) {
    return (
      <Suspense fallback={<p role="status">Loading developer portal…</p>}>
        <DevPortal />
      </Suspense>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider client={client}>
        <TodoPage />
      </TodoClientProvider>
    </QueryClientProvider>
  );
}
```

In `apps/web/src/todos/components/TodoPage.tsx`, replace the header's button with a nav containing the button and the link:
```tsx
        <nav className={styles.actions}>
          <button type="button" onClick={() => setDialog({ mode: 'create' })}>
            + New task
          </button>
          <a href="/dev">Developer</a>
        </nav>
```
and add to `TodoPage.module.css`:
```css
.actions {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dev npx vitest run --project web`
Expected: PASS.

- [ ] **Step 6: Pass build information into the web image**

In `Dockerfile`, replace the `build-web` stage with:
```dockerfile
FROM source AS build-web
ARG APP_VERSION=1.0.0
ARG GIT_SHA=local
ARG BUILD_DATE=unknown
ENV APP_VERSION=$APP_VERSION GIT_SHA=$GIT_SHA BUILD_DATE=$BUILD_DATE
RUN npm run build -w @foci/web
```

In `compose.yaml`, extend the `web` service's `build`:
```yaml
    build:
      context: .
      target: web
      args:
        GIT_SHA: ${GIT_SHA:-local}
        BUILD_DATE: ${BUILD_DATE:-unknown}
```

In `.github/workflows/ci.yml`, add to the `images` and `e2e` jobs:
```yaml
    env:
      GIT_SHA: ${{ github.sha }}
```

In `README.md`, add a row to the Quick start URL table:
```markdown
| http://localhost:8080/dev | Developer portal: rendered docs, diagrams and decision records |
```

- [ ] **Step 7: Verify in the running app**

Run:
```bash
GIT_SHA=$(git rev-parse HEAD) BUILD_DATE=$(date -u +%Y-%m-%d) docker compose up --build -d
until curl -sf http://localhost:8080/api/health >/dev/null; do sleep 1; done
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/dev
```
Expected: `200`. Open http://localhost:8080/dev: the Overview renders the README with its screenshot; the Architecture, API and Concurrency tabs show rendered diagrams (not code); ADR links in Decisions open single records; "← Back to app" returns to the todo page; the header shows the commit. In the browser's network panel, the mermaid chunk loads only after opening `/dev`. Then `docker compose down`.

- [ ] **Step 8: Add a portal journey to e2e**

Append to `e2e/todos.spec.ts`:
```ts
test('the developer portal renders the docs with diagrams', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Developer' }).click();
  await expect(page.getByRole('heading', { name: 'Developer portal' })).toBeVisible();
  await page.getByRole('link', { name: 'Concurrency' }).click();
  await expect(page.getByRole('img', { name: 'Diagram' }).first()).toBeVisible();
  await page.getByRole('link', { name: '← Back to app' }).click();
  await expect(page.getByRole('heading', { name: 'FociToDo' })).toBeVisible();
});
```
Run the e2e command from PR 9 Task 1 Step 5; expect 9 passing tests.

- [ ] **Step 9: Format, gate, commit**

Run: `dev npx prettier --write apps/web e2e README.md` then `docker compose --profile test run --rm --build test` (100%).
```bash
git add apps/web e2e vitest.config.ts Dockerfile compose.yaml .github/workflows/ci.yml README.md package.json package-lock.json
git commit -F - <<'EOF'
feat(web): add the /dev developer portal with rendered diagrams

A lazily loaded section that renders the README, guides and ADRs with
GitHub-flavoured Markdown and Mermaid, maps document links to tabs,
links the API explorer and shows build information.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Then follow the per-PR procedure. PR title: `feat(web): in-app developer portal`.
