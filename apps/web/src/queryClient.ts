import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/ApiError';

/** Client errors (4xx) are answers, not glitches: retry only network/server failures, twice. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 5_000 },
      mutations: { retry: false },
    },
  });
}
