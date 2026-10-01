import { z } from 'zod';

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

export const TodoIdSchema = z.uuid({ error: 'Must be a valid UUID' });

const TitleSchema = z
  .string({
    error: (issue) => (issue.input === undefined ? 'Title is required' : 'Title must be a string'),
  })
  .trim()
  .min(1, { error: 'Title is required' })
  .max(TITLE_MAX_LENGTH, { error: `Title must be at most ${TITLE_MAX_LENGTH} characters` });

const DescriptionSchema = z
  .string({ error: 'Description must be a string' })
  .max(DESCRIPTION_MAX_LENGTH, {
    error: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
  })
  .nullable()
  .transform((value) => (value === '' ? null : value));

const DueDateSchema = z.iso
  .date({ error: 'Due date must be a real date in YYYY-MM-DD format' })
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
