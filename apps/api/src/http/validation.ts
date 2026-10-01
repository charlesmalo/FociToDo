import { toFieldErrors, type FieldError } from '@foci/shared';
import type { z } from 'zod';

export class RequestValidationError extends Error {
  override readonly name = 'RequestValidationError';

  constructor(readonly errors: FieldError[]) {
    super('Request validation failed');
  }
}

export function parseRequest<S extends z.ZodType>(
  schema: S,
  value: unknown,
  prefix?: string,
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new RequestValidationError(toFieldErrors(result.error, prefix));
  return result.data;
}

export function parseOptionalHeader<S extends z.ZodType>(
  schema: S,
  value: string | undefined,
  name: string,
): z.output<S> | undefined {
  return value === undefined ? undefined : parseRequest(schema, value, name);
}
