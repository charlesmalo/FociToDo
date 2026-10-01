import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/ApiError';

describe('ApiError', () => {
  it('uses the problem detail as message and keeps field errors', () => {
    const errors = [{ field: 'title', message: 'Title is required' }];
    const error = new ApiError({
      type: '/problems/validation-error',
      title: 'Validation failed',
      status: 400,
      detail: 'The request contains invalid fields',
      errors,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.message).toBe('The request contains invalid fields');
    expect(error.status).toBe(400);
    expect(error.type).toBe('/problems/validation-error');
    expect(error.errors).toEqual(errors);
  });

  it('falls back to the title and an empty error list', () => {
    const error = new ApiError({ type: 'about:blank', title: 'Bad Gateway', status: 502 });
    expect(error.message).toBe('Bad Gateway');
    expect(error.errors).toEqual([]);
  });
});
