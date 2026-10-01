import { describe, expect, it } from 'vitest';
import {
  CreateTodoSchema,
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  TodoIdSchema,
  TodoViewListSchema,
  TodoViewSchema,
  UpdateTodoSchema,
} from '../src/todo.js';

const issues = (result: { success: boolean; error?: { issues: unknown[] } }) =>
  result.success ? [] : (result.error?.issues ?? []);

describe('TodoIdSchema', () => {
  it('accepts a UUID', () => {
    expect(TodoIdSchema.parse('7f3a2c1e-9b4d-4e8a-a1b2-c3d4e5f60718')).toBe(
      '7f3a2c1e-9b4d-4e8a-a1b2-c3d4e5f60718',
    );
  });

  it('rejects anything else', () => {
    expect(TodoIdSchema.safeParse('42').success).toBe(false);
  });
});

describe('CreateTodoSchema', () => {
  it('trims the title and normalises optional fields', () => {
    expect(CreateTodoSchema.parse({ title: '  Buy milk  ', description: '' })).toEqual({
      title: 'Buy milk',
      description: null,
    });
  });

  it('accepts a full payload', () => {
    expect(
      CreateTodoSchema.parse({
        title: 'Pay rent',
        description: 'Before noon',
        dueDate: '2026-10-01',
      }),
    ).toEqual({ title: 'Pay rent', description: 'Before noon', dueDate: '2026-10-01' });
  });

  it('accepts explicit nulls for optional fields', () => {
    expect(CreateTodoSchema.parse({ title: 'x', description: null, dueDate: null })).toEqual({
      title: 'x',
      description: null,
      dueDate: null,
    });
  });

  it('requires a title', () => {
    const result = CreateTodoSchema.safeParse({});
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: ['title'], message: 'Title is required' }),
    ]);
  });

  it('rejects a whitespace-only title', () => {
    const result = CreateTodoSchema.safeParse({ title: '   ' });
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: ['title'], message: 'Title is required' }),
    ]);
  });

  it('rejects a non-string title', () => {
    const result = CreateTodoSchema.safeParse({ title: 5 });
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: ['title'], message: 'Title must be a string' }),
    ]);
  });

  it('accepts a title of exactly the maximum length after trimming', () => {
    const title = 'a'.repeat(TITLE_MAX_LENGTH);
    expect(CreateTodoSchema.parse({ title: ` ${title} ` }).title).toBe(title);
  });

  it('rejects a title longer than the maximum', () => {
    const result = CreateTodoSchema.safeParse({ title: 'a'.repeat(TITLE_MAX_LENGTH + 1) });
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: ['title'], message: 'Title must be at most 200 characters' }),
    ]);
  });

  it('accepts a description of exactly the maximum length', () => {
    const description = 'd'.repeat(DESCRIPTION_MAX_LENGTH);
    expect(CreateTodoSchema.parse({ title: 'x', description }).description).toBe(description);
  });

  it('rejects a description longer than the maximum', () => {
    const result = CreateTodoSchema.safeParse({
      title: 'x',
      description: 'd'.repeat(DESCRIPTION_MAX_LENGTH + 1),
    });
    expect(issues(result)).toEqual([
      expect.objectContaining({
        path: ['description'],
        message: 'Description must be at most 2000 characters',
      }),
    ]);
  });

  it('rejects a NUL character in the title', () => {
    const result = CreateTodoSchema.safeParse({ title: 'a\u0000b' });
    expect(issues(result)).toEqual([
      expect.objectContaining({
        path: ['title'],
        message: 'Title must not contain control character U+0000',
      }),
    ]);
  });

  it('rejects a NUL character in the description', () => {
    const result = CreateTodoSchema.safeParse({ title: 'x', description: 'a\u0000b' });
    expect(issues(result)).toEqual([
      expect.objectContaining({
        path: ['description'],
        message: 'Description must not contain control character U+0000',
      }),
    ]);
  });

  it('rejects a non-string description', () => {
    const result = CreateTodoSchema.safeParse({ title: 'x', description: 3 });
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: ['description'], message: 'Description must be a string' }),
    ]);
  });

  it.each(['0001-01-01', '2000-01-01', '2028-02-29', '2026-12-31'])(
    'accepts the real date %s',
    (dueDate) => {
      expect(CreateTodoSchema.parse({ title: 'x', dueDate }).dueDate).toBe(dueDate);
    },
  );

  it.each([
    '2026-02-29',
    '2026-13-01',
    '2026-1-01',
    '2026-10-01T00:00:00Z',
    'tomorrow',
    '0000-01-01',
    '0000-02-29',
  ])('rejects the invalid date %s', (dueDate) => {
    const result = CreateTodoSchema.safeParse({ title: 'x', dueDate });
    expect(issues(result)).toEqual([
      expect.objectContaining({
        path: ['dueDate'],
        message: 'Due date must be a real date in YYYY-MM-DD format',
      }),
    ]);
  });

  it.each(['id', 'isCompleted', 'createdAt', 'version', 'isOverdue', 'dueDat'])(
    'rejects the client-supplied or unknown field %s',
    (field) => {
      const result = CreateTodoSchema.safeParse({ title: 'x', [field]: 'y' });
      expect(issues(result)).toEqual([
        expect.objectContaining({ code: 'unrecognized_keys', keys: [field] }),
      ]);
    },
  );

  it.each([undefined, null, [], 'text', 42])('rejects the non-object body %j', (body) => {
    const result = CreateTodoSchema.safeParse(body);
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: [], message: 'Request body must be a JSON object' }),
    ]);
  });
});

describe('UpdateTodoSchema', () => {
  it('accepts a single field', () => {
    expect(UpdateTodoSchema.parse({ title: ' New ' })).toEqual({ title: 'New' });
  });

  it('accepts clearing optional fields with null', () => {
    expect(UpdateTodoSchema.parse({ description: null, dueDate: null })).toEqual({
      description: null,
      dueDate: null,
    });
  });

  it('normalises an empty description to null', () => {
    expect(UpdateTodoSchema.parse({ description: '' })).toEqual({ description: null });
  });

  it('requires at least one field', () => {
    const result = UpdateTodoSchema.safeParse({});
    expect(issues(result)).toEqual([
      expect.objectContaining({
        path: [],
        message: 'At least one of title, description or dueDate is required',
      }),
    ]);
  });

  it('does not allow clearing the title', () => {
    const result = UpdateTodoSchema.safeParse({ title: null });
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: ['title'], message: 'Title must be a string' }),
    ]);
  });

  it('rejects unknown fields', () => {
    const result = UpdateTodoSchema.safeParse({ title: 'x', version: 3 });
    expect(issues(result)).toEqual([
      expect.objectContaining({ code: 'unrecognized_keys', keys: ['version'] }),
    ]);
  });
});

describe('TodoViewSchema', () => {
  const view = {
    id: '7f3a2c1e-9b4d-4e8a-a1b2-c3d4e5f60718',
    title: 'Buy milk',
    description: null,
    dueDate: '2026-10-01',
    isCompleted: false,
    createdAt: '2026-09-30T12:00:00.000Z',
    version: 1,
    isOverdue: false,
  };

  it('accepts a valid view', () => {
    expect(TodoViewSchema.parse(view)).toEqual(view);
    expect(TodoViewListSchema.parse([view])).toEqual([view]);
  });

  it('rejects a non-positive version', () => {
    expect(TodoViewSchema.safeParse({ ...view, version: 0 }).success).toBe(false);
  });
});
