import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/api/ApiError';
import { createQueryClient, shouldRetry } from '../src/queryClient';

const apiError = (status: number) => new ApiError({ type: 'x', title: 'x', status });

describe('shouldRetry', () => {
  it('never retries client errors', () => {
    expect(shouldRetry(0, apiError(404))).toBe(false);
  });

  it('retries server and network errors twice', () => {
    expect(shouldRetry(0, apiError(503))).toBe(true);
    expect(shouldRetry(1, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(2, new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('applies the retry policy to queries and disables mutation retries', () => {
    const options = createQueryClient().getDefaultOptions();
    expect(options.queries?.retry).toBe(shouldRetry);
    expect(options.mutations?.retry).toBe(false);
  });
});
