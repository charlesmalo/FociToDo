import { z } from 'zod';

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

export const TodoIdSchema = z.uuid({ error: 'Must be a valid UUID' });

/** Postgres `text` cannot store U+0000, so it must be a validation error, not a 500. */
const hasNoNul = (value: string) => !value.includes('\u0000');

/** A lone UTF-16 surrogate cannot be stored as `jsonb` (idempotency records), so it must be a 400, not a 500. */
const hasNoLoneSurrogate = (value: string) => !/\p{Cs}/u.test(value);

const TitleSchema = z
  .string({
    error: (issue) => (issue.input === undefined ? 'Title is required' : 'Title must be a string'),
  })
  .trim()
  .min(1, { error: 'Title is required' })
  .max(TITLE_MAX_LENGTH, { error: `Title must be at most ${TITLE_MAX_LENGTH} characters` })
  .refine(hasNoNul, { error: 'Title must not contain control character U+0000' })
  .refine(hasNoLoneSurrogate, { error: 'Title must not contain an unpaired surrogate character' });

const DescriptionSchema = z
  .string({ error: 'Description must be a string' })
  .max(DESCRIPTION_MAX_LENGTH, {
    error: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
  })
  .refine(hasNoNul, { error: 'Description must not contain control character U+0000' })
  .refine(hasNoLoneSurrogate, {
    error: 'Description must not contain an unpaired surrogate character',
  })
  .nullable()
  .transform((value) => (value === '' ? null : value));

export const DUE_AT_ERROR =
  'Due must be a date and time with a timezone offset, e.g. 2026-10-03T18:00:00Z';

/** An exact moment: RFC 3339 with an offset (never a bare date or local time), normalised to UTC. */
const DueAtSchema = z.iso
  .datetime({ offset: true, error: DUE_AT_ERROR })
  .refine(
    (value) => {
      const year = new Date(value).getUTCFullYear();
      return year >= 1 && year <= 9999;
    },
    // Zod 4 keeps running refinements after a format failure; skip them so there is one issue.
    { error: DUE_AT_ERROR, when: (payload) => payload.issues.length === 0 },
  )
  .transform((value) => new Date(value).toISOString())
  .nullable()
  .describe(
    'Deadline as an RFC 3339 date-time with an offset or Z (e.g. 2026-10-03T18:00:00Z); responses are in UTC. null clears it.',
  );

export const DUE_DATE_ERROR = 'Due date must be a real date in YYYY-MM-DD format';
export const DUE_BOTH_ERROR = 'Send either dueDate or dueAt, not both';

/** A date-only deadline is the last second of that day in UTC (the rule migration 1759190400002 used). */
export function endOfUtcDay(date: string): string {
  return `${date}T23:59:59.000Z`;
}

/** The brief's date-only deadline. ISO 8601 allows year 0000; the deadline range is 0001–9999. */
const DueDateSchema = z.iso
  .date({ error: DUE_DATE_ERROR })
  .refine((value) => !value.startsWith('0000'), {
    error: DUE_DATE_ERROR,
    when: (payload) => payload.issues.length === 0,
  })
  .nullable()
  .describe(
    "The brief's date-only deadline, YYYY-MM-DD: due at 23:59:59 UTC that day. null clears it. Send this or dueAt, not both.",
  );

interface DeadlineFields {
  dueDate?: string | null;
  dueAt?: string | null;
}

/** Both spellings of the deadline are one field; sending both is ambiguous even if one is null. */
function rejectBothDeadlines(value: DeadlineFields, ctx: z.RefinementCtx): void {
  if ('dueDate' in value && 'dueAt' in value) {
    ctx.addIssue({ code: 'custom', path: ['dueDate'], message: DUE_BOTH_ERROR });
  }
}

/** `dueDate` becomes the single internal `dueAt`, so nothing past validation sees two fields. */
function toDueAt<T extends DeadlineFields>({ dueDate, ...rest }: T): Omit<T, 'dueDate'> {
  if (dueDate === undefined) return rest;
  return { ...rest, dueAt: dueDate === null ? null : endOfUtcDay(dueDate) };
}

const OBJECT_BODY = { error: 'Request body must be a JSON object' };

export const CreateTodoSchema = z
  .strictObject(
    {
      title: TitleSchema,
      description: DescriptionSchema.optional(),
      dueDate: DueDateSchema.optional(),
      dueAt: DueAtSchema.optional(),
    },
    OBJECT_BODY,
  )
  .superRefine(rejectBothDeadlines)
  .transform(toDueAt);

export type CreateTodoInput = z.input<typeof CreateTodoSchema>;
export type CreateTodo = z.output<typeof CreateTodoSchema>;

export const UpdateTodoSchema = z
  .strictObject(
    {
      title: TitleSchema.optional(),
      description: DescriptionSchema.optional(),
      dueDate: DueDateSchema.optional(),
      dueAt: DueAtSchema.optional(),
    },
    OBJECT_BODY,
  )
  .refine((patch) => Object.keys(patch).length > 0, {
    error: 'At least one of title, description, dueDate or dueAt is required',
  })
  .superRefine(rejectBothDeadlines)
  .transform(toDueAt);

export type UpdateTodoInput = z.input<typeof UpdateTodoSchema>;
export type UpdateTodo = z.output<typeof UpdateTodoSchema>;

export const TodoViewSchema = z.object({
  id: TodoIdSchema,
  title: z.string(),
  description: z.string().nullable(),
  dueAt: z.iso
    .datetime()
    .nullable()
    .describe('Deadline as an RFC 3339 date-time in UTC, or null when there is none.'),
  dueDate: z.iso
    .date()
    .nullable()
    .describe('The UTC calendar date of dueAt (YYYY-MM-DD), or null when there is none.'),
  isCompleted: z.boolean(),
  createdAt: z.iso.datetime(),
  version: z.int().positive(),
  isOverdue: z.boolean().describe('Incomplete and the deadline is already in the past.'),
  isDueSoon: z
    .boolean()
    .describe('Incomplete and the deadline is within the next 24 hours (not yet passed).'),
});

export type TodoView = z.infer<typeof TodoViewSchema>;

export const TodoViewListSchema = z.array(TodoViewSchema);
