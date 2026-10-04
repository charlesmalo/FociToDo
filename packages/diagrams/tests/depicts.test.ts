import { describe, expect, it } from 'vitest';
import { checkDepicts, DEPICTS_PATH, depictsStamps, parseDepicts } from '../src/depicts.js';
import { extractDiagrams } from '../src/extract.js';
import { hashFiles } from '../src/hash.js';
import { buildManifest } from '../src/manifest.js';
import { memoryRepo } from './support/memoryRepo.js';

const FIX = 'run: docker compose --profile docs run --rm --build diagrams';

const diagrams = extractDiagrams(
  'docs/api.md',
  '## List\n```mermaid\nsequenceDiagram\n```\n## Idea\n```mermaid\nflowchart LR\n```\n',
);

const declared = { 'api/list': ['src/routes.ts', 'src/service.ts'], 'api/idea': [] };

/** A repository whose two diagrams are declared and whose sources exist. */
function currentRepo(depicts: Record<string, string[]> = declared) {
  return memoryRepo({
    [DEPICTS_PATH]: JSON.stringify(depicts),
    'src/routes.ts': 'routes',
    'src/service.ts': 'service',
  });
}

describe('parseDepicts', () => {
  it('reads an object of diagram id → file list', () => {
    expect(parseDepicts('{"a/b":["x.ts"],"c/d":[]}')).toEqual({ 'a/b': ['x.ts'], 'c/d': [] });
  });

  it.each([
    ['not json', `${DEPICTS_PATH} is not JSON`],
    ['null', `${DEPICTS_PATH} must be an object mapping diagram ids to file lists`],
    ['[]', `${DEPICTS_PATH} must be an object mapping diagram ids to file lists`],
    ['"x"', `${DEPICTS_PATH} must be an object mapping diagram ids to file lists`],
    ['{"a/b":"x.ts"}', `${DEPICTS_PATH}: a/b must map to a list of file paths`],
    ['{"a/b":[1]}', `${DEPICTS_PATH}: a/b must map to a list of file paths`],
  ])('rejects %s', (text, message) => {
    expect(() => parseDepicts(text)).toThrow(message);
  });
});

describe('depictsStamps', () => {
  it('stamps each diagram with the hash of its sorted files, and [] with the empty list', () => {
    const repo = currentRepo({ 'api/list': ['src/service.ts', 'src/routes.ts'], 'api/idea': [] });
    expect(depictsStamps(repo, diagrams)).toEqual(
      new Map([
        ['api/list', hashFiles(repo, ['src/routes.ts', 'src/service.ts'])],
        ['api/idea', hashFiles(repo, [])],
      ]),
    );
  });

  it('names the file when the declarations are missing', () => {
    expect(() => depictsStamps(memoryRepo(), diagrams)).toThrow(`${DEPICTS_PATH} is missing`);
  });

  it('names a diagram without a declaration', () => {
    const repo = currentRepo({ 'api/list': [] });
    expect(() => depictsStamps(repo, diagrams)).toThrow(`api/idea: no entry in ${DEPICTS_PATH}`);
  });

  it('names a depicted file that was deleted or renamed instead of crashing', () => {
    const repo = currentRepo();
    repo.remove('src/service.ts');
    expect(() => depictsStamps(repo, diagrams)).toThrow(
      'api/list: depicts src/service.ts, which does not exist',
    );
  });
});

describe('checkDepicts', () => {
  const stamped = (repo: ReturnType<typeof currentRepo>) =>
    buildManifest(diagrams, depictsStamps(repo, diagrams));

  it('passes when every diagram is declared and its stamp matches its sources', () => {
    const repo = currentRepo();
    expect(checkDepicts(repo, diagrams, stamped(repo))).toEqual([]);
  });

  it('reports a diagram whose depicted sources changed since it was stamped', () => {
    const repo = currentRepo();
    const manifest = stamped(repo);
    repo.write('src/routes.ts', 'routes, changed');
    expect(checkDepicts(repo, diagrams, manifest)).toEqual([
      `api/list: its depicted sources changed — review the diagram against the code, update it if needed, then ${FIX}`,
    ]);
  });

  it('reports undeclared diagrams, missing files and unknown diagrams', () => {
    const repo = currentRepo();
    const manifest = stamped(repo);
    repo.write(
      DEPICTS_PATH,
      JSON.stringify({ 'api/list': ['src/routes.ts', 'src/gone.ts', 'src/old.ts'], 'api/x': [] }),
    );
    expect(checkDepicts(repo, diagrams, manifest)).toEqual([
      'api/list: depicts missing file src/gone.ts',
      'api/list: depicts missing file src/old.ts',
      `api/idea: not declared in ${DEPICTS_PATH}`,
      `${DEPICTS_PATH}: unknown diagram api/x`,
    ]);
  });

  it('leaves a diagram missing from the manifest to the image check', () => {
    const repo = currentRepo();
    expect(checkDepicts(repo, diagrams, { diagrams: [] })).toEqual([]);
  });

  it('reports a missing or unreadable declarations file', () => {
    const repo = currentRepo();
    const manifest = stamped(repo);
    repo.write(DEPICTS_PATH, '[]');
    expect(checkDepicts(repo, diagrams, manifest)).toEqual([
      `${DEPICTS_PATH} must be an object mapping diagram ids to file lists`,
    ]);
    repo.remove(DEPICTS_PATH);
    expect(checkDepicts(repo, diagrams, manifest)).toEqual([
      `${DEPICTS_PATH} is missing — declare the source files each diagram depicts`,
    ]);
  });
});
