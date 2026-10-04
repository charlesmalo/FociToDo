import { describe, expect, it } from 'vitest';
import { hashFiles, sha256 } from '../src/hash.js';
import { memoryRepo } from './support/memoryRepo.js';

describe('sha256', () => {
  it('hashes text and bytes alike, as lowercase hex', () => {
    const empty = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(sha256('')).toBe(empty);
    expect(sha256(new Uint8Array())).toBe(empty);
    expect(sha256('abc')).toBe(sha256(new TextEncoder().encode('abc')));
  });
});

describe('hashFiles', () => {
  const repo = () => memoryRepo({ 'a.ts': 'one', 'b.ts': 'two' });

  it('is the sha256 of one "path NUL sha256(bytes)" line per file, in the given order', () => {
    expect(hashFiles(repo(), ['a.ts', 'b.ts'])).toBe(
      sha256(`a.ts\0${sha256('one')}\nb.ts\0${sha256('two')}\n`),
    );
    expect(hashFiles(repo(), [])).toBe(sha256(''));
  });

  it('is stable for the same bytes', () => {
    expect(hashFiles(repo(), ['a.ts', 'b.ts'])).toBe(hashFiles(repo(), ['a.ts', 'b.ts']));
  });

  it('changes when a byte changes', () => {
    const changed = repo();
    changed.write('b.ts', 'twO');
    expect(hashFiles(changed, ['a.ts', 'b.ts'])).not.toBe(hashFiles(repo(), ['a.ts', 'b.ts']));
  });

  it('changes when a path changes', () => {
    const renamed = memoryRepo({ 'a.ts': 'one', 'c.ts': 'two' });
    expect(hashFiles(renamed, ['a.ts', 'c.ts'])).not.toBe(hashFiles(repo(), ['a.ts', 'b.ts']));
  });

  it('depends on the order, so callers sort', () => {
    expect(hashFiles(repo(), ['b.ts', 'a.ts'])).not.toBe(hashFiles(repo(), ['a.ts', 'b.ts']));
  });
});
