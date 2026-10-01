import { describe, expect, it } from 'vitest';
import { IdempotencyKeySchema, IfMatchSchema, MAX_VERSION, toEtag } from '../src/headers.js';

describe('IfMatchSchema', () => {
  it.each([
    ['"1"', 1],
    ['"42"', 42],
    [`"${MAX_VERSION}"`, MAX_VERSION],
  ])('parses %s', (header, version) => {
    expect(IfMatchSchema.parse(header)).toBe(version);
  });

  it.each(['"0"', '"01"', '"-1"', 'W/"3"', '*', '3', '"3", "4"', '"1000000000"', '""'])(
    'rejects %s',
    (header) => {
      const result = IfMatchSchema.safeParse(header);
      expect(result.error?.issues[0]?.message).toBe(
        'If-Match must be a single strong ETag such as "3"',
      );
    },
  );
});

describe('IdempotencyKeySchema', () => {
  it.each(['a', 'b3c1e2f0-0000-4000-8000-000000000001', 'x'.repeat(255)])('accepts %s', (key) => {
    expect(IdempotencyKeySchema.parse(key)).toBe(key);
  });

  it.each(['', 'has space', 'é', 'x'.repeat(256)])('rejects %j', (key) => {
    expect(IdempotencyKeySchema.safeParse(key).error?.issues[0]?.message).toBe(
      'Idempotency-Key must be 1-255 visible ASCII characters',
    );
  });
});

describe('toEtag', () => {
  it('formats a strong ETag', () => {
    expect(toEtag(7)).toBe('"7"');
  });
});
