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
const readme =
  '| List | [SVG](docs/diagrams/api/list-get-api-todos.svg) | [Mermaid](docs/api.md#list--get-apitodos) |';

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

  it('reports an unreadable manifest and stops checking images', () => {
    const repo = currentRepo();
    repo.write('docs/diagrams/manifest.json', 'not json');
    expect(checkImages(repo, collectDiagrams(repo))).toEqual([
      `docs/diagrams/manifest.json is unreadable (docs/diagrams/manifest.json is not JSON) — ${FIX}`,
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
    repo.write(
      'docs/api.md',
      ['### List — `GET /api/todos`', '```mermaid', 'sequenceDiagram', '```'].join('\n'),
    );
    const problems = checkRepository(repo);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(
      /^docs\/api\.md:2: api\/list-get-api-todos must be shown as its image/,
    );
    expect(problems[1]).toMatch(
      /^README\.md: the diagram map has no row for api\/list-get-api-todos/,
    );
  });
});
