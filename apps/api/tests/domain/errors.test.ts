import { describe, expect, it } from 'vitest';
import {
  IdempotencyKeyReuseError,
  PreconditionRequiredError,
  TodoNotFoundError,
  VersionConflictError,
} from '../../src/domain/errors.js';

describe('domain errors', () => {
  it.each([
    [new TodoNotFoundError('abc'), 'TodoNotFoundError', 'Todo abc was not found'],
    [
      new VersionConflictError('abc'),
      'VersionConflictError',
      'Todo abc was modified by another request',
    ],
    [new PreconditionRequiredError(), 'PreconditionRequiredError', 'If-Match header is required'],
    [
      new IdempotencyKeyReuseError('k1'),
      'IdempotencyKeyReuseError',
      'Idempotency-Key k1 was already used with a different request',
    ],
  ])('%s has a stable name and message', (error, name, message) => {
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
    expect(error.message).toBe(message);
  });

  it('keeps the identifiers for error mapping', () => {
    expect(new TodoNotFoundError('abc').todoId).toBe('abc');
    expect(new VersionConflictError('abc').todoId).toBe('abc');
    expect(new IdempotencyKeyReuseError('k1').key).toBe('k1');
  });
});
