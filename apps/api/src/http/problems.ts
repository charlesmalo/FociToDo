import { PROBLEM_TYPES, type Problem } from '@foci/shared';
import {
  IdempotencyKeyReuseError,
  PreconditionRequiredError,
  TodoNotFoundError,
  VersionConflictError,
} from '../domain/errors.js';
import { RequestValidationError } from './validation.js';

/** Errors raised by Express's JSON body parser (http-errors with `expose: true`). */
interface HttpClientError extends Error {
  status: number;
  type?: string;
}

function isHttpClientError(error: unknown): error is HttpClientError {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500 &&
    'expose' in error &&
    error.expose === true
  );
}

function clientErrorProblem(error: HttpClientError): Problem {
  if (error.type === 'entity.parse.failed') {
    return {
      type: PROBLEM_TYPES.malformedJson,
      title: 'Malformed JSON',
      status: 400,
      detail: 'The request body is not valid JSON',
    };
  }
  if (error.type === 'entity.too.large') {
    return {
      type: PROBLEM_TYPES.payloadTooLarge,
      title: 'Payload too large',
      status: 413,
      detail: 'The request body exceeds 16 kB',
    };
  }
  return {
    type: PROBLEM_TYPES.badRequest,
    title: 'Bad request',
    status: error.status,
    detail: error.message,
  };
}

/** The single place where errors become RFC 9457 problem details. */
export function toProblem(error: unknown): Problem {
  if (error instanceof RequestValidationError) {
    return {
      type: PROBLEM_TYPES.validation,
      title: 'Validation failed',
      status: 400,
      detail: 'The request contains invalid fields',
      errors: error.errors,
    };
  }
  if (error instanceof TodoNotFoundError) {
    return { type: PROBLEM_TYPES.notFound, title: 'Not found', status: 404, detail: error.message };
  }
  if (error instanceof VersionConflictError) {
    return {
      type: PROBLEM_TYPES.versionConflict,
      title: 'Version conflict',
      status: 412,
      detail: `${error.message}; fetch the latest version and retry`,
    };
  }
  if (error instanceof IdempotencyKeyReuseError) {
    return {
      type: PROBLEM_TYPES.idempotencyKeyReuse,
      title: 'Idempotency key reused',
      status: 422,
      detail: error.message,
    };
  }
  if (error instanceof PreconditionRequiredError) {
    return {
      type: PROBLEM_TYPES.preconditionRequired,
      title: 'Precondition required',
      status: 428,
      detail: 'Send If-Match with the ETag you last received',
    };
  }
  if (isHttpClientError(error)) return clientErrorProblem(error);
  return {
    type: PROBLEM_TYPES.internal,
    title: 'Internal server error',
    status: 500,
    detail: 'An unexpected error occurred',
  };
}
