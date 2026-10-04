import { describe, expect, it } from 'vitest';
import {
  CreateTodoSchema,
  DESCRIPTION_MAX_LENGTH,
  DUE_AT_ERROR,
  DUE_BOTH_ERROR,
  DUE_DATE_ERROR,
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
        dueAt: '2026-10-01T12:00:00Z',
      }),
    ).toEqual({
      title: 'Pay rent',
      description: 'Before noon',
      dueAt: '2026-10-01T12:00:00.000Z',
    });
  });

  it('accepts explicit nulls for optional fields', () => {
    expect(CreateTodoSchema.parse({ title: 'x', description: null, dueAt: null })).toEqual({
      title: 'x',
      description: null,
      dueAt: null,
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

  it.each([
    ['2026-10-03T22:00:00Z', '2026-10-03T22:00:00.000Z'],
    ['2026-10-03T18:00:00-04:00', '2026-10-03T22:00:00.000Z'],
    ['2026-10-03T22:00:00.123+00:00', '2026-10-03T22:00:00.123Z'],
    ['0001-01-01T00:00:00Z', '0001-01-01T00:00:00.000Z'],
  ])('accepts %s and normalises it to %s', (dueAt, expected) => {
    expect(CreateTodoSchema.parse({ title: 'x', dueAt }).dueAt).toBe(expected);
  });

  it.each([
    '2026-10-03',
    '2026-10-03T22:00:00',
    '2026-02-30T10:00:00Z',
    '0000-01-01T00:00:00Z',
    '10000-01-01T00:00:00Z',
    '0001-01-01T00:00:00+01:00',
    '9999-12-31T23:59:59-01:00',
    'not a date',
    '',
    1759528800000,
  ])('rejects the invalid instant %j', (dueAt) => {
    const result = CreateTodoSchema.safeParse({ title: 'x', dueAt });
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: ['dueAt'], message: DUE_AT_ERROR }),
    ]);
  });

  it.each(['id', 'isCompleted', 'createdAt', 'version', 'isOverdue', 'isDueSoon', 'dueDat'])(
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
    expect(UpdateTodoSchema.parse({ description: null, dueAt: null })).toEqual({
      description: null,
      dueAt: null,
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
        message: 'At least one of title, description, dueDate or dueAt is required',
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

const view = {
  id: '7f3a2c1e-9b4d-4e8a-a1b2-c3d4e5f60718',
  title: 'Buy milk',
  description: null,
  dueAt: '2026-10-01T12:00:00.000Z',
  dueDate: '2026-10-01',
  isCompleted: false,
  createdAt: '2026-09-30T12:00:00.000Z',
  version: 1,
  isOverdue: false,
  isDueSoon: false,
};

describe("dueDate (the brief's date-only deadline)", () => {
  it.each([
    ['2026-10-10', '2026-10-10T23:59:59.000Z'],
    ['0001-01-01', '0001-01-01T23:59:59.000Z'],
    ['9999-12-31', '9999-12-31T23:59:59.000Z'],
    ['2028-02-29', '2028-02-29T23:59:59.000Z'],
  ])('normalises dueDate %s to the end of that UTC day', (dueDate, dueAt) => {
    expect(CreateTodoSchema.parse({ title: 'x', dueDate })).toEqual({ title: 'x', dueAt });
    expect(UpdateTodoSchema.parse({ dueDate })).toEqual({ dueAt });
  });

  it.each([
    '2026-02-30',
    '2027-02-29',
    '0000-01-01',
    '10000-01-01',
    '2026-10-10T10:00:00Z',
    '20261010',
    'x',
  ])('rejects the date %j with one dueDate error', (dueDate) => {
    const result = CreateTodoSchema.safeParse({ title: 'x', dueDate });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['dueDate'], message: DUE_DATE_ERROR }),
    ]);
  });

  it('clears the deadline with dueDate: null', () => {
    expect(CreateTodoSchema.parse({ title: 'x', dueDate: null })).toEqual({
      title: 'x',
      dueAt: null,
    });
    expect(UpdateTodoSchema.parse({ dueDate: null })).toEqual({ dueAt: null });
  });

  it.each([
    [{ dueDate: '2026-10-10', dueAt: '2026-10-10T23:59:59Z' }],
    [{ dueDate: null, dueAt: '2026-10-10T23:59:59Z' }],
    [{ dueDate: '2026-10-10', dueAt: null }],
  ])('rejects both deadline fields together: %j', (deadline) => {
    for (const schema of [CreateTodoSchema, UpdateTodoSchema]) {
      const result = schema.safeParse({ title: 'x', ...deadline });
      expect(result.error?.issues).toContainEqual(
        expect.objectContaining({ path: ['dueDate'], message: DUE_BOTH_ERROR }),
      );
    }
  });

  it('names dueDate in the empty-patch message', () => {
    expect(UpdateTodoSchema.safeParse({}).error?.issues[0]?.message).toBe(
      'At least one of title, description, dueDate or dueAt is required',
    );
  });

  it('returns dueDate on views and accepts null', () => {
    expect(TodoViewSchema.parse({ ...view, dueDate: '2026-10-01' }).dueDate).toBe('2026-10-01');
    expect(TodoViewSchema.parse({ ...view, dueAt: null, dueDate: null }).dueDate).toBeNull();
    expect(TodoViewSchema.safeParse({ ...view, dueDate: '2026-10-01T00:00:00Z' }).success).toBe(
      false,
    );
  });
});

describe('TodoViewSchema', () => {
  it('accepts a valid view', () => {
    expect(TodoViewSchema.parse(view)).toEqual(view);
    expect(TodoViewListSchema.parse([view])).toEqual([view]);
  });

  it('accepts a null dueAt', () => {
    expect(TodoViewSchema.parse({ ...view, dueAt: null }).dueAt).toBeNull();
  });

  it('requires isDueSoon', () => {
    expect(TodoViewSchema.safeParse({ ...view, isDueSoon: undefined }).success).toBe(false);
  });

  it('rejects a dueAt that is not an ISO datetime', () => {
    expect(TodoViewSchema.safeParse({ ...view, dueAt: '2026-10-01' }).success).toBe(false);
  });

  it('rejects a non-positive version', () => {
    expect(TodoViewSchema.safeParse({ ...view, version: 0 }).success).toBe(false);
  });
});

describe('unpaired surrogates', () => {
  it.each([
    ['a lone high surrogate', 'a\ud800'],
    ['a lone low surrogate', '\udc00b'],
  ])('rejects %s in title and description', (_label, text) => {
    expect(CreateTodoSchema.safeParse({ title: text }).error?.issues[0]?.message).toBe(
      'Title must not contain an unpaired surrogate character',
    );
    expect(
      CreateTodoSchema.safeParse({ title: 'x', description: text }).error?.issues[0]?.message,
    ).toBe('Description must not contain an unpaired surrogate character');
  });

  it('accepts a valid surrogate pair (emoji)', () => {
    expect(CreateTodoSchema.parse({ title: 'Ship 🚀', description: '✅ 🎉' }).title).toBe(
      'Ship 🚀',
    );
  });
});
