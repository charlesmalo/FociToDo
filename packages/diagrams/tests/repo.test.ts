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
