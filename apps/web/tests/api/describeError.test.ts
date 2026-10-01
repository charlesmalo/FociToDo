import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/ApiError';
import { describeError } from '../../src/api/describeError';

describe('describeError', () => {
  it('uses the API error message', () => {
    expect(
      describeError(new ApiError({ type: 'x', title: 'Not found', status: 404, detail: 'Gone' })),
    ).toBe('Gone');
  });

  it('describes anything else as a connectivity problem', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toBe(
      'Could not reach the server. Check your connection and try again.',
    );
  });
});
