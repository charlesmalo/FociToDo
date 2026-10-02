# Diagram images and README map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Mermaid diagram in `README.md` and `docs/*.md` has a committed SVG image shown above its collapsed source, the README maps every diagram to its image and source, and the test gate fails when any of that drifts.

**Architecture:** A new zero-dependency workspace package `packages/diagrams` (`@foci/diagrams`) holds pure, unit-tested logic: extract diagrams from Markdown, derive ids/anchors/alt text, build and compare a manifest, and check document layout and the README map against a `Repo` abstraction. A thin entry point (`bin.ts`, coverage-excluded like `server.ts`) runs inside a Docker image built `FROM minlag/mermaid-cli:12.0.0` and renders each diagram with `mmdc`. A test in the existing gate runs the checker over the real repository.

**Tech Stack:** TypeScript 6 (NodeNext, strict), Vitest, Node `node:` built-ins only, Mermaid CLI 12.0.0 (official Docker image), Docker Compose, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-10-02-docs-diagrams-design.md](../../specs/2026-10-02-docs-diagrams-design.md) §2, §4 — read with [00-index.md](00-index.md) (global constraints).

Branch: `docs/diagram-images`, from `main` after PR 1 (`refactor/remove-dev-portal`) has merged.

## Global Constraints

See [00-index.md](00-index.md#global-constraints-all-plans). In addition (spec §2):

- Sources: every ```` ```mermaid ```` fence in `README.md` and the direct children `docs/*.md` (not `docs/decisions/`, not `docs/superpowers/`). Today: 21 diagrams (README 2, architecture 6, api 7, concurrency 3, testing 1).
- Id: `<doc>/<slug>`; `<doc>` = `readme` for `README.md`, else the file name without `.md`; `<slug>` = nearest preceding heading text, lower-cased, every run outside `a-z0-9` → one `-`, leading/trailing `-` removed; repeated slugs in one doc get `-2`, `-3`, …; no heading or empty slug → `diagram`.
- Image path `docs/diagrams/<id>.svg`; manifest `docs/diagrams/manifest.json` (`id`, `file`, `heading`, `image`, `hash` = SHA-256 hex of the source trimmed with `\n` line endings).
- Document shape at every diagram: image line `![<alt>](<path relative to the document>)`, blank, `<details><summary>Mermaid source</summary>`, blank, the fence, blank, `</details>`. Alt = `<heading> (<kind>)`, kind from the first keyword: `sequenceDiagram` → `sequence diagram`, `flowchart`/`graph` → `flowchart`, `stateDiagram`/`stateDiagram-v2` → `state diagram`, `erDiagram` → `entity-relationship diagram`, `classDiagram` → `class diagram`, else `diagram`.
- Fix command (in every failure message): `docker compose --profile docs run --rm --build diagrams`.
- Mermaid CLI image pinned to `minlag/mermaid-cli:12.0.0`; config: `deterministicIds: true`, `deterministicIDSeed: "foci"`, `htmlLabels: false` (top level and `flowchart`), theme `default`, background `white`.
- `docs/diagrams/` is generated: listed in `.prettierignore`, never edited by hand.

## Review Focus

1. A `#` line inside a non-Mermaid code fence (e.g. a bash comment in the README) must not be taken as a heading, and a ```` ```mermaid ```` inside a longer ```` ```` ```` fence must not be taken as a diagram. Pinned in Task 1 (`extract` tests: "ignores headings and mermaid fences inside other code blocks").
2. Two headings with the same text in one document: GitHub anchors the second as `-1`; the README map must link that anchor. Pinned in Task 1 (`extract` test: "numbers repeated heading anchors like GitHub").
3. A Mermaid syntax error must fail the generator with `file:line` and the id, never write a partial manifest. Pinned in Task 3 (`render` test: "names the file, line and id when a diagram fails and writes no manifest").
4. Windows line endings (CRLF) in a document must not change hashes or break layout checks. Pinned in Task 1 (`hashSource` CRLF test) and Task 2 (`checkLayout` CRLF test).
5. A deleted or renamed diagram must leave no orphan image or manifest entry: the generator deletes orphans and the checker reports them. Pinned in Task 2 (`checkImages` orphan tests) and Task 3 (`render` orphan test).

---

### Task 1: `@foci/diagrams` package — slugs, anchors and diagram extraction

**Files:**

- Create: `packages/diagrams/package.json`, `packages/diagrams/tsconfig.json`, `packages/diagrams/tsconfig.build.json`
- Create: `packages/diagrams/src/slug.ts`, `packages/diagrams/src/extract.ts`
- Test: `packages/diagrams/tests/slug.test.ts`, `packages/diagrams/tests/extract.test.ts`, `packages/diagrams/tests/support/single.ts`
- Modify: `vitest.config.ts` (new `diagrams` project), `Dockerfile` (`manifests` stage copies the new manifest), `package-lock.json`

**Interfaces:**

- Produces (`src/slug.ts`): `headingText(line: string): string`, `slugify(text: string): string`, `githubSlug(text: string): string`
- Produces (`src/extract.ts`):
  ```ts
  export interface Diagram {
    id: string; file: string; line: number; endLine: number;
    heading: string; anchor: string; source: string; hash: string;
  }
  export function docName(file: string): string;
  export function normalise(source: string): string;
  export function hashSource(source: string): string;
  export function diagramKind(source: string): string;
  export function altText(diagram: Diagram): string;
  export function extractDiagrams(file: string, markdown: string): Diagram[];
  ```

- [ ] **Step 1: Scaffold the package**

`packages/diagrams/package.json`:

```json
{
  "name": "@foci/diagrams",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json"
  }
}
```

`packages/diagrams/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

`packages/diagrams/tsconfig.build.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": false,
    "types": ["node"]
  },
  "include": ["src"]
}
```

In `vitest.config.ts`, add a project after `shared`:

```ts
      {
        extends: true,
        test: {
          name: 'diagrams',
          environment: 'node',
          include: ['packages/diagrams/tests/**/*.test.ts'],
        },
      },
```

In `Dockerfile`, `manifests` stage, after `COPY packages/shared/package.json packages/shared/` add:

```dockerfile
COPY packages/diagrams/package.json packages/diagrams/
```

Register the workspace in the lockfile:

```bash
docker compose --profile dev run --rm dev npm install --no-audit --no-fund
```

Expected: `package-lock.json` gains a `packages/diagrams` entry and nothing else changes in dependencies.

- [ ] **Step 2: Write the failing tests**

`packages/diagrams/tests/slug.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { githubSlug, headingText, slugify } from '../src/slug.js';

describe('headingText', () => {
  it.each([
    ['## Design overview', 'Design overview'],
    ['### Create — `POST /api/todos`', 'Create — POST /api/todos'],
    ['###### Deep   ', 'Deep'],
  ])('%s → %s', (line, expected) => {
    expect(headingText(line)).toBe(expected);
  });
});

describe('slugify', () => {
  it.each([
    ['Design overview', 'design-overview'],
    ['Create — POST /api/todos', 'create-post-api-todos'],
    ['View — GET /api/todos/{id}', 'view-get-api-todos-id'],
    ['Lost update, prevented', 'lost-update-prevented'],
    ['  --Édition 2--  ', 'dition-2'],
    ['—', ''],
  ])('%s → %s', (text, expected) => {
    expect(slugify(text)).toBe(expected);
  });
});

describe('githubSlug', () => {
  it.each([
    ['Design overview', 'design-overview'],
    ['Create — POST /api/todos', 'create--post-apitodos'],
    ['View — GET /api/todos/{id}', 'view--get-apitodosid'],
    ['Lost update, prevented', 'lost-update-prevented'],
    ['snake_case Édition', 'snake_case-édition'],
  ])('%s → %s', (text, expected) => {
    expect(githubSlug(text)).toBe(expected);
  });
});
```

The repository's lint rules forbid non-null assertions (`!`) in source and tests alike; tests use this helper instead.

`packages/diagrams/tests/support/single.ts`:

```ts
/** The only element of a list; throws (failing the test) unless there is exactly one. */
export function single<T>(items: readonly T[]): T {
  const [item, ...rest] = items;
  if (item === undefined || rest.length > 0) {
    throw new Error(`expected exactly one item, got ${items.length}`);
  }
  return item;
}
```

`packages/diagrams/tests/extract.test.ts`:

````ts
import { describe, expect, it } from 'vitest';
import {
  altText,
  diagramKind,
  docName,
  extractDiagrams,
  hashSource,
  normalise,
} from '../src/extract.js';
import { single } from './support/single.js';

const md = (...lines: string[]): string => lines.join('\n');

describe('docName', () => {
  it.each([
    ['README.md', 'readme'],
    ['docs/api.md', 'api'],
    ['docs/concurrency.md', 'concurrency'],
  ])('%s → %s', (file, expected) => {
    expect(docName(file)).toBe(expected);
  });
});

describe('normalise and hashSource', () => {
  it('trims and converts CRLF so equivalent sources hash the same', () => {
    expect(normalise('\r\n  flowchart LR\r\n  A-->B\r\n')).toBe('flowchart LR\n  A-->B');
    expect(hashSource('flowchart LR\r\n  A-->B\r\n')).toBe(hashSource('flowchart LR\n  A-->B'));
    expect(hashSource('flowchart LR\n  A-->B')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the source changes', () => {
    expect(hashSource('flowchart LR\n  A-->B')).not.toBe(hashSource('flowchart LR\n  A-->C'));
  });
});

describe('diagramKind and altText', () => {
  it.each([
    ['sequenceDiagram\n  A->>B: hi', 'sequence diagram'],
    ['flowchart LR\n  A-->B', 'flowchart'],
    ['graph TD\n  A-->B', 'flowchart'],
    ['stateDiagram-v2\n  [*] --> A', 'state diagram'],
    ['stateDiagram\n  [*] --> A', 'state diagram'],
    ['erDiagram\n  A ||--o{ B : has', 'entity-relationship diagram'],
    ['classDiagram\n  A <|-- B', 'class diagram'],
    ['pie\n  "a": 1', 'diagram'],
  ])('%#: kind of %s', (source, kind) => {
    expect(diagramKind(source)).toBe(kind);
  });

  it('combines heading and kind, or uses the kind alone without a heading', () => {
    const withHeading = single(
      extractDiagrams('docs/x.md', md('## Data model', '```mermaid', 'erDiagram', '```')),
    );
    const withoutHeading = single(extractDiagrams('docs/x.md', md('```mermaid', 'erDiagram', '```')));
    expect(altText(withHeading)).toBe('Data model (entity-relationship diagram)');
    expect(altText(withoutHeading)).toBe('entity-relationship diagram');
  });
});

describe('extractDiagrams', () => {
  it('extracts each mermaid fence with its id, lines, heading, anchor, source and hash', () => {
    const text = md(
      '# API',
      '',
      '### Create — `POST /api/todos`',
      '',
      '```mermaid',
      'sequenceDiagram',
      '  C->>A: POST',
      '```',
    );
    expect(extractDiagrams('docs/api.md', text)).toEqual([
      {
        id: 'api/create-post-api-todos',
        file: 'docs/api.md',
        line: 5,
        endLine: 8,
        heading: 'Create — POST /api/todos',
        anchor: 'create--post-apitodos',
        source: 'sequenceDiagram\n  C->>A: POST',
        hash: hashSource('sequenceDiagram\n  C->>A: POST'),
      },
    ]);
  });

  it('ignores headings and mermaid fences inside other code blocks', () => {
    const text = md(
      '## Real heading',
      '```bash',
      '# not a heading',
      '```',
      '````markdown',
      '```mermaid',
      'flowchart LR',
      '```',
      '````',
      '```mermaid',
      'flowchart LR',
      '```',
    );
    const diagrams = extractDiagrams('README.md', text);
    expect(diagrams.map((d) => [d.id, d.heading, d.line])).toEqual([
      ['readme/real-heading', 'Real heading', 10],
    ]);
  });

  it('suffixes repeated slugs in one document and falls back to "diagram"', () => {
    const text = md(
      '```mermaid',
      'flowchart LR',
      '```',
      '## Flow',
      '```mermaid',
      'flowchart LR',
      '```',
      '```mermaid',
      'flowchart TB',
      '```',
      '## —',
      '```mermaid',
      'flowchart LR',
      '```',
    );
    expect(extractDiagrams('docs/testing.md', text).map((d) => d.id)).toEqual([
      'testing/diagram',
      'testing/flow',
      'testing/flow-2',
      'testing/diagram-2',
    ]);
  });

  it('numbers repeated heading anchors like GitHub', () => {
    const text = md('## Layers', 'text', '## Layers', '```mermaid', 'flowchart LR', '```');
    const diagram = single(extractDiagrams('docs/testing.md', text));
    expect(diagram.anchor).toBe('layers-1');
    expect(diagram.id).toBe('testing/layers');
  });

  it('reads CRLF documents', () => {
    const text = '## Flow\r\n```mermaid\r\nflowchart LR\r\n  A-->B\r\n```\r\n';
    const diagram = single(extractDiagrams('docs/x.md', text));
    expect(diagram.source).toBe('flowchart LR\n  A-->B');
    expect(diagram.endLine).toBe(5);
  });

  it('ignores an unclosed non-mermaid fence but rejects an unclosed mermaid fence', () => {
    expect(extractDiagrams('docs/x.md', md('```bash', 'echo'))).toEqual([]);
    expect(() => extractDiagrams('docs/x.md', md('## A', '```mermaid', 'flowchart LR'))).toThrow(
      'docs/x.md:2: unclosed mermaid fence',
    );
  });
});
````

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose --profile dev run --rm dev npx vitest run --project diagrams`
Expected: FAIL — `Cannot find module '../src/slug.js'` / `'../src/extract.js'`.

- [ ] **Step 4: Implement `slug.ts` and `extract.ts`**

`packages/diagrams/src/slug.ts`:

```ts
/** A Markdown heading's plain text: the `#` marker goes, code spans lose their backticks. */
export function headingText(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/`/g, '')
    .trim();
}

/** File-name slug (spec §2.1): lower case, every run outside a-z0-9 becomes one hyphen. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** GitHub's heading anchor: lower case, punctuation dropped, each space becomes a hyphen. */
export function githubSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}
```

`packages/diagrams/src/extract.ts`:

```ts
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { githubSlug, headingText, slugify } from './slug.js';

/** One ```mermaid fence in a Markdown document. */
export interface Diagram {
  /** `<doc>/<slug>`, e.g. `api/create-post-api-todos`. */
  id: string;
  /** Repository-relative Markdown path, e.g. `docs/api.md`. */
  file: string;
  /** 1-based line of the opening fence. */
  line: number;
  /** 1-based line of the closing fence. */
  endLine: number;
  /** Plain text of the nearest preceding heading ('' when there is none). */
  heading: string;
  /** GitHub anchor of that heading within the document ('' when there is none). */
  anchor: string;
  /** The diagram's Mermaid text, normalised. */
  source: string;
  hash: string;
}

const FENCE_MARKER = /^(?:`{3,}|~{3,})/;
const HEADING = /^#{1,6}\s+\S/;

const KINDS: Readonly<Record<string, string>> = {
  sequenceDiagram: 'sequence diagram',
  flowchart: 'flowchart',
  graph: 'flowchart',
  stateDiagram: 'state diagram',
  'stateDiagram-v2': 'state diagram',
  erDiagram: 'entity-relationship diagram',
  classDiagram: 'class diagram',
};

export function docName(file: string): string {
  return file === 'README.md' ? 'readme' : posix.basename(file, '.md');
}

export function normalise(source: string): string {
  return source.replace(/\r\n/g, '\n').trim();
}

export function hashSource(source: string): string {
  return createHash('sha256').update(normalise(source)).digest('hex');
}

export function diagramKind(source: string): string {
  const keyword = normalise(source).replace(/\s[\s\S]*$/, '');
  return KINDS[keyword] ?? 'diagram';
}

export function altText(diagram: Diagram): string {
  const kind = diagramKind(diagram.source);
  return diagram.heading === '' ? kind : `${diagram.heading} (${kind})`;
}

/** Counts names so repeats get GitHub-style (`-1`) or id-style (`-2`) suffixes. */
function counter(): (name: string) => number {
  const seen = new Map<string, number>();
  return (name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count;
  };
}

function isClosingFence(line: string, marker: string): boolean {
  const text = line.trimEnd();
  return text.length >= marker.length && [...text].every((char) => char === marker[0]);
}

interface OpenFence {
  marker: string;
  mermaid: boolean;
  line: number;
  body: string[];
}

export function extractDiagrams(file: string, markdown: string): Diagram[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const doc = docName(file);
  const anchorRepeat = counter();
  const slugRepeat = counter();
  const diagrams: Diagram[] = [];
  let heading = '';
  let anchor = '';
  let fence: OpenFence | undefined;

  for (const [index, line] of lines.entries()) {
    if (fence !== undefined) {
      if (!isClosingFence(line, fence.marker)) {
        fence.body.push(line);
        continue;
      }
      if (fence.mermaid) {
        const base = slugify(heading) || 'diagram';
        const repeat = slugRepeat(base);
        const source = normalise(fence.body.join('\n'));
        diagrams.push({
          id: `${doc}/${repeat === 0 ? base : `${base}-${repeat + 1}`}`,
          file,
          line: fence.line,
          endLine: index + 1,
          heading,
          anchor,
          source,
          hash: hashSource(source),
        });
      }
      fence = undefined;
      continue;
    }
    const marker = FENCE_MARKER.exec(line)?.[0];
    if (marker !== undefined) {
      const info = line.slice(marker.length).trim();
      fence = { marker, mermaid: info === 'mermaid', line: index + 1, body: [] };
      continue;
    }
    if (HEADING.test(line)) {
      heading = headingText(line);
      const base = githubSlug(heading);
      const repeat = anchorRepeat(base);
      anchor = repeat === 0 ? base : `${base}-${repeat}`;
    }
  }

  if (fence?.mermaid === true) throw new Error(`${file}:${fence.line}: unclosed mermaid fence`);
  return diagrams;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose --profile dev run --rm dev npx vitest run --project diagrams`
Expected: PASS (all `slug` and `extract` tests).

- [ ] **Step 6: Run the full gate**

Run: `docker compose --profile test run --rm --build test`
Expected: exit 0, coverage 100/100/100/100 (the new files are fully covered by Step 2's tests; if a line or branch is reported uncovered, add the missing test case — never a `v8 ignore`).

- [ ] **Step 7: Commit**

```bash
git add packages/diagrams vitest.config.ts Dockerfile package-lock.json
git commit -F - <<'EOF'
feat(diagrams): extract Mermaid diagrams from Markdown with stable ids

New zero-dependency workspace package. Finds every ```mermaid fence
(ignoring headings and fences inside other code blocks), and derives a
stable <doc>/<slug> id, the GitHub anchor of its heading, alt text from the
diagram kind, and a SHA-256 of the normalised source.

Co-Authored-By: Claude <model> <noreply@anthropic.com>
EOF
```

---

### Task 2: Repository checks — manifest, images, layout and README map

**Files:**

- Create: `packages/diagrams/src/paths.ts`, `src/repo.ts`, `src/manifest.ts`, `src/layout.ts`, `src/readmeMap.ts`, `src/check.ts`
- Test: `packages/diagrams/tests/paths.test.ts`, `tests/repo.test.ts`, `tests/manifest.test.ts`, `tests/layout.test.ts`, `tests/readmeMap.test.ts`, `tests/check.test.ts`, `tests/support/memoryRepo.ts`

**Interfaces:**

- Consumes: Task 1 (`Diagram`, `extractDiagrams`, `altText`, `hashSource`).
- Produces:
  ```ts
  // paths.ts
  export const DIAGRAMS_DIR = 'docs/diagrams';
  export const MANIFEST_PATH = 'docs/diagrams/manifest.json';
  export const FIX_COMMAND = 'docker compose --profile docs run --rm --build diagrams';
  export function imagePath(id: string): string;
  export function relativeImagePath(file: string, id: string): string;
  // repo.ts
  export interface Repo { read(path: string): string; exists(path: string): boolean; list(dir: string): string[]; write(path: string, content: string): void; remove(path: string): void; }
  export function fsRepo(root: string): Repo;
  // manifest.ts
  export interface ManifestEntry { id: string; file: string; heading: string; image: string; hash: string }
  export interface Manifest { diagrams: ManifestEntry[] }
  export function buildManifest(diagrams: readonly Diagram[]): Manifest;
  export function serialiseManifest(manifest: Manifest): string;
  export function parseManifest(text: string): Manifest;
  // layout.ts
  export const DETAILS_OPEN = '<details><summary>Mermaid source</summary>';
  export const DETAILS_CLOSE = '</details>';
  export function expectedImageLine(diagram: Diagram): string;
  export function checkLayout(markdown: string, diagrams: readonly Diagram[]): string[];
  // readmeMap.ts
  export function sourceLink(diagram: Diagram): string;
  export function checkReadmeMap(readme: string, diagrams: readonly Diagram[]): string[];
  // check.ts
  export function sourceFiles(repo: Repo): string[];
  export function collectDiagrams(repo: Repo): Diagram[];
  export function duplicateIds(diagrams: readonly Diagram[]): string[];
  export function checkImages(repo: Repo, diagrams: readonly Diagram[]): string[];
  export function checkRepository(repo: Repo): string[];
  ```

- [ ] **Step 1: Write the in-memory test repo**

`packages/diagrams/tests/support/memoryRepo.ts`:

```ts
import type { Repo } from '../../src/repo.js';

/** A Repo over a plain object of path → content, for tests. */
export function memoryRepo(initial: Record<string, string> = {}): Repo & {
  files: Map<string, string>;
} {
  const files = new Map(Object.entries(initial));
  return {
    files,
    read: (path) => {
      const content = files.get(path);
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    exists: (path) => files.has(path),
    list: (dir) => [...files.keys()].filter((path) => path.startsWith(`${dir}/`)).sort(),
    write: (path, content) => {
      files.set(path, content);
    },
    remove: (path) => {
      files.delete(path);
    },
  };
}
```

- [ ] **Step 2: Write the failing tests**

`packages/diagrams/tests/paths.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FIX_COMMAND, imagePath, MANIFEST_PATH, relativeImagePath } from '../src/paths.js';

describe('paths', () => {
  it('places images and the manifest under docs/diagrams', () => {
    expect(imagePath('api/create-post-api-todos')).toBe('docs/diagrams/api/create-post-api-todos.svg');
    expect(MANIFEST_PATH).toBe('docs/diagrams/manifest.json');
    expect(FIX_COMMAND).toBe('docker compose --profile docs run --rm --build diagrams');
  });

  it('links images relative to the document that shows them', () => {
    expect(relativeImagePath('README.md', 'readme/design-overview')).toBe(
      'docs/diagrams/readme/design-overview.svg',
    );
    expect(relativeImagePath('docs/api.md', 'api/list-get-api-todos')).toBe(
      'diagrams/api/list-get-api-todos.svg',
    );
  });
});
```

`packages/diagrams/tests/repo.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fsRepo } from '../src/repo.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('fsRepo', () => {
  it('writes (creating folders), reads, lists recursively in order, and removes files', () => {
    const root = mkdtempSync(join(tmpdir(), 'diagrams-repo-'));
    roots.push(root);
    const repo = fsRepo(root);
    repo.write('docs/diagrams/b/two.svg', '<svg/>');
    repo.write('docs/diagrams/a/one.svg', '<svg/>');
    repo.write('docs/api.md', '# API');
    expect(repo.read('docs/api.md')).toBe('# API');
    expect(repo.exists('docs/api.md')).toBe(true);
    expect(repo.list('docs')).toEqual([
      'docs/api.md',
      'docs/diagrams/a/one.svg',
      'docs/diagrams/b/two.svg',
    ]);
    repo.remove('docs/diagrams/a/one.svg');
    expect(repo.exists('docs/diagrams/a/one.svg')).toBe(false);
    expect(repo.list('missing')).toEqual([]);
  });
});
```

`packages/diagrams/tests/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractDiagrams } from '../src/extract.js';
import { buildManifest, parseManifest, serialiseManifest } from '../src/manifest.js';
import { single } from './support/single.js';

const diagrams = extractDiagrams('docs/api.md', '## List\n```mermaid\nsequenceDiagram\n```\n');

describe('manifest', () => {
  it('records id, file, heading, image and hash per diagram', () => {
    expect(buildManifest(diagrams)).toEqual({
      diagrams: [
        {
          id: 'api/list',
          file: 'docs/api.md',
          heading: 'List',
          image: 'docs/diagrams/api/list.svg',
          hash: single(diagrams).hash,
        },
      ],
    });
  });

  it('round-trips through its JSON form, which ends with a newline', () => {
    const text = serialiseManifest(buildManifest(diagrams));
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseManifest(text)).toEqual(buildManifest(diagrams));
  });

  it.each([
    ['not json', 'not JSON'],
    ['null', 'not a diagram manifest'],
    ['[]', 'not a diagram manifest'],
    ['{"diagrams":[1]}', 'not a diagram manifest'],
    ['{"diagrams":[null]}', 'not a diagram manifest'],
    ['{"diagrams":[{"id":1}]}', 'not a diagram manifest'],
  ])('rejects %s', (text, message) => {
    expect(() => parseManifest(text)).toThrow(message);
  });
});
```

`packages/diagrams/tests/layout.test.ts`:

````ts
import { describe, expect, it } from 'vitest';
import { extractDiagrams } from '../src/extract.js';
import { checkLayout, DETAILS_CLOSE, DETAILS_OPEN, expectedImageLine } from '../src/layout.js';
import { single } from './support/single.js';

const good = [
  '## Flow',
  '',
  '![Flow (flowchart)](diagrams/testing/flow.svg)',
  '',
  DETAILS_OPEN,
  '',
  '```mermaid',
  'flowchart LR',
  '```',
  '',
  DETAILS_CLOSE,
].join('\n');

const check = (markdown: string, file = 'docs/testing.md') =>
  checkLayout(markdown, extractDiagrams(file, markdown));

describe('expectedImageLine', () => {
  it('uses the alt text and the path relative to the document', () => {
    const diagram = single(
      extractDiagrams('README.md', '## Design overview\n```mermaid\nflowchart LR\n```'),
    );
    expect(expectedImageLine(diagram)).toBe(
      '![Design overview (flowchart)](docs/diagrams/readme/design-overview.svg)',
    );
  });
});

describe('checkLayout', () => {
  it('accepts image, blank, details, blank, fence, blank, /details', () => {
    expect(check(good)).toEqual([]);
  });

  it('accepts the same layout with CRLF line endings', () => {
    expect(check(good.replace(/\n/g, '\r\n'))).toEqual([]);
  });

  it.each([
    ['a bare fence', ['## Flow', '```mermaid', 'flowchart LR', '```'].join('\n')],
    ['a wrong image path', good.replace('diagrams/testing/flow.svg', 'diagrams/testing/other.svg')],
    ['a wrong alt text', good.replace('Flow (flowchart)', 'Flow')],
    ['a missing </details>', good.replace(DETAILS_CLOSE, '')],
    ['a missing image', good.replace('![Flow (flowchart)](diagrams/testing/flow.svg)', '')],
  ])('reports %s with the exact expected lines', (_name, markdown) => {
    expect(check(markdown)).toEqual([
      'docs/testing.md:' +
        String(markdown.split('\n').indexOf('```mermaid') + 1) +
        ': testing/flow must be shown as its image above its collapsed source — expected ' +
        '"![Flow (flowchart)](diagrams/testing/flow.svg)", then "<details><summary>Mermaid source</summary>" ' +
        'above the fence and "</details>" below it',
    ]);
  });

  it.each([
    ['a bare fence on the first line', ['```mermaid', 'flowchart LR', '```'], 1],
    [
      '<details> with no image above it',
      [DETAILS_OPEN, '', '```mermaid', 'flowchart LR', '```', '', DETAILS_CLOSE],
      3,
    ],
  ])('reports %s', (_name, lines, line) => {
    expect(check(lines.join('\n'))).toEqual([
      `docs/testing.md:${line}: testing/diagram must be shown as its image above its collapsed source — expected ` +
        '"![flowchart](diagrams/testing/diagram.svg)", then "<details><summary>Mermaid source</summary>" ' +
        'above the fence and "</details>" below it',
    ]);
  });
});
````

`packages/diagrams/tests/readmeMap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractDiagrams } from '../src/extract.js';
import { checkReadmeMap, sourceLink } from '../src/readmeMap.js';
import { single } from './support/single.js';

const readmeDiagram = single(
  extractDiagrams('README.md', '## Design overview\n```mermaid\nflowchart LR\n```'),
);
const apiDiagram = single(
  extractDiagrams('docs/api.md', '### List — `GET /api/todos`\n```mermaid\nsequenceDiagram\n```'),
);
const noHeading = single(extractDiagrams('docs/api.md', '```mermaid\nsequenceDiagram\n```'));
const readmeNoHeading = single(extractDiagrams('README.md', '```mermaid\nflowchart LR\n```'));

const row = (label: string, image: string, source: string) =>
  `| ${label} | [SVG](${image}) | [Mermaid](${source}) |`;

describe('sourceLink', () => {
  it('links the heading anchor, in the same file for README diagrams', () => {
    expect(sourceLink(readmeDiagram)).toBe('#design-overview');
    expect(sourceLink(apiDiagram)).toBe('docs/api.md#list--get-apitodos');
    expect(sourceLink(noHeading)).toBe('docs/api.md');
    expect(sourceLink(readmeNoHeading)).toBe('README.md');
  });
});

describe('checkReadmeMap', () => {
  const both = [readmeDiagram, apiDiagram];

  it('accepts one row per diagram with its image and source links', () => {
    const readme = [
      row('Design overview', 'docs/diagrams/readme/design-overview.svg', '#design-overview'),
      row('List', 'docs/diagrams/api/list-get-api-todos.svg', 'docs/api.md#list--get-apitodos'),
    ].join('\n');
    expect(checkReadmeMap(readme, both)).toEqual([]);
  });

  it('reports a missing row, a wrong source link and a link to an unknown image', () => {
    const readme = [
      row('List', 'docs/diagrams/api/list-get-api-todos.svg', 'docs/api.md#list'),
      '![stray](docs/diagrams/api/gone.svg)',
    ].join('\n');
    expect(checkReadmeMap(readme, both)).toEqual([
      'README.md: the diagram map has no row for readme/design-overview (image link "docs/diagrams/readme/design-overview.svg")',
      'README.md: the map row for api/list-get-api-todos must link its Mermaid source "docs/api.md#list--get-apitodos"',
      'README.md: links docs/diagrams/api/gone.svg, which is not a diagram image',
    ]);
  });
});
```

`packages/diagrams/tests/check.test.ts`:

````ts
import { describe, expect, it } from 'vitest';
import {
  checkImages,
  checkRepository,
  collectDiagrams,
  duplicateIds,
  sourceFiles,
} from '../src/check.js';
import { extractDiagrams } from '../src/extract.js';
import { buildManifest, serialiseManifest } from '../src/manifest.js';
import { memoryRepo } from './support/memoryRepo.js';

const FIX = 'run: docker compose --profile docs run --rm --build diagrams';

const apiDoc = [
  '### List — `GET /api/todos`',
  '',
  '![List — GET /api/todos (sequence diagram)](diagrams/api/list-get-api-todos.svg)',
  '',
  '<details><summary>Mermaid source</summary>',
  '',
  '```mermaid',
  'sequenceDiagram',
  '```',
  '',
  '</details>',
].join('\n');
const readme = '| List | [SVG](docs/diagrams/api/list-get-api-todos.svg) | [Mermaid](docs/api.md#list--get-apitodos) |';

/** A repository whose single diagram is fully up to date. */
function currentRepo() {
  const diagrams = extractDiagrams('docs/api.md', apiDoc);
  return memoryRepo({
    'README.md': readme,
    'docs/api.md': apiDoc,
    'docs/decisions/0001-x.md': '```mermaid\nflowchart LR\n```',
    'docs/diagrams/api/list-get-api-todos.svg': '<svg/>',
    'docs/diagrams/manifest.json': serialiseManifest(buildManifest(diagrams)),
  });
}

describe('sourceFiles and collectDiagrams', () => {
  it('reads README.md and docs/*.md only (not ADRs or nested folders)', () => {
    const repo = currentRepo();
    expect(sourceFiles(repo)).toEqual(['README.md', 'docs/api.md']);
    expect(collectDiagrams(repo).map((d) => d.id)).toEqual(['api/list-get-api-todos']);
  });
});

describe('duplicateIds', () => {
  it('reports ids shared by two documents', () => {
    const a = extractDiagrams('README.md', '```mermaid\nflowchart LR\n```');
    const b = extractDiagrams('docs/readme.md', '```mermaid\nflowchart LR\n```');
    expect(duplicateIds([...a, ...b])).toEqual([
      'readme/diagram: id used by README.md:1 and docs/readme.md:1 — rename a heading',
    ]);
    expect(duplicateIds(a)).toEqual([]);
  });
});

describe('checkImages', () => {
  it('passes when the manifest, hashes and images all match', () => {
    const repo = currentRepo();
    expect(checkImages(repo, collectDiagrams(repo))).toEqual([]);
  });

  it('reports a missing manifest', () => {
    const repo = currentRepo();
    repo.remove('docs/diagrams/manifest.json');
    expect(checkImages(repo, collectDiagrams(repo))).toEqual([
      `docs/diagrams/manifest.json is missing — ${FIX}`,
    ]);
  });

  it('reports a stale image, a missing image and a diagram missing from the manifest', () => {
    const repo = currentRepo();
    repo.write('docs/api.md', apiDoc.replace('sequenceDiagram', 'sequenceDiagram\n  A->>B: new'));
    repo.remove('docs/diagrams/api/list-get-api-todos.svg');
    const extra = extractDiagrams('docs/testing.md', '## Flow\n```mermaid\nflowchart LR\n```');
    expect(checkImages(repo, [...collectDiagrams(repo), ...extra])).toEqual([
      `api/list-get-api-todos: image is stale (its Mermaid source changed) — ${FIX}`,
      `api/list-get-api-todos: image docs/diagrams/api/list-get-api-todos.svg is missing — ${FIX}`,
      `testing/flow: not in docs/diagrams/manifest.json — ${FIX}`,
      `testing/flow: image docs/diagrams/testing/flow.svg is missing — ${FIX}`,
    ]);
  });

  it('reports orphan manifest entries and orphan images', () => {
    const repo = currentRepo();
    repo.write('docs/diagrams/old/gone.svg', '<svg/>');
    repo.write('docs/diagrams/notes.txt', 'ignored: not an image');
    expect(checkImages(repo, [])).toEqual([
      `api/list-get-api-todos: manifest entry has no diagram — ${FIX}`,
      `docs/diagrams/api/list-get-api-todos.svg: orphan image — ${FIX}`,
      `docs/diagrams/old/gone.svg: orphan image — ${FIX}`,
    ]);
  });
});

describe('checkRepository', () => {
  it('returns no problems for an up-to-date repository', () => {
    expect(checkRepository(currentRepo())).toEqual([]);
  });

  it('collects duplicate, image, layout and README-map problems', () => {
    const repo = currentRepo();
    repo.write('README.md', '# nothing mapped');
    repo.write('docs/api.md', ['### List — `GET /api/todos`', '```mermaid', 'sequenceDiagram', '```'].join('\n'));
    const problems = checkRepository(repo);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^docs\/api\.md:2: api\/list-get-api-todos must be shown as its image/);
    expect(problems[1]).toMatch(/^README\.md: the diagram map has no row for api\/list-get-api-todos/);
  });
});
````

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose --profile dev run --rm dev npx vitest run --project diagrams`
Expected: FAIL — the new modules do not exist.

- [ ] **Step 4: Implement the modules**

`packages/diagrams/src/paths.ts`:

```ts
import { posix } from 'node:path';

export const DIAGRAMS_DIR = 'docs/diagrams';
export const MANIFEST_PATH = `${DIAGRAMS_DIR}/manifest.json`;
export const FIX_COMMAND = 'docker compose --profile docs run --rm --build diagrams';

export function imagePath(id: string): string {
  return `${DIAGRAMS_DIR}/${id}.svg`;
}

/** The image path as written in `file` (Markdown links are relative to the document). */
export function relativeImagePath(file: string, id: string): string {
  return posix.relative(posix.dirname(file), imagePath(id));
}
```

`packages/diagrams/src/repo.ts`:

```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

/** The few file operations the checker and generator need, with repository-relative paths. */
export interface Repo {
  read(path: string): string;
  exists(path: string): boolean;
  /** Every file under `dir`, recursively, as sorted repository-relative paths ([] if absent). */
  list(dir: string): string[];
  write(path: string, content: string): void;
  remove(path: string): void;
}

export function fsRepo(root: string): Repo {
  const at = (path: string): string => join(root, path);
  return {
    read: (path) => readFileSync(at(path), 'utf8'),
    exists: (path) => existsSync(at(path)),
    list: (dir) =>
      existsSync(at(dir))
        ? readdirSync(at(dir), { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => posix.relative(root, join(entry.parentPath, entry.name)))
            .sort()
        : [],
    write: (path, content) => {
      mkdirSync(dirname(at(path)), { recursive: true });
      writeFileSync(at(path), content);
    },
    remove: (path) => {
      rmSync(at(path), { force: true });
    },
  };
}
```

`packages/diagrams/src/manifest.ts`:

```ts
import type { Diagram } from './extract.js';
import { imagePath } from './paths.js';

export interface ManifestEntry {
  id: string;
  file: string;
  heading: string;
  image: string;
  hash: string;
}

export interface Manifest {
  diagrams: ManifestEntry[];
}

export function buildManifest(diagrams: readonly Diagram[]): Manifest {
  return {
    diagrams: diagrams.map(({ id, file, heading, hash }) => ({
      id,
      file,
      heading,
      image: imagePath(id),
      hash,
    })),
  };
}

export function serialiseManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const FIELDS = ['id', 'file', 'heading', 'image', 'hash'] as const;

function isEntry(value: unknown): value is ManifestEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    FIELDS.every((field) => typeof (value as Record<string, unknown>)[field] === 'string')
  );
}

export function parseManifest(text: string): Manifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('docs/diagrams/manifest.json is not JSON');
  }
  const diagrams = (value as { diagrams?: unknown } | null)?.diagrams;
  if (!Array.isArray(diagrams) || !diagrams.every(isEntry)) {
    throw new Error('docs/diagrams/manifest.json is not a diagram manifest');
  }
  return { diagrams };
}
```

`packages/diagrams/src/layout.ts`:

```ts
import { altText, type Diagram } from './extract.js';
import { relativeImagePath } from './paths.js';

export const DETAILS_OPEN = '<details><summary>Mermaid source</summary>';
export const DETAILS_CLOSE = '</details>';

export function expectedImageLine(diagram: Diagram): string {
  return `![${altText(diagram)}](${relativeImagePath(diagram.file, diagram.id)})`;
}

interface Line {
  text: string;
  index: number;
}

/** Spec §2.2: image, then the fence wrapped in a collapsed <details> block. */
export function checkLayout(markdown: string, diagrams: readonly Diagram[]): string[] {
  const filled: Line[] = markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((text, index) => ({ text: text.trim(), index }))
    .filter((line) => line.text !== '');
  const lastBefore = (index: number): Line | undefined =>
    filled.filter((line) => line.index < index).at(-1);
  const firstAfter = (index: number): Line | undefined => filled.find((line) => line.index > index);

  return diagrams.flatMap((diagram) => {
    const image = expectedImageLine(diagram);
    const fence = diagram.line - 1;
    const open = lastBefore(fence);
    const above = lastBefore(open?.index ?? fence);
    const ok =
      open?.text === DETAILS_OPEN &&
      above?.text === image &&
      firstAfter(diagram.endLine - 1)?.text === DETAILS_CLOSE;
    return ok
      ? []
      : [
          `${diagram.file}:${diagram.line}: ${diagram.id} must be shown as its image above its collapsed source — ` +
            `expected "${image}", then "${DETAILS_OPEN}" above the fence and "${DETAILS_CLOSE}" below it`,
        ];
  });
}
```

`packages/diagrams/src/readmeMap.ts`:

```ts
import type { Diagram } from './extract.js';
import { imagePath } from './paths.js';

/** The README link to a diagram's Mermaid source: its heading anchor in its document. */
export function sourceLink(diagram: Diagram): string {
  const file = diagram.file === 'README.md' ? '' : diagram.file;
  return diagram.anchor === '' ? file || 'README.md' : `${file}#${diagram.anchor}`;
}

/** Spec §2.3: every diagram has a README table row linking its image and its source. */
export function checkReadmeMap(readme: string, diagrams: readonly Diagram[]): string[] {
  const rows = readme.split('\n').filter((line) => line.trimStart().startsWith('|'));
  const problems = diagrams.flatMap((diagram) => {
    const image = imagePath(diagram.id);
    const row = rows.find((line) => line.includes(`(${image})`));
    if (row === undefined) {
      return [`README.md: the diagram map has no row for ${diagram.id} (image link "${image}")`];
    }
    const source = sourceLink(diagram);
    return row.includes(`(${source})`)
      ? []
      : [`README.md: the map row for ${diagram.id} must link its Mermaid source "${source}"`];
  });
  const known = new Set(diagrams.map((diagram) => imagePath(diagram.id)));
  for (const match of readme.matchAll(/\(docs\/diagrams\/[^)\s]+\.svg\)/g)) {
    const link = match[0].slice(1, -1);
    if (!known.has(link)) problems.push(`README.md: links ${link}, which is not a diagram image`);
  }
  return problems;
}
```

`packages/diagrams/src/check.ts`:

```ts
import { extractDiagrams, type Diagram } from './extract.js';
import { checkLayout } from './layout.js';
import { parseManifest } from './manifest.js';
import { DIAGRAMS_DIR, FIX_COMMAND, imagePath, MANIFEST_PATH } from './paths.js';
import { checkReadmeMap } from './readmeMap.js';
import type { Repo } from './repo.js';

const FIX = `run: ${FIX_COMMAND}`;

/** README.md plus the guides directly under docs/ (ADRs and plans hold no diagrams). */
export function sourceFiles(repo: Repo): string[] {
  return ['README.md', ...repo.list('docs').filter((path) => /^docs\/[^/]+\.md$/.test(path))];
}

export function collectDiagrams(repo: Repo): Diagram[] {
  return sourceFiles(repo).flatMap((file) => extractDiagrams(file, repo.read(file)));
}

export function duplicateIds(diagrams: readonly Diagram[]): string[] {
  const first = new Map<string, Diagram>();
  return diagrams.flatMap((diagram) => {
    const earlier = first.get(diagram.id);
    if (earlier === undefined) {
      first.set(diagram.id, diagram);
      return [];
    }
    return [
      `${diagram.id}: id used by ${earlier.file}:${earlier.line} and ${diagram.file}:${diagram.line} — rename a heading`,
    ];
  });
}

export function checkImages(repo: Repo, diagrams: readonly Diagram[]): string[] {
  if (!repo.exists(MANIFEST_PATH)) return [`${MANIFEST_PATH} is missing — ${FIX}`];
  const entries = new Map(
    parseManifest(repo.read(MANIFEST_PATH)).diagrams.map((entry) => [entry.id, entry] as const),
  );
  const ids = new Set(diagrams.map((diagram) => diagram.id));
  const images = new Set(diagrams.map((diagram) => imagePath(diagram.id)));
  const problems = diagrams.flatMap((diagram) => {
    const entry = entries.get(diagram.id);
    const found: string[] = [];
    if (entry === undefined) found.push(`${diagram.id}: not in ${MANIFEST_PATH} — ${FIX}`);
    else if (entry.hash !== diagram.hash) {
      found.push(`${diagram.id}: image is stale (its Mermaid source changed) — ${FIX}`);
    }
    if (!repo.exists(imagePath(diagram.id))) {
      found.push(`${diagram.id}: image ${imagePath(diagram.id)} is missing — ${FIX}`);
    }
    return found;
  });
  for (const id of entries.keys()) {
    if (!ids.has(id)) problems.push(`${id}: manifest entry has no diagram — ${FIX}`);
  }
  for (const path of repo.list(DIAGRAMS_DIR)) {
    if (path.endsWith('.svg') && !images.has(path)) problems.push(`${path}: orphan image — ${FIX}`);
  }
  return problems;
}

/** Every rule of spec §2.5; an empty list means the repository's diagrams are current. */
export function checkRepository(repo: Repo): string[] {
  const diagrams = collectDiagrams(repo);
  const layout = sourceFiles(repo).flatMap((file) =>
    checkLayout(
      repo.read(file),
      diagrams.filter((diagram) => diagram.file === file),
    ),
  );
  return [
    ...duplicateIds(diagrams),
    ...checkImages(repo, diagrams),
    ...layout,
    ...checkReadmeMap(repo.read('README.md'), diagrams),
  ];
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose --profile dev run --rm dev npx vitest run --project diagrams`
Expected: PASS. If an expected message in a test differs from the implementation only by wording, make the implementation match the test (the tests are the contract); if a test's expectation is wrong (e.g. a line number), fix the test and say so in the task report.

- [ ] **Step 6: Run the full gate**

Run: `docker compose --profile test run --rm --build test`
Expected: exit 0 with 100% coverage (add test cases for any uncovered branch).

- [ ] **Step 7: Commit**

```bash
git add packages/diagrams
git commit -F - <<'EOF'
feat(diagrams): check images, document layout and the README map

Pure checks over a Repo abstraction: the manifest matches every diagram's
source hash, each image exists with no orphans, every diagram is shown as
its image above its collapsed Mermaid source, and the README has a map row
linking each diagram's image and source anchor. Every failure names the
diagram and the command that fixes it.

Co-Authored-By: Claude <model> <noreply@anthropic.com>
EOF
```

---

### Task 3: Generator — render with Mermaid CLI in Docker

**Files:**

- Create: `packages/diagrams/src/render.ts`, `packages/diagrams/src/mmdc.ts`, `packages/diagrams/src/bin.ts`, `packages/diagrams/mermaid.config.json`
- Test: `packages/diagrams/tests/render.test.ts`, `packages/diagrams/tests/mmdc.test.ts`
- Modify: `vitest.config.ts` (coverage exclude `packages/diagrams/src/bin.ts`), `Dockerfile` (`build-diagrams`, `diagrams` stages), `compose.yaml` (`diagrams` service), `.prettierignore`

**Interfaces:**

- Consumes: Task 2 (`Repo`, `collectDiagrams`, `duplicateIds`, `buildManifest`, `serialiseManifest`, `imagePath`, `DIAGRAMS_DIR`, `MANIFEST_PATH`), Task 1 (`normalise`).
- Produces:
  ```ts
  // render.ts
  export type Renderer = (source: string) => Promise<string>;
  export function renderRepository(repo: Repo, render: Renderer): Promise<Manifest>;
  // mmdc.ts
  export type ExecFile = (file: string, args: readonly string[]) => Promise<unknown>;
  export interface MmdcOptions { mmdc: string; puppeteerConfig: string; mermaidConfig: string; exec: ExecFile }
  export function mmdcRenderer(options: MmdcOptions): Renderer;
  ```
  Compose service `diagrams` (profile `docs`); command `docker compose --profile docs run --rm --build diagrams`.

- [ ] **Step 1: Write the failing tests**

`packages/diagrams/tests/render.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { checkImages, collectDiagrams } from '../src/check.js';
import { parseManifest } from '../src/manifest.js';
import { renderRepository } from '../src/render.js';
import { memoryRepo } from './support/memoryRepo.js';

const docs = {
  'README.md': '## Design overview\n```mermaid\nflowchart LR\n  A-->B\n```\n',
  'docs/api.md': '### List — `GET /api/todos`\n```mermaid\nsequenceDiagram\n```\n',
};

describe('renderRepository', () => {
  it('writes one image per diagram, the manifest, and leaves a consistent repository', async () => {
    const repo = memoryRepo(docs);
    const render = vi.fn(async (source: string) => `<svg>${source.length}</svg>`);
    const manifest = await renderRepository(repo, render);
    expect(render.mock.calls.map(([source]) => source)).toEqual([
      'flowchart LR\n  A-->B',
      'sequenceDiagram',
    ]);
    expect(repo.read('docs/diagrams/readme/design-overview.svg')).toBe('<svg>20</svg>');
    expect(repo.exists('docs/diagrams/api/list-get-api-todos.svg')).toBe(true);
    expect(parseManifest(repo.read('docs/diagrams/manifest.json'))).toEqual(manifest);
    expect(checkImages(repo, collectDiagrams(repo))).toEqual([]);
  });

  it('deletes orphan images but keeps other files', async () => {
    const repo = memoryRepo({
      ...docs,
      'docs/diagrams/old/gone.svg': '<svg/>',
      'docs/diagrams/README.txt': 'keep me',
    });
    await renderRepository(repo, async () => '<svg/>');
    expect(repo.exists('docs/diagrams/old/gone.svg')).toBe(false);
    expect(repo.exists('docs/diagrams/README.txt')).toBe(true);
  });

  it('names the file, line and id when a diagram fails and writes no manifest', async () => {
    const repo = memoryRepo(docs);
    const failing = async (source: string) => {
      if (source.startsWith('sequence')) throw new Error('Parse error on line 1');
      return '<svg/>';
    };
    await expect(renderRepository(repo, failing)).rejects.toThrow(
      'docs/api.md:2: api/list-get-api-todos failed to render: Parse error on line 1',
    );
    expect(repo.exists('docs/diagrams/manifest.json')).toBe(false);
  });

  it('reports a non-Error failure too', async () => {
    const repo = memoryRepo(docs);
    await expect(renderRepository(repo, () => Promise.reject('boom'))).rejects.toThrow(
      'README.md:2: readme/design-overview failed to render: boom',
    );
  });

  it('refuses duplicate ids before rendering anything', async () => {
    const repo = memoryRepo({
      'README.md': '```mermaid\nflowchart LR\n```\n',
      'docs/readme.md': '```mermaid\nflowchart LR\n```\n',
    });
    const render = vi.fn(async () => '<svg/>');
    await expect(renderRepository(repo, render)).rejects.toThrow('readme/diagram: id used by');
    expect(render).not.toHaveBeenCalled();
  });
});
```

`packages/diagrams/tests/mmdc.test.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mmdcRenderer } from '../src/mmdc.js';
import { single } from './support/single.js';

/** The value following `flag` in an argument list. */
function argAfter(args: readonly string[], flag: string): string {
  const value = args[args.indexOf(flag) + 1];
  if (value === undefined) throw new Error(`no value after ${flag}`);
  return value;
}

const options = {
  mmdc: '/bin/mmdc',
  puppeteerConfig: '/puppeteer-config.json',
  mermaidConfig: '/tool/mermaid.config.json',
};

describe('mmdcRenderer', () => {
  it('runs mmdc on a temporary input and returns the SVG it wrote, then cleans up', async () => {
    const calls: { file: string; args: readonly string[]; input: string }[] = [];
    const render = mmdcRenderer({
      ...options,
      exec: async (file, args) => {
        calls.push({ file, args, input: readFileSync(argAfter(args, '-i'), 'utf8') });
        writeFileSync(argAfter(args, '-o'), '<svg>ok</svg>');
      },
    });
    await expect(render('\r\nflowchart LR\r\n  A-->B\r\n')).resolves.toBe('<svg>ok</svg>');
    const call = single(calls);
    expect(call.file).toBe('/bin/mmdc');
    expect(call.input).toBe('flowchart LR\n  A-->B\n');
    expect(call.args.slice(0, 7)).toEqual([
      '-p', '/puppeteer-config.json', '-c', '/tool/mermaid.config.json', '-b', 'white', '-q',
    ]);
    expect(existsSync(argAfter(call.args, '-i'))).toBe(false);
  });

  it('propagates mmdc failures and still cleans up', async () => {
    let input = '';
    const render = mmdcRenderer({
      ...options,
      exec: async (_file, args) => {
        input = argAfter(args, '-i');
        throw new Error('Command failed: Parse error on line 2');
      },
    });
    await expect(render('flowchart LR\n  A--')).rejects.toThrow('Parse error on line 2');
    expect(existsSync(input)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose --profile dev run --rm dev npx vitest run --project diagrams`
Expected: FAIL — `render.js` and `mmdc.js` do not exist.

- [ ] **Step 3: Implement the generator**

`packages/diagrams/src/render.ts`:

```ts
import { collectDiagrams, duplicateIds } from './check.js';
import { buildManifest, serialiseManifest, type Manifest } from './manifest.js';
import { DIAGRAMS_DIR, imagePath, MANIFEST_PATH } from './paths.js';
import type { Repo } from './repo.js';

/** Turns one diagram's Mermaid text into SVG markup. */
export type Renderer = (source: string) => Promise<string>;

/** Renders every diagram, deletes orphan images, then writes the manifest (last, so a failure leaves none). */
export async function renderRepository(repo: Repo, render: Renderer): Promise<Manifest> {
  const diagrams = collectDiagrams(repo);
  const duplicates = duplicateIds(diagrams);
  if (duplicates.length > 0) throw new Error(duplicates.join('\n'));

  repo.remove(MANIFEST_PATH);
  for (const diagram of diagrams) {
    let svg: string;
    try {
      svg = await render(diagram.source);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`${diagram.file}:${diagram.line}: ${diagram.id} failed to render: ${reason}`);
    }
    repo.write(imagePath(diagram.id), svg);
  }

  const images = new Set(diagrams.map((diagram) => imagePath(diagram.id)));
  for (const path of repo.list(DIAGRAMS_DIR)) {
    if (path.endsWith('.svg') && !images.has(path)) repo.remove(path);
  }

  const manifest = buildManifest(diagrams);
  repo.write(MANIFEST_PATH, serialiseManifest(manifest));
  return manifest;
}
```

`packages/diagrams/src/mmdc.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalise } from './extract.js';
import type { Renderer } from './render.js';

export type ExecFile = (file: string, args: readonly string[]) => Promise<unknown>;

export interface MmdcOptions {
  /** Path of the Mermaid CLI binary. */
  mmdc: string;
  /** Puppeteer launch config (the official image's sandbox settings). */
  puppeteerConfig: string;
  /** Mermaid config: deterministic ids, SVG text labels, theme. */
  mermaidConfig: string;
  exec: ExecFile;
}

export function mmdcRenderer(options: MmdcOptions): Renderer {
  return async (source) => {
    const dir = mkdtempSync(join(tmpdir(), 'diagram-'));
    try {
      const input = join(dir, 'input.mmd');
      const output = join(dir, 'output.svg');
      writeFileSync(input, `${normalise(source)}\n`);
      await options.exec(options.mmdc, [
        '-p', options.puppeteerConfig,
        '-c', options.mermaidConfig,
        '-b', 'white',
        '-q',
        '-i', input,
        '-o', output,
      ]);
      return readFileSync(output, 'utf8');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
```

`packages/diagrams/src/bin.ts` (entry point; logic-free wiring, excluded from coverage like `apps/api/src/server.ts`):

```ts
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { mmdcRenderer } from './mmdc.js';
import { renderRepository } from './render.js';
import { fsRepo } from './repo.js';

const renderer = mmdcRenderer({
  mmdc: process.env.MMDC ?? '/home/mermaidcli/node_modules/.bin/mmdc',
  puppeteerConfig: process.env.PUPPETEER_CONFIG ?? '/puppeteer-config.json',
  mermaidConfig: fileURLToPath(new URL('../mermaid.config.json', import.meta.url)),
  exec: promisify(execFile),
});

try {
  const manifest = await renderRepository(fsRepo(process.cwd()), renderer);
  console.log(`Rendered ${manifest.diagrams.length} diagrams into docs/diagrams/`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
```

`packages/diagrams/mermaid.config.json`:

```json
{
  "theme": "default",
  "deterministicIds": true,
  "deterministicIDSeed": "foci",
  "htmlLabels": false,
  "flowchart": { "htmlLabels": false }
}
```

In `vitest.config.ts`, extend the coverage `exclude` list:

```ts
      exclude: [
        'apps/api/src/server.ts',
        'apps/web/src/main.tsx',
        'packages/diagrams/src/bin.ts',
        '**/*.d.ts',
      ],
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose --profile dev run --rm dev npx vitest run --project diagrams`
Expected: PASS.

- [ ] **Step 5: Add the Docker target, compose service and ignore rule**

In `Dockerfile`, after the `build-web` stage add:

```dockerfile
FROM source AS build-diagrams
RUN npm run build -w @foci/diagrams

# Renders the Mermaid diagrams in README.md and docs/*.md to docs/diagrams/ (spec 2026-10-02 §2).
FROM minlag/mermaid-cli:12.0.0 AS diagrams
COPY packages/diagrams/package.json packages/diagrams/mermaid.config.json /tool/
COPY --from=build-diagrams /repo/packages/diagrams/dist /tool/dist
WORKDIR /repo
ENTRYPOINT ["node", "/tool/dist/bin.js"]
```

In `compose.yaml`, after the `dev` service add:

```yaml
  # Regenerates docs/diagrams/ from the Mermaid blocks in README.md and docs/*.md.
  diagrams:
    build:
      context: .
      target: diagrams
    profiles: [docs]
    # Root so it can write into a bind-mounted checkout owned by any host user
    # (the image's Chromium already runs with --no-sandbox).
    user: root
    volumes:
      - .:/repo
```

Append to `.prettierignore`:

```
docs/diagrams
```

- [ ] **Step 6: Generate the images and verify them**

```bash
docker compose --profile docs run --rm --build diagrams
```

Expected: `Rendered 21 diagrams into docs/diagrams/`; `docs/diagrams/` holds `manifest.json` and 21 SVGs in `readme/`, `architecture/`, `api/`, `concurrency/`, `testing/`.

Verify, and record the outputs in the task report:

```bash
find docs/diagrams -name '*.svg' | wc -l                  # 21
grep -L '<svg' docs/diagrams/*/*.svg                      # no output: every file is an SVG
grep -l 'foreignObject' docs/diagrams/*/*.svg             # no output: labels are SVG text
grep -l '&lt;br' docs/diagrams/*/*.svg                    # no output: <br/> became a line break, not text
cp -r docs/diagrams ../diagrams-first-run
docker compose --profile docs run --rm diagrams
diff -r docs/diagrams ../diagrams-first-run && echo DETERMINISTIC; rm -rf ../diagrams-first-run
```

Expected: the three `grep` commands print nothing; `DETERMINISTIC`. Open two images in a browser (one flowchart with `<br/>` labels — `architecture/system-context.svg` — and one sequence diagram — `api/create-post-api-todos.svg`) and confirm text, arrows and line breaks look right. If labels render as literal `<br/>` or text is missing, STOP and report (spec §2.4 says to switch to PNG only after an empirical check — the controller decides).

- [ ] **Step 7: Run the full gate and commit**

Run: `docker compose --profile test run --rm --build test`
Expected: exit 0, 100% coverage.

```bash
git add packages/diagrams vitest.config.ts Dockerfile compose.yaml .prettierignore docs/diagrams
git commit -F - <<'EOF'
feat(diagrams): render every diagram to SVG with the Mermaid CLI in Docker

`docker compose --profile docs run --rm --build diagrams` renders each
Mermaid block in README.md and docs/*.md with the pinned official Mermaid
CLI image (deterministic ids, SVG text labels), writes docs/diagrams/<id>.svg
and a manifest of source hashes, and deletes orphan images. A diagram that
fails to parse stops the run with its file, line and id.

Co-Authored-By: Claude <model> <noreply@anthropic.com>
EOF
```

---

### Task 4: Show images in the documents, map them in the README, and gate on it

**Files:**

- Modify: `README.md`, `docs/architecture.md`, `docs/api.md`, `docs/concurrency.md`, `docs/testing.md`
- Modify: `packages/diagrams/tests/check.test.ts` (repository gate test)
- Modify: `.github/workflows/ci.yml` (diagram reproduction job)
- Modify: `CLAUDE.md`, `AGENTS.md`, `docs/testing.md` (commands and the generated-files rule)

**Interfaces:**

- Consumes: everything above; the README and docs must satisfy `checkRepository(fsRepo(<repo root>))`.

- [ ] **Step 1: Write the failing repository test**

Append to `packages/diagrams/tests/check.test.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { fsRepo } from '../src/repo.js';

describe('this repository', () => {
  it('has a current image, image-first layout and README map row for every diagram', () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    expect(checkRepository(fsRepo(root))).toEqual([]);
  });
});
```

(Move the two new imports to the top of the file with the others.)

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose --profile dev run --rm dev npx vitest run packages/diagrams/tests/check.test.ts`
Expected: FAIL — 21 layout problems (bare fences) and 21 README-map problems; the message for each states the exact expected image line.

- [ ] **Step 3: Show each diagram as image + collapsed source**

For every diagram listed below, edit its document so the fence is wrapped exactly like this (blank lines included):

````markdown
<image line from the table>

<details><summary>Mermaid source</summary>

```mermaid
…unchanged Mermaid text…
```

</details>
````

Do not change any Mermaid text (that would change hashes and make images stale).

| Document               | Image line                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `README.md`            | `![Design overview (flowchart)](docs/diagrams/readme/design-overview.svg)`                                          |
| `README.md`            | `![How this was built (flowchart)](docs/diagrams/readme/how-this-was-built.svg)`                                    |
| `docs/architecture.md` | `![System context (flowchart)](diagrams/architecture/system-context.svg)`                                           |
| `docs/architecture.md` | `![Deployment and startup order (flowchart)](diagrams/architecture/deployment-and-startup-order.svg)`               |
| `docs/architecture.md` | `![Backend layers (flowchart)](diagrams/architecture/backend-layers.svg)`                                           |
| `docs/architecture.md` | `![Domain model (state diagram)](diagrams/architecture/domain-model.svg)`                                           |
| `docs/architecture.md` | `![Data model (entity-relationship diagram)](diagrams/architecture/data-model.svg)`                                 |
| `docs/architecture.md` | `![Frontend (flowchart)](diagrams/architecture/frontend.svg)`                                                       |
| `docs/api.md`          | `![Create — POST /api/todos (sequence diagram)](diagrams/api/create-post-api-todos.svg)`                            |
| `docs/api.md`          | `![List — GET /api/todos (sequence diagram)](diagrams/api/list-get-api-todos.svg)`                                  |
| `docs/api.md`          | `![View — GET /api/todos/{id} (sequence diagram)](diagrams/api/view-get-api-todos-id.svg)`                          |
| `docs/api.md`          | `![Update — PATCH /api/todos/{id} (sequence diagram)](diagrams/api/update-patch-api-todos-id.svg)`                  |
| `docs/api.md`          | `![Complete — POST /api/todos/{id}/complete (sequence diagram)](diagrams/api/complete-post-api-todos-id-complete.svg)` |
| `docs/api.md`          | `![Incomplete — POST /api/todos/{id}/incomplete (sequence diagram)](diagrams/api/incomplete-post-api-todos-id-incomplete.svg)` |
| `docs/api.md`          | `![Delete — DELETE /api/todos/{id} (sequence diagram)](diagrams/api/delete-delete-api-todos-id.svg)`                |
| `docs/concurrency.md`  | `![Lost update, prevented (sequence diagram)](diagrams/concurrency/lost-update-prevented.svg)`                       |
| `docs/concurrency.md`  | `![Double submit, absorbed (sequence diagram)](diagrams/concurrency/double-submit-absorbed.svg)`                     |
| `docs/concurrency.md`  | `![Parallel completes, one change (sequence diagram)](diagrams/concurrency/parallel-completes-one-change.svg)`       |
| `docs/testing.md`      | `![Layers (flowchart)](diagrams/testing/layers.svg)`                                                                |

The checker's failure messages are authoritative: if one disagrees with this table (e.g. a heading changed since the plan was written), use the line the checker prints.

- [ ] **Step 4: Replace the README's "More:" line with the diagram map**

In `README.md`, replace the line that starts `More: [architecture](docs/architecture.md)` with:

```markdown
## Documentation and diagrams

Every diagram is a Mermaid block in the document that explains it, shown as a generated image with its source collapsed underneath. Changed a diagram? Run `docker compose --profile docs run --rm --build diagrams` — the test gate fails until images match their source.

**This README**

| Diagram            | Image                                                 | Mermaid source                |
| ------------------ | ----------------------------------------------------- | ----------------------------- |
| Design overview    | [SVG](docs/diagrams/readme/design-overview.svg)       | [source](#design-overview)    |
| How this was built | [SVG](docs/diagrams/readme/how-this-was-built.svg)    | [source](#how-this-was-built) |

**[Architecture](docs/architecture.md)** — context, deployment, layers, domain and data models, frontend.

| Diagram                      | Image                                                                  | Mermaid source                                                         |
| ---------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| System context               | [SVG](docs/diagrams/architecture/system-context.svg)                   | [source](docs/architecture.md#system-context)                          |
| Deployment and startup order | [SVG](docs/diagrams/architecture/deployment-and-startup-order.svg)     | [source](docs/architecture.md#deployment-and-startup-order)            |
| Backend layers               | [SVG](docs/diagrams/architecture/backend-layers.svg)                   | [source](docs/architecture.md#backend-layers)                          |
| Domain model                 | [SVG](docs/diagrams/architecture/domain-model.svg)                     | [source](docs/architecture.md#domain-model)                            |
| Data model                   | [SVG](docs/diagrams/architecture/data-model.svg)                       | [source](docs/architecture.md#data-model)                              |
| Frontend                     | [SVG](docs/diagrams/architecture/frontend.svg)                         | [source](docs/architecture.md#frontend)                                |

**[API and sequence diagrams](docs/api.md)** — conventions, endpoints, problem types, one sequence per endpoint with its error branches.

| Diagram                                   | Image                                                                | Mermaid source                                                |
| ----------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| Create — `POST /api/todos`                | [SVG](docs/diagrams/api/create-post-api-todos.svg)                   | [source](docs/api.md#create--post-apitodos)                   |
| List — `GET /api/todos`                   | [SVG](docs/diagrams/api/list-get-api-todos.svg)                      | [source](docs/api.md#list--get-apitodos)                      |
| View — `GET /api/todos/{id}`              | [SVG](docs/diagrams/api/view-get-api-todos-id.svg)                   | [source](docs/api.md#view--get-apitodosid)                    |
| Update — `PATCH /api/todos/{id}`          | [SVG](docs/diagrams/api/update-patch-api-todos-id.svg)               | [source](docs/api.md#update--patch-apitodosid)                |
| Complete — `POST /api/todos/{id}/complete` | [SVG](docs/diagrams/api/complete-post-api-todos-id-complete.svg)    | [source](docs/api.md#complete--post-apitodosidcomplete)       |
| Incomplete — `POST /api/todos/{id}/incomplete` | [SVG](docs/diagrams/api/incomplete-post-api-todos-id-incomplete.svg) | [source](docs/api.md#incomplete--post-apitodosidincomplete) |
| Delete — `DELETE /api/todos/{id}`         | [SVG](docs/diagrams/api/delete-delete-api-todos-id.svg)              | [source](docs/api.md#delete--delete-apitodosid)               |

**[Concurrency](docs/concurrency.md)** — the race scenarios and how the design absorbs them.

| Diagram                        | Image                                                                   | Mermaid source                                                  |
| ------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| Lost update, prevented         | [SVG](docs/diagrams/concurrency/lost-update-prevented.svg)              | [source](docs/concurrency.md#lost-update-prevented)             |
| Double submit, absorbed        | [SVG](docs/diagrams/concurrency/double-submit-absorbed.svg)             | [source](docs/concurrency.md#double-submit-absorbed)            |
| Parallel completes, one change | [SVG](docs/diagrams/concurrency/parallel-completes-one-change.svg)      | [source](docs/concurrency.md#parallel-completes-one-change)     |

**[Testing](docs/testing.md)** — test layers, topology and how to run each.

| Diagram | Image                                     | Mermaid source                     |
| ------- | ----------------------------------------- | ---------------------------------- |
| Layers  | [SVG](docs/diagrams/testing/layers.svg)   | [source](docs/testing.md#layers)   |

**[Decision records](docs/decisions/README.md)** — one ADR per architectural choice (no diagrams).
```

Place this section right after the "Design overview" section (where the "More:" line was). Check the one-line document descriptions against each document's actual content and adjust wording if a description is inaccurate.

- [ ] **Step 5: Document the generator for humans and agents**

- `CLAUDE.md` Commands block: add `docker compose --profile docs run --rm --build diagrams       # regenerate docs/diagrams after editing a Mermaid block`; in Conventions, change `Never edit generated files by hand (\`apps/api/openapi.json\`).` to `Never edit generated files by hand (\`apps/api/openapi.json\`, \`docs/diagrams/\`).`
- `AGENTS.md`: add the same regenerate command to its command list.
- `docs/testing.md`: in the gate description, add one sentence: the gate also fails when a diagram image is stale, missing or orphaned, or a diagram is missing from the README map (fix: the regenerate command).

- [ ] **Step 6: Add the CI reproduction job**

In `.github/workflows/ci.yml`, add a job:

```yaml
  diagrams:
    name: Diagram images match their Mermaid source
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Regenerate every diagram image
        run: docker compose --profile docs run --rm --build diagrams
      - name: Committed images are exactly what the generator produces
        run: |
          git status --porcelain -- docs/diagrams
          test -z "$(git status --porcelain -- docs/diagrams)"
```

- [ ] **Step 7: Format, run the gate and the e2e suite**

```bash
docker compose --profile dev run --rm dev npx prettier --write README.md AGENTS.md CLAUDE.md docs/*.md
docker compose --profile test run --rm --build test
docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e; rc=$?
docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml down -v
echo "e2e exit: $rc"
```

Expected: gate exit 0 (the repository test passes; 100% coverage); e2e `8 passed`. Prettier must not alter any Mermaid text — if `git diff` shows a change inside a mermaid fence, revert that hunk (a changed source makes its image stale); then re-run the generator only if Mermaid text legitimately changed.

Also prove the gate catches drift (do not commit this): change one character inside a Mermaid block in `docs/testing.md`, run `docker compose --profile dev run --rm dev npx vitest run packages/diagrams/tests/check.test.ts`, confirm it fails with `testing/layers: image is stale (its Mermaid source changed) — run: docker compose --profile docs run --rm --build diagrams`, then `git checkout docs/testing.md`.

- [ ] **Step 8: Commit**

```bash
git add README.md AGENTS.md CLAUDE.md docs packages/diagrams/tests/check.test.ts .github/workflows/ci.yml
git commit -F - <<'EOF'
docs(readme): show every diagram as an image and map them from the README

Each Mermaid block now appears as its generated SVG with the source in a
collapsed block underneath, so diagrams preview in any Markdown viewer.
The README's new "Documentation and diagrams" section lists every diagram
with links to its image and its source. The test gate checks all of it
against the repository, and CI proves the images regenerate identically.

Co-Authored-By: Claude <model> <noreply@anthropic.com>
EOF
```

---

### Finish: pull request

- [ ] Push `docs/diagram-images`, open the PR against `main` with `gh pr create` (title `docs: diagram images and README diagram map`; body: summary, spec link, evidence — gate, e2e, determinism check, drift-detection proof, screenshot of one rendered SVG on GitHub's file view; ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), then `gh pr checks --watch`.
- [ ] **If the `diagrams` CI job fails only because SVG bytes differ** (images rendered locally on arm64 vs CI on amd64 — fonts or layout metrics), do not regenerate in CI and commit. Report it to the controller with the job log and `git diff --stat`; the ruling options are (a) commit the CI-rendered images (download from a job artifact) so `main` matches amd64 output, or (b) relax the job to verify the generator succeeds and `docs/diagrams/manifest.json` is unchanged. Spec §2.6 is then amended to match.
- [ ] Merge only after the task reviews are clean and CI is green.
