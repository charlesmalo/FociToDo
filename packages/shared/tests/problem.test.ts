import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PROBLEM_TYPES, ProblemSchema, toFieldErrors } from '../src/problem.js';

function zodError(schema: z.ZodType, value: unknown): z.ZodError {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected a validation failure');
  return result.error;
}

describe('PROBLEM_TYPES', () => {
  it('uses distinct /problems/ URIs', () => {
    const values = Object.values(PROBLEM_TYPES);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) expect(value).toMatch(/^\/problems\/[a-z-]+$/);
  });
});

describe('ProblemSchema', () => {
  it('accepts a minimal problem', () => {
    expect(
      ProblemSchema.parse({ type: PROBLEM_TYPES.notFound, title: 'Not found', status: 404 }),
    ).toEqual({ type: '/problems/not-found', title: 'Not found', status: 404 });
  });

  it('accepts a problem with field errors', () => {
    const problem = {
      type: PROBLEM_TYPES.validation,
      title: 'Validation failed',
      status: 400,
      detail: 'Request is invalid',
      instance: '/api/todos',
      errors: [{ field: 'title', message: 'Title is required' }],
    };
    expect(ProblemSchema.parse(problem)).toEqual(problem);
  });

  it('rejects non-error statuses', () => {
    expect(ProblemSchema.safeParse({ type: 'x', title: 'x', status: 200 }).success).toBe(false);
  });
});

describe('toFieldErrors', () => {
  it('joins nested paths with dots', () => {
    const error = zodError(z.object({ a: z.object({ b: z.string() }) }), { a: { b: 1 } });
    expect(toFieldErrors(error)).toEqual([{ field: 'a.b', message: expect.any(String) }]);
  });

  it('uses null for a root-level issue without prefix', () => {
    const error = zodError(z.string(), 1);
    expect(toFieldErrors(error)).toEqual([{ field: null, message: expect.any(String) }]);
  });

  it('uses the prefix for a root-level issue', () => {
    const error = zodError(z.string(), 1);
    expect(toFieldErrors(error, 'If-Match')).toEqual([
      { field: 'If-Match', message: expect.any(String) },
    ]);
  });

  it('prefixes nested paths', () => {
    const error = zodError(z.object({ id: z.string() }), { id: 1 });
    expect(toFieldErrors(error, 'params')).toEqual([
      { field: 'params.id', message: expect.any(String) },
    ]);
  });

  it('reports each unrecognized key as its own field error', () => {
    const error = zodError(z.strictObject({ title: z.string() }), {
      title: 'x',
      dueDat: 1,
      foo: 2,
    });
    expect(toFieldErrors(error)).toEqual([
      { field: 'dueDat', message: 'Unknown field' },
      { field: 'foo', message: 'Unknown field' },
    ]);
  });
});
