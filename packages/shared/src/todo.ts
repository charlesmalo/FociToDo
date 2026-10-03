import { z } from 'zod';

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

export const TodoIdSchema = z.uuid({ error: 'Must be a valid UUID' });

/** Postgres `text` cannot store U+0000, so it must be a validation error, not a 500. */
const hasNoNul = (value: string) => !value.includes('\u0000');

const TitleSchema = z
  .string({
    error: (issue) => (issue.input === undefined ? 'Title is required' : 'Title must be a string'),
  })
  .trim()
  .min(1, { error: 'Title is required' })
  .max(TITLE_MAX_LENGTH, { error: `Title must be at most ${TITLE_MAX_LENGTH} characters` })
  .refine(hasNoNul, { error: 'Title must not contain control character U+0000' });

const DescriptionSchema = z
  .string({ error: 'Description must be a string' })
  .max(DESCRIPTION_MAX_LENGTH, {
    error: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
  })
  .refine(hasNoNul, { error: 'Description must not contain control character U+0000' })
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

const OBJECT_BODY = { error: 'Request body must be a JSON object' };

export const CreateTodoSchema = z.strictObject(
  {
    title: TitleSchema,
    description: DescriptionSchema.optional(),
    dueAt: DueAtSchema.optional(),
  },
  OBJECT_BODY,
);

export type CreateTodoInput = z.input<typeof CreateTodoSchema>;
export type CreateTodo = z.output<typeof CreateTodoSchema>;

export const UpdateTodoSchema = z
  .strictObject(
    {
      title: TitleSchema.optional(),
      description: DescriptionSchema.optional(),
      dueAt: DueAtSchema.optional(),
    },
    OBJECT_BODY,
  )
  .refine((patch) => Object.keys(patch).length > 0, {
    error: 'At least one of title, description or dueAt is required',
  });

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
