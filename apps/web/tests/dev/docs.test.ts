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
    expect(library.assetUrl('README.md', 'https://img.shields.io/x.svg')).toBe(
      'https://img.shields.io/x.svg',
    );
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
