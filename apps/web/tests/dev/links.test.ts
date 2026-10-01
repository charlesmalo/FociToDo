import { describe, expect, it } from 'vitest';
import { REPO_URL, isExternalOrAppLink, linkTarget, resolveRepoPath } from '../../src/dev/links';

describe('resolveRepoPath', () => {
  it('resolves relative paths against the current document', () => {
    expect(resolveRepoPath('docs/api.md', './concurrency.md')).toBe('docs/concurrency.md');
    expect(resolveRepoPath('docs/decisions/README.md', '../testing.md')).toBe('docs/testing.md');
    expect(resolveRepoPath('README.md', 'docs/images/screenshot.png')).toBe(
      'docs/images/screenshot.png',
    );
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
