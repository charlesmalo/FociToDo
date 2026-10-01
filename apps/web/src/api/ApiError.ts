import type { FieldError, Problem } from '@foci/shared';

/** An HTTP error response from the API, carrying its RFC 9457 problem details. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly type: string;
  readonly errors: FieldError[];

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.status = problem.status;
    this.type = problem.type;
    this.errors = problem.errors ?? [];
  }
}
