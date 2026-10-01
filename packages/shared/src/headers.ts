import { z } from 'zod';

/** Largest version accepted in If-Match; keeps values well inside Postgres `integer`. */
export const MAX_VERSION = 999_999_999;

export const IfMatchSchema = z
  .string()
  .regex(/^"[1-9]\d{0,8}"$/, { error: 'If-Match must be a single strong ETag such as "3"' })
  .transform((value) => Number(value.slice(1, -1)));

export const IdempotencyKeySchema = z.string().regex(/^[\x21-\x7E]{1,255}$/, {
  error: 'Idempotency-Key must be 1-255 visible ASCII characters',
});

export function toEtag(version: number): string {
  return `"${version}"`;
}
