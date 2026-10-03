import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LIST_QUERY, type ListTodosQuery } from '@foci/shared';
import type { Storage, StoredResponse } from '../../src/repository/ports.js';
import { todoId } from '../support/fakes.js';
import { makeTodo } from '../support/todoFactory.js';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const query = (overrides: Partial<ListTodosQuery>): ListTodosQuery => ({
  ...DEFAULT_LIST_QUERY,
  ...overrides,
});
const at = (iso: string) => new Date(iso);
const hash = (character: string) => character.repeat(64);

function storedResponse(overrides: Partial<StoredResponse> = {}): StoredResponse {
  return {
    key: 'key-1',
    requestHash: hash('a'),
    status: 201,
    body: { id: todoId(1), title: 'Buy milk' },
    createdAt: at('2026-09-30T12:00:00.000Z'),
    ...overrides,
  };
}

/** Behaviour every storage adapter must share; run against in-memory and Postgres. */
export function describeRepositoryContract(
  adapterName: string,
  setup: () => Promise<Storage>,
): void {
  describe(`${adapterName} storage contract`, () => {
    let storage: Storage;

    beforeEach(async () => {
      storage = await setup();
    });

    describe('TodoRepository', () => {
      it('round-trips every field', async () => {
        const todo = makeTodo({
          title: 'Pay rent',
          description: 'Before noon',
          dueAt: at('2026-10-01T17:45:30.123Z'),
          createdAt: at('2026-09-15T08:30:00.123Z'),
        });
        await storage.todos.create(todo);
        expect(await storage.todos.findById(todo.id)).toEqual(todo);
      });

      it('returns null for an unknown id', async () => {
        expect(await storage.todos.findById(todoId(999_999))).toBeNull();
      });

      it('rejects a duplicate id', async () => {
        const todo = makeTodo();
        await storage.todos.create(todo);
        await expect(storage.todos.create(todo)).rejects.toThrow();
      });

      it('applies only the provided fields and bumps the version', async () => {
        const todo = makeTodo({
          title: 'Old',
          description: 'Keep me',
          dueAt: at('2026-10-01T17:00:00.000Z'),
        });
        await storage.todos.create(todo);
        const updated = await storage.todos.update(todo.id, 1, { title: 'New' });
        expect(updated).toEqual({ ...todo, title: 'New', version: 2 });
        expect(await storage.todos.findById(todo.id)).toEqual(updated);
      });

      it('clears optional fields with null and updates the deadline', async () => {
        const todo = makeTodo({ description: 'x', dueAt: at('2026-10-01T17:00:00.000Z') });
        await storage.todos.create(todo);
        expect(await storage.todos.update(todo.id, 1, { description: null, dueAt: null })).toEqual({
          ...todo,
          description: null,
          dueAt: null,
          version: 2,
        });
        const later = at('2027-01-31T08:15:00.500Z');
        expect(await storage.todos.update(todo.id, 2, { dueAt: later })).toEqual({
          ...todo,
          description: null,
          dueAt: later,
          version: 3,
        });
        expect((await storage.todos.findById(todo.id))?.dueAt).toEqual(later);
      });

      it('returns a detached dueAt', async () => {
        const iso = '2026-10-01T17:00:00.000Z';
        const todo = makeTodo({ dueAt: at(iso) });
        await storage.todos.create(todo);
        todo.dueAt?.setUTCFullYear(1999);
        const found = await storage.todos.findById(todo.id);
        expect(found?.dueAt).toEqual(at(iso));
        found?.dueAt?.setUTCFullYear(1999);
        expect((await storage.todos.findById(todo.id))?.dueAt).toEqual(at(iso));
      });

      it('refuses an update with a stale version and leaves the row unchanged', async () => {
        const todo = makeTodo();
        await storage.todos.create(todo);
        expect(await storage.todos.update(todo.id, 2, { title: 'Nope' })).toBeNull();
        expect(await storage.todos.findById(todo.id)).toEqual(todo);
      });

      it('returns null when updating an unknown id', async () => {
        expect(await storage.todos.update(todoId(999_999), 1, { title: 'x' })).toBeNull();
      });

      it('bumps the version only when the completion state changes', async () => {
        const todo = makeTodo();
        await storage.todos.create(todo);
        const completed = await storage.todos.setCompleted(todo.id, true);
        expect(completed).toEqual({ ...todo, isCompleted: true, version: 2 });
        expect(await storage.todos.setCompleted(todo.id, true)).toEqual(completed);
        expect(await storage.todos.setCompleted(todo.id, false)).toEqual({ ...todo, version: 3 });
      });

      it('returns null when completing an unknown id', async () => {
        expect(await storage.todos.setCompleted(todoId(999_999), true)).toBeNull();
      });

      it('deletes only with the current version', async () => {
        const todo = makeTodo();
        await storage.todos.create(todo);
        expect(await storage.todos.delete(todo.id, 2)).toBe(false);
        expect(await storage.todos.findById(todo.id)).toEqual(todo);
        expect(await storage.todos.delete(todo.id, 1)).toBe(true);
        expect(await storage.todos.findById(todo.id)).toBeNull();
        expect(await storage.todos.delete(todo.id, 1)).toBe(false);
      });

      describe('list', () => {
        const done = makeTodo({
          title: 'done',
          isCompleted: true,
          dueAt: at('2026-09-01T10:00:00Z'),
          createdAt: at('2026-09-01T00:00:00Z'),
        });
        const late = makeTodo({
          title: 'late',
          dueAt: at('2026-09-29T10:00:00Z'),
          createdAt: at('2026-09-02T00:00:00Z'),
        });
        const dueLater = makeTodo({
          title: 'later',
          dueAt: at('2026-10-05T10:00:00Z'),
          createdAt: at('2026-09-03T00:00:00Z'),
        });
        const undated = makeTodo({ title: 'undated', createdAt: at('2026-09-04T00:00:00Z') });

        beforeEach(async () => {
          for (const todo of [late, undated, done, dueLater]) await storage.todos.create(todo);
        });

        it.each([
          ['all', ['undated', 'later', 'late', 'done']],
          ['completed', ['done']],
          ['incomplete', ['undated', 'later', 'late']],
          ['overdue', ['late']],
          ['due-soon', []],
        ] as const)('filters by status %s (newest first by default)', async (status, titles) => {
          const todos = await storage.todos.list(query({ status }), NOW);
          expect(todos.map((todo) => todo.title)).toEqual(titles);
        });

        it('sorts by createdAt ascending', async () => {
          const todos = await storage.todos.list(query({ order: 'asc' }), NOW);
          expect(todos.map((todo) => todo.title)).toEqual(['done', 'late', 'later', 'undated']);
        });

        it('sorts by deadline with undated todos last in both directions', async () => {
          const asc = await storage.todos.list(query({ sort: 'dueAt', order: 'asc' }), NOW);
          const desc = await storage.todos.list(query({ sort: 'dueAt', order: 'desc' }), NOW);
          expect(asc.map((todo) => todo.title)).toEqual(['done', 'late', 'later', 'undated']);
          expect(desc.map((todo) => todo.title)).toEqual(['later', 'late', 'done', 'undated']);
        });

        it('returns detached copies', async () => {
          const [first] = await storage.todos.list(query({}), NOW);
          if (first === undefined) throw new Error('expected a todo');
          first.title = 'mutated';
          expect((await storage.todos.findById(first.id))?.title).toBe('undated');
        });
      });

      describe('overdue and due-soon boundaries', () => {
        const offsets: [string, number | null, boolean][] = [
          ['minus1ms', -1, false],
          ['exactlyNow', 0, false],
          ['inside', 24 * HOUR - 1, false],
          ['windowEnd', 24 * HOUR, false],
          ['completedSoon', HOUR, true],
          ['completedLate', -HOUR, true],
          ['noDeadline', null, false],
        ];
        // Created oldest-first so the default newest-first order is the reverse of this list.
        beforeEach(async () => {
          let day = 1;
          for (const [title, offset, isCompleted] of offsets) {
            day += 1;
            await storage.todos.create(
              makeTodo({
                title,
                isCompleted,
                dueAt: offset === null ? null : new Date(NOW.getTime() + offset),
                createdAt: at(`2026-09-${String(day).padStart(2, '0')}T00:00:00Z`),
              }),
            );
          }
        });

        const titlesFor = async (status: 'overdue' | 'due-soon') =>
          (await storage.todos.list(query({ status, sort: 'dueAt', order: 'asc' }), NOW)).map(
            (todo) => todo.title,
          );

        it('overdue means incomplete and strictly before now', async () => {
          expect(await titlesFor('overdue')).toEqual(['minus1ms']);
        });

        it('due-soon means incomplete, from now (inclusive) up to 24h (exclusive)', async () => {
          expect(await titlesFor('due-soon')).toEqual(['exactlyNow', 'inside']);
        });
      });

      it('returns detached dates', async () => {
        const originalIso = '2026-09-01T00:00:00.000Z';
        const todo = makeTodo({ createdAt: at(originalIso) });
        await storage.todos.create(todo);
        todo.createdAt.setUTCFullYear(1999);
        const found = await storage.todos.findById(todo.id);
        expect(found?.createdAt).toEqual(at(originalIso));
        found?.createdAt.setUTCFullYear(1999);
        expect((await storage.todos.findById(todo.id))?.createdAt).toEqual(at(originalIso));
      });

      it('sorts titles case-insensitively by code point with stable tie-breakers', async () => {
        const createdAt = at('2026-09-01T00:00:00Z');
        const todos = [
          makeTodo({ id: todoId(4), title: 'éclair', createdAt }),
          makeTodo({ id: todoId(2), title: 'Apple', createdAt }),
          makeTodo({ id: todoId(3), title: 'banana', createdAt }),
          makeTodo({ id: todoId(1), title: 'apple', createdAt }),
          makeTodo({ id: todoId(5), title: 'Apple', createdAt: at('2026-09-02T00:00:00Z') }),
        ];
        for (const todo of todos) await storage.todos.create(todo);
        const asc = await storage.todos.list(query({ sort: 'title', order: 'asc' }), NOW);
        expect(asc.map((todo) => todo.id)).toEqual([
          todoId(5),
          todoId(1),
          todoId(2),
          todoId(3),
          todoId(4),
        ]);
      });
    });

    describe('IdempotencyStore', () => {
      const notBefore = at('2026-09-29T12:00:00.000Z');

      it('claims a new key and finds it', async () => {
        const record = storedResponse();
        expect(await storage.idempotency.claim(record, notBefore)).toBe(true);
        expect(await storage.idempotency.find(record.key, notBefore)).toEqual(record);
      });

      it('refuses to claim a live key and keeps the original record', async () => {
        const original = storedResponse();
        await storage.idempotency.claim(original, notBefore);
        const second = storedResponse({ requestHash: hash('b'), body: { other: true } });
        expect(await storage.idempotency.claim(second, notBefore)).toBe(false);
        expect(await storage.idempotency.find(original.key, notBefore)).toEqual(original);
      });

      it('treats records older than notBefore as expired', async () => {
        const record = storedResponse({ createdAt: at('2026-09-28T00:00:00.000Z') });
        await storage.idempotency.claim(record, at('2026-09-27T00:00:00.000Z'));
        expect(await storage.idempotency.find(record.key, notBefore)).toBeNull();
      });

      it('replaces an expired record when claimed again', async () => {
        await storage.idempotency.claim(
          storedResponse({ createdAt: at('2026-09-28T00:00:00.000Z') }),
          at('2026-09-27T00:00:00.000Z'),
        );
        const fresh = storedResponse({ requestHash: hash('c') });
        expect(await storage.idempotency.claim(fresh, notBefore)).toBe(true);
        expect(await storage.idempotency.find(fresh.key, notBefore)).toEqual(fresh);
      });

      it('returns null for an unknown key', async () => {
        expect(await storage.idempotency.find('missing', notBefore)).toBeNull();
      });

      it('stores and returns detached records', async () => {
        const originalBody = { id: todoId(1), title: 'Buy milk' };
        const record = storedResponse({ body: originalBody });
        await storage.idempotency.claim(record, notBefore);
        (record.body as { title: string }).title = 'mutated input';
        const found = await storage.idempotency.find(record.key, notBefore);
        expect(found?.body).toEqual({ id: todoId(1), title: 'Buy milk' });
        (found?.body as { title: string }).title = 'mutated output';
        expect((await storage.idempotency.find(record.key, notBefore))?.body).toEqual({
          id: todoId(1),
          title: 'Buy milk',
        });
      });
    });

    describe('UnitOfWork', () => {
      const notBefore = at('2026-09-29T12:00:00.000Z');

      it('commits every write and returns the result', async () => {
        const todo = makeTodo();
        const result = await storage.unitOfWork.run(async ({ todos, idempotency }) => {
          await idempotency.claim(storedResponse(), notBefore);
          await todos.create(todo);
          return 'done';
        });
        expect(result).toBe('done');
        expect(await storage.todos.findById(todo.id)).toEqual(todo);
        expect(await storage.idempotency.find('key-1', notBefore)).not.toBeNull();
      });

      it('rolls back every write when the work fails', async () => {
        const todo = makeTodo();
        const failure = new Error('boom');
        await expect(
          storage.unitOfWork.run(async ({ todos, idempotency }) => {
            await idempotency.claim(storedResponse(), notBefore);
            await todos.create(todo);
            throw failure;
          }),
        ).rejects.toBe(failure);
        expect(await storage.todos.findById(todo.id)).toBeNull();
        expect(await storage.idempotency.find('key-1', notBefore)).toBeNull();
      });

      it('lets exactly one of several concurrent units claim the same key', async () => {
        const attempts = Array.from({ length: 5 }, (_, index) =>
          storage.unitOfWork.run(async ({ todos, idempotency }) => {
            const claimed = await idempotency.claim(storedResponse({ key: 'race' }), notBefore);
            if (claimed) await todos.create(makeTodo({ id: todoId(500 + index) }));
            return claimed;
          }),
        );
        const results = await Promise.all(attempts);
        expect(results.filter(Boolean)).toHaveLength(1);
        const all = await storage.todos.list(query({}), NOW);
        expect(all).toHaveLength(1);
      });
    });
  });
}
