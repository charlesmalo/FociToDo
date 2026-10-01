export class TodoNotFoundError extends Error {
  override readonly name = 'TodoNotFoundError';

  constructor(readonly todoId: string) {
    super(`Todo ${todoId} was not found`);
  }
}

export class VersionConflictError extends Error {
  override readonly name = 'VersionConflictError';

  constructor(readonly todoId: string) {
    super(`Todo ${todoId} was modified by another request`);
  }
}

export class PreconditionRequiredError extends Error {
  override readonly name = 'PreconditionRequiredError';

  constructor() {
    super('If-Match header is required');
  }
}

export class IdempotencyKeyReuseError extends Error {
  override readonly name = 'IdempotencyKeyReuseError';

  constructor(readonly key: string) {
    super(`Idempotency-Key ${key} was already used with a different request`);
  }
}
