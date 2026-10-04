import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TodoViewListSchema, TodoViewSchema } from '@foci/shared';
import { describe, expect, it } from 'vitest';
import { hashFiles, sha256 } from '../src/hash.js';
import { fsRepo } from '../src/repo.js';
import {
  buildScreenshotManifest,
  checkScreenshots,
  inputsHash,
  playwrightVersion,
  SCREENSHOT_MANIFEST_PATH,
  SCREENSHOTS_COMMAND,
  SCREENSHOTS_DIR,
  screenshotInputs,
  writeScreenshotManifest,
} from '../src/screenshots.js';
import { memoryRepo } from './support/memoryRepo.js';

const FIX = 'run: docker compose --profile docs run --rm --build screenshots';

const packageJson = (version: string) =>
  JSON.stringify({ devDependencies: { '@playwright/test': version } });

/** A repository with UI inputs, two screenshots and the docs that show them, not yet recorded. */
function uiRepo() {
  return memoryRepo({
    'package.json': packageJson('1.63.0'),
    'apps/web/index.html': '<div id="root"></div>',
    'apps/web/src/main.tsx': 'render()',
    'apps/web/src/todos/TodoForm.tsx': 'form()',
    'apps/web/vite.config.ts': 'not a UI input',
    'apps/api/src/app.ts': 'not a UI input',
    'packages/shared/src/todo.ts': 'schema()',
    'screenshots/scenes.spec.ts': 'scenes()',
    'screenshots/fixtures/todos.json': '[]',
    'docs/images/screenshot.png': 'png one',
    'docs/images/edit-dialog.png': 'png two',
    'README.md': '# App\n\n![FociToDo screenshot](docs/images/screenshot.png)\n',
    'docs/ui.md': '# UI\n\n![Editing a task](images/edit-dialog.png)\n',
  });
}

/** A repository whose screenshots are recorded and current. */
function currentRepo() {
  const repo = uiRepo();
  writeScreenshotManifest(repo);
  return repo;
}

describe('constants', () => {
  it('keeps the screenshots and their manifest under docs/images', () => {
    expect(SCREENSHOTS_DIR).toBe('docs/images');
    expect(SCREENSHOT_MANIFEST_PATH).toBe('docs/images/manifest.json');
    expect(SCREENSHOTS_COMMAND).toBe('docker compose --profile docs run --rm --build screenshots');
  });
});

describe('screenshotInputs', () => {
  it('is the sorted web sources, web index.html, shared sources and the generator', () => {
    const repo = uiRepo();
    repo.write('apps/web/src/.DS_Store', 'Finder metadata, git-ignored');
    expect(screenshotInputs(repo)).toEqual([
      'apps/web/index.html',
      'apps/web/src/main.tsx',
      'apps/web/src/todos/TodoForm.tsx',
      'packages/shared/src/todo.ts',
      'screenshots/fixtures/todos.json',
      'screenshots/scenes.spec.ts',
    ]);
  });

  it('leaves out an index.html that does not exist', () => {
    const repo = uiRepo();
    repo.remove('apps/web/index.html');
    expect(screenshotInputs(repo)).not.toContain('apps/web/index.html');
  });
});

describe('playwrightVersion', () => {
  it("reads the root package.json's pinned @playwright/test", () => {
    expect(playwrightVersion(uiRepo())).toBe('1.63.0');
  });

  it.each([['{}'], ['{"devDependencies":{}}']])('names a missing pin in %s', (text) => {
    const repo = uiRepo();
    repo.write('package.json', text);
    expect(() => playwrightVersion(repo)).toThrow(
      'package.json does not pin devDependencies["@playwright/test"]',
    );
  });
});

describe('inputsHash', () => {
  it('covers the input files and the Playwright version', () => {
    const repo = uiRepo();
    expect(inputsHash(repo)).toBe(
      sha256(`${hashFiles(repo, screenshotInputs(repo))}playwright@1.63.0\n`),
    );
    const before = inputsHash(repo);
    repo.write('apps/web/src/main.tsx', 'render(changed)');
    expect(inputsHash(repo)).not.toBe(before);
    const edited = inputsHash(repo);
    repo.write('package.json', packageJson('1.64.0'));
    expect(inputsHash(repo)).not.toBe(edited);
  });
});

describe('buildScreenshotManifest and writeScreenshotManifest', () => {
  it('records the inputs hash, the Playwright version and each PNG hash', () => {
    const repo = uiRepo();
    repo.write('docs/images/notes.txt', 'not a screenshot');
    expect(buildScreenshotManifest(repo)).toEqual({
      inputsHash: inputsHash(repo),
      playwright: '1.63.0',
      images: {
        'docs/images/edit-dialog.png': sha256('png two'),
        'docs/images/screenshot.png': sha256('png one'),
      },
    });
  });

  it('writes the manifest as JSON ending with a newline and returns it', () => {
    const repo = uiRepo();
    const manifest = writeScreenshotManifest(repo);
    const text = repo.read(SCREENSHOT_MANIFEST_PATH);
    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(manifest);
  });
});

describe('checkScreenshots', () => {
  it('passes when the inputs and images match the manifest', () => {
    expect(checkScreenshots(currentRepo())).toEqual([]);
  });

  it('reports a missing manifest', () => {
    expect(checkScreenshots(uiRepo())).toEqual([`${SCREENSHOT_MANIFEST_PATH} is missing — ${FIX}`]);
  });

  it.each([
    ['not json', 'is not JSON'],
    ['null', 'is not a screenshot manifest'],
    ['{"inputsHash":"x","playwright":"1.63.0"}', 'is not a screenshot manifest'],
    ['{"inputsHash":"x","playwright":1,"images":{}}', 'is not a screenshot manifest'],
    ['{"inputsHash":1,"playwright":"1.63.0","images":{}}', 'is not a screenshot manifest'],
    ['{"inputsHash":"x","playwright":"1.63.0","images":null}', 'is not a screenshot manifest'],
    ['{"inputsHash":"x","playwright":"1.63.0","images":[]}', 'is not a screenshot manifest'],
    [
      '{"inputsHash":"x","playwright":"1.63.0","images":{"a.png":1}}',
      'is not a screenshot manifest',
    ],
  ])('reports an unreadable manifest (%s) and stops', (text, reason) => {
    const repo = currentRepo();
    repo.write(SCREENSHOT_MANIFEST_PATH, text);
    expect(checkScreenshots(repo)).toEqual([
      `${SCREENSHOT_MANIFEST_PATH} is unreadable (${SCREENSHOT_MANIFEST_PATH} ${reason}) — ${FIX}`,
    ]);
  });

  it.each([
    ['a web source', 'apps/web/src/todos/TodoForm.tsx'],
    ['the web index.html', 'apps/web/index.html'],
    ['a shared schema', 'packages/shared/src/todo.ts'],
    ['a scene', 'screenshots/scenes.spec.ts'],
    ['a fixture', 'screenshots/fixtures/todos.json'],
  ])('reports stale screenshots when %s changes', (_label, path) => {
    const repo = currentRepo();
    repo.write(path, 'changed');
    expect(checkScreenshots(repo)).toEqual([`screenshots are stale: a UI input changed — ${FIX}`]);
  });

  it('reports stale screenshots when a UI input is added or the Playwright pin moves', () => {
    const added = currentRepo();
    added.write('apps/web/src/new.tsx', 'new()');
    expect(checkScreenshots(added)).toEqual([`screenshots are stale: a UI input changed — ${FIX}`]);
    const bumped = currentRepo();
    bumped.write('package.json', packageJson('1.64.0'));
    expect(checkScreenshots(bumped)).toEqual([
      `screenshots are stale: a UI input changed — ${FIX}`,
    ]);
  });

  it('ignores files that are not UI inputs', () => {
    const repo = currentRepo();
    repo.write('apps/api/src/app.ts', 'changed');
    repo.write('apps/web/vite.config.ts', 'changed');
    expect(checkScreenshots(repo)).toEqual([]);
  });

  it('reports an image edited by hand and an image missing from disk', () => {
    const repo = currentRepo();
    repo.write('docs/images/screenshot.png', 'retouched');
    repo.remove('docs/images/edit-dialog.png');
    expect(checkScreenshots(repo)).toEqual([
      `docs/images/edit-dialog.png is in the manifest but missing — ${FIX}`,
      `docs/images/screenshot.png differs from the manifest (edited by hand?) — ${FIX}`,
    ]);
  });

  it('reports a PNG under docs/images that the manifest does not list', () => {
    const repo = currentRepo();
    repo.write('docs/images/extra.png', 'png three');
    repo.write('docs/images/notes.txt', 'not a screenshot');
    expect(checkScreenshots(repo)).toEqual([
      `docs/images/extra.png is not in ${SCREENSHOT_MANIFEST_PATH} — ${FIX}`,
    ]);
  });

  it('reports a docs/images image shown in README.md or docs/*.md but not in the manifest', () => {
    const repo = currentRepo();
    repo.write(
      'README.md',
      [
        '![Hero](docs/images/screenshot.png)',
        '![Gone](docs/images/gone.png) and ![Badge](https://example.test/badge.svg)',
        '![Diagram](docs/diagrams/readme/design-overview.svg)',
      ].join('\n'),
    );
    repo.write('docs/ui.md', '![Edit](images/edit-dialog.png) ![Old](./images/old.png "Old")');
    repo.write('docs/decisions/0001-x.md', '![Not checked](../images/ignored.png)');
    expect(checkScreenshots(repo)).toEqual([
      `README.md shows docs/images/gone.png, which is not in ${SCREENSHOT_MANIFEST_PATH} — ${FIX}`,
      `docs/ui.md shows docs/images/old.png, which is not in ${SCREENSHOT_MANIFEST_PATH} — ${FIX}`,
    ]);
  });
});

describe('this repository', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));

  it('has docs/images in sync with the UI inputs (regenerate with the screenshots command)', () => {
    expect(checkScreenshots(fsRepo(root))).toEqual([]);
  });

  it('validates the screenshot fixtures against the shared response schemas', () => {
    const todos = JSON.parse(readFileSync(join(root, 'screenshots/fixtures/todos.json'), 'utf8'));
    expect(TodoViewListSchema.parse(todos)).toEqual(todos);
    for (const todo of todos) expect(TodoViewSchema.parse(todo)).toEqual(todo);
  });
});
