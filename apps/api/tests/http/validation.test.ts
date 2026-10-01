import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  RequestValidationError,
  parseOptionalHeader,
  parseRequest,
} from '../../src/http/validation.js';

const Schema = z.strictObject({ title: z.string().trim().min(1, { error: 'Required' }) });

describe('parseRequest', () => {
  it('returns the parsed output', () => {
    expect(parseRequest(Schema, { title: ' x ' })).toEqual({ title: 'x' });
  });

  it('throws RequestValidationError with field errors', () => {
    try {
      parseRequest(Schema, { title: '' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RequestValidationError);
      expect((error as RequestValidationError).errors).toEqual([
        { field: 'title', message: 'Required' },
      ]);
      expect((error as Error).name).toBe('RequestValidationError');
    }
  });

  it('prefixes field names', () => {
    expect(() => parseRequest(z.uuid(), 'nope', 'id')).toThrow(
      expect.objectContaining({ errors: [{ field: 'id', message: expect.any(String) }] }),
    );
  });
});

describe('parseOptionalHeader', () => {
  it('returns undefined when the header is absent', () => {
    expect(parseOptionalHeader(z.string().min(2), undefined, 'X-Test')).toBeUndefined();
  });

  it('parses a present header', () => {
    expect(parseOptionalHeader(z.string().min(2), 'ok', 'X-Test')).toBe('ok');
  });

  it('reports errors against the header name', () => {
    expect(() => parseOptionalHeader(z.string().min(2), 'x', 'X-Test')).toThrow(
      expect.objectContaining({ errors: [{ field: 'X-Test', message: expect.any(String) }] }),
    );
  });
});
