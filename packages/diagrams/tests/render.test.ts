import { describe, expect, it, vi } from 'vitest';
import { checkImages, collectDiagrams } from '../src/check.js';
import { DEPICTS_PATH } from '../src/depicts.js';
import { hashFiles } from '../src/hash.js';
import { parseManifest } from '../src/manifest.js';
import { renderRepository } from '../src/render.js';
import { memoryRepo } from './support/memoryRepo.js';

const docs = {
  'README.md': '## Design overview\n```mermaid\nflowchart LR\n  A-->B\n```\n',
  'docs/api.md': '### List — `GET /api/todos`\n```mermaid\nsequenceDiagram\n```\n',
  [DEPICTS_PATH]: JSON.stringify({
    'readme/design-overview': [],
    'api/list-get-api-todos': ['src/routes.ts'],
  }),
  'src/routes.ts': 'routes',
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

  it('stamps each diagram with the hash of the files it depicts', async () => {
    const repo = memoryRepo(docs);
    const manifest = await renderRepository(repo, async () => '<svg/>');
    expect(manifest.diagrams.map(({ id, depictsHash }) => [id, depictsHash])).toEqual([
      ['readme/design-overview', hashFiles(repo, [])],
      ['api/list-get-api-todos', hashFiles(repo, ['src/routes.ts'])],
    ]);
  });

  it('refuses to render or write a manifest while a diagram has no declaration', async () => {
    const repo = memoryRepo({
      ...docs,
      [DEPICTS_PATH]: JSON.stringify({ 'readme/design-overview': [] }),
    });
    const render = vi.fn(async () => '<svg/>');
    await expect(renderRepository(repo, render)).rejects.toThrow(
      `api/list-get-api-todos: no entry in ${DEPICTS_PATH}`,
    );
    expect(render).not.toHaveBeenCalled();
    expect(repo.exists('docs/diagrams/manifest.json')).toBe(false);
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
