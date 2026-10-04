import { CreateTodoSchema } from '@foci/shared';
import { describe, expect, it } from 'vitest';
import { hashCreateRequest } from '../../src/service/requestHash.js';

describe('hashCreateRequest', () => {
  it('returns a sha256 hex digest', () => {
    expect(hashCreateRequest({ title: 'Buy milk' })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('treats absent and null optional fields the same', () => {
    expect(hashCreateRequest({ title: 'x' })).toBe(
      hashCreateRequest({ title: 'x', description: null, dueAt: null }),
    );
  });

  it('distinguishes different requests', () => {
    const base = hashCreateRequest({ title: 'x' });
    expect(hashCreateRequest({ title: 'y' })).not.toBe(base);
    expect(hashCreateRequest({ title: 'x', description: 'd' })).not.toBe(base);
    expect(hashCreateRequest({ title: 'x', dueAt: '2026-10-01T00:00:00.000Z' })).not.toBe(base);
  });

  it('hashes the same deadline equally whatever offset it was written with', () => {
    const parse = (dueAt: string) => CreateTodoSchema.parse({ title: 'x', dueAt });
    expect(hashCreateRequest(parse('2026-10-03T18:00:00-04:00'))).toBe(
      hashCreateRequest(parse('2026-10-03T22:00:00Z')),
    );
  });

  it('hashes dueDate and the equivalent dueAt as the same request', () => {
    expect(hashCreateRequest(CreateTodoSchema.parse({ title: 'x', dueDate: '2030-01-02' }))).toBe(
      hashCreateRequest(CreateTodoSchema.parse({ title: 'x', dueAt: '2030-01-02T23:59:59Z' })),
    );
  });

  it('hashes different instants differently', () => {
    const parse = (dueAt: string) => CreateTodoSchema.parse({ title: 'x', dueAt });
    expect(hashCreateRequest(parse('2026-10-03T22:00:00Z'))).not.toBe(
      hashCreateRequest(parse('2026-10-03T22:00:00.001Z')),
    );
  });

  it('does not confuse field boundaries', () => {
    expect(hashCreateRequest({ title: 'a', description: 'b' })).not.toBe(
      hashCreateRequest({ title: 'ab', description: null }),
    );
  });
});
