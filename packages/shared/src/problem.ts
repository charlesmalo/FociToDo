import { z } from 'zod';

/** RFC 9457 problem `type` identifiers used by the API. */
export const PROBLEM_TYPES = {
  validation: '/problems/validation-error',
  malformedJson: '/problems/malformed-json',
  badRequest: '/problems/bad-request',
  notFound: '/problems/not-found',
  versionConflict: '/problems/version-conflict',
  payloadTooLarge: '/problems/payload-too-large',
  idempotencyKeyReuse: '/problems/idempotency-key-reuse',
  preconditionRequired: '/problems/precondition-required',
  internal: '/problems/internal',
} as const;

export type ProblemType = (typeof PROBLEM_TYPES)[keyof typeof PROBLEM_TYPES];

export const FieldErrorSchema = z.object({
  field: z.string().nullable(),
  message: z.string(),
});

export type FieldError = z.infer<typeof FieldErrorSchema>;

export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z.array(FieldErrorSchema).optional(),
});

export type Problem = z.infer<typeof ProblemSchema>;

/** Flattens a Zod error into field errors that both the API and the web form can display. */
export function toFieldErrors(error: z.ZodError, prefix?: string): FieldError[] {
  return error.issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        field: joinPath(prefix, [...issue.path, key]),
        message: 'Unknown field',
      }));
    }
    return [{ field: joinPath(prefix, issue.path), message: issue.message }];
  });
}

function joinPath(prefix: string | undefined, path: readonly PropertyKey[]): string | null {
  const parts = prefix === undefined ? path.map(String) : [prefix, ...path.map(String)];
  return parts.length === 0 ? null : parts.join('.');
}
