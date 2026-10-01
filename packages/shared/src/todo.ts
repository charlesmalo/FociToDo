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

const DUE_DATE_ERROR = 'Due date must be a real date in YYYY-MM-DD format';

/** ISO 8601 allows year 0000, but Postgres `date` has no year 0 — reject it like any bad date. */
const DueDateSchema = z.iso
  .date({ error: DUE_DATE_ERROR })
  .refine((value) => !value.startsWith('0000'), { error: DUE_DATE_ERROR })
  .nullable();

const OBJECT_BODY = { error: 'Request body must be a JSON object' };

export const CreateTodoSchema = z.strictObject(
  {
    title: TitleSchema,
    description: DescriptionSchema.optional(),
    dueDate: DueDateSchema.optional(),
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
      dueDate: DueDateSchema.optional(),
    },
    OBJECT_BODY,
  )
  .refine((patch) => Object.keys(patch).length > 0, {
    error: 'At least one of title, description or dueDate is required',
  });

export type UpdateTodoInput = z.input<typeof UpdateTodoSchema>;
export type UpdateTodo = z.output<typeof UpdateTodoSchema>;

export const TodoViewSchema = z.object({
  id: TodoIdSchema,
  title: z.string(),
  description: z.string().nullable(),
  dueDate: z.iso.date().nullable(),
  isCompleted: z.boolean(),
  createdAt: z.iso.datetime(),
  version: z.int().positive(),
  isOverdue: z.boolean(),
});

export type TodoView = z.infer<typeof TodoViewSchema>;

export const TodoViewListSchema = z.array(TodoViewSchema);
