import { createHash } from 'node:crypto';
import type { CreateTodo } from '@foci/shared';

/**
 * Fingerprint of a create request after validation/normalisation, used to detect an
 * Idempotency-Key reused with a different payload. A JSON array keeps field boundaries explicit.
 */
export function hashCreateRequest(input: CreateTodo): string {
  const canonical = JSON.stringify([input.title, input.description ?? null, input.dueDate ?? null]);
  return createHash('sha256').update(canonical).digest('hex');
}
