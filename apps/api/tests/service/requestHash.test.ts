import { describe, expect, it } from 'vitest';
import { hashCreateRequest } from '../../src/service/requestHash.js';

describe('hashCreateRequest', () => {
  it('returns a sha256 hex digest', () => {
    expect(hashCreateRequest({ title: 'Buy milk' })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('treats absent and null optional fields the same', () => {
    expect(hashCreateRequest({ title: 'x' })).toBe(
      hashCreateRequest({ title: 'x', description: null, dueDate: null }),
    );
  });

  it('distinguishes different requests', () => {
    const base = hashCreateRequest({ title: 'x' });
    expect(hashCreateRequest({ title: 'y' })).not.toBe(base);
    expect(hashCreateRequest({ title: 'x', description: 'd' })).not.toBe(base);
    expect(hashCreateRequest({ title: 'x', dueDate: '2026-10-01' })).not.toBe(base);
  });

  it('does not confuse field boundaries', () => {
    expect(hashCreateRequest({ title: 'a', description: 'b' })).not.toBe(
      hashCreateRequest({ title: 'ab', description: null }),
    );
  });
});
