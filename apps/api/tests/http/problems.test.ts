import { describe, expect, it } from 'vitest';
import { PROBLEM_TYPES } from '@foci/shared';
import {
  IdempotencyKeyReuseError,
  PreconditionRequiredError,
  TodoNotFoundError,
  VersionConflictError,
} from '../../src/domain/errors.js';
import { toProblem } from '../../src/http/problems.js';
import { RequestValidationError } from '../../src/http/validation.js';

/** Shape of the errors thrown by Express's JSON body parser (http-errors). */
const parserError = (properties: Record<string, unknown>) =>
  Object.assign(new Error('parser message'), properties);

describe('toProblem', () => {
  it('maps validation errors to 400 with field errors', () => {
    const errors = [{ field: 'title', message: 'Title is required' }];
    expect(toProblem(new RequestValidationError(errors))).toEqual({
      type: PROBLEM_TYPES.validation,
      title: 'Validation failed',
      status: 400,
      detail: 'The request contains invalid fields',
      errors,
    });
  });

  it.each([
    [new TodoNotFoundError('a'), 404, PROBLEM_TYPES.notFound],
    [new VersionConflictError('a'), 412, PROBLEM_TYPES.versionConflict],
    [new IdempotencyKeyReuseError('k'), 422, PROBLEM_TYPES.idempotencyKeyReuse],
    [new PreconditionRequiredError(), 428, PROBLEM_TYPES.preconditionRequired],
  ])('maps %s', (error, status, type) => {
    expect(toProblem(error)).toMatchObject({ status, type, detail: expect.any(String) });
  });

  it('maps malformed JSON to 400', () => {
    const error = parserError({ status: 400, expose: true, type: 'entity.parse.failed' });
    expect(toProblem(error)).toMatchObject({ status: 400, type: PROBLEM_TYPES.malformedJson });
  });

  it('maps an oversized body to 413', () => {
    const error = parserError({ status: 413, expose: true, type: 'entity.too.large' });
    expect(toProblem(error)).toMatchObject({ status: 413, type: PROBLEM_TYPES.payloadTooLarge });
  });

  it('keeps the status of other exposed client errors (e.g. 415 unsupported charset)', () => {
    const error = parserError({ status: 415, expose: true, type: 'charset.unsupported' });
    expect(toProblem(error)).toEqual({
      type: PROBLEM_TYPES.badRequest,
      title: 'Bad request',
      status: 415,
      detail: 'parser message',
    });
  });

  it.each([
    ['a non-Error value', 'boom'],
    ['an Error without status', new Error('x')],
    ['a non-numeric status', parserError({ status: '400', expose: true })],
    ['a status below 400', parserError({ status: 302, expose: true })],
    ['a server status', parserError({ status: 503, expose: true })],
    ['an unexposed error', parserError({ status: 400 })],
    ['an explicitly unexposed error', parserError({ status: 400, expose: false })],
  ])('maps %s to a generic 500', (_label, error) => {
    expect(toProblem(error)).toEqual({
      type: PROBLEM_TYPES.internal,
      title: 'Internal server error',
      status: 500,
      detail: 'An unexpected error occurred',
    });
  });
});
