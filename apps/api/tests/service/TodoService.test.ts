import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LIST_QUERY } from '@foci/shared';
import {
  IdempotencyKeyReuseError,
  PreconditionRequiredError,
  TodoNotFoundError,
  VersionConflictError,
} from '../../src/domain/errors.js';
import { createInMemoryStorage } from '../../src/repository/in-memory/createInMemoryStorage.js';
import type { IdempotencyStore, Storage } from '../../src/repository/ports.js';
import { IDEMPOTENCY_TTL_MS, TodoService } from '../../src/service/TodoService.js';
import { FixedClock, SequentialIds, todoId } from '../support/fakes.js';

describe('TodoService', () => {
  let storage: Storage;
  let clock: FixedClock;
  let service: TodoService;

  beforeEach(() => {
    storage = createInMemoryStorage();
    clock = new FixedClock('2026-09-30T12:00:00.000Z');
    service = new TodoService({
      todos: storage.todos,
      unitOfWork: storage.unitOfWork,
      clock,
      ids: new SequentialIds(),
    });
  });

  describe('create', () => {
    it('creates an incomplete todo at version 1 with server-assigned id and timestamp', async () => {
      const result = await service.create({ title: 'Buy milk' });
      expect(result).toEqual({
        replayed: false,
        todo: {
          id: todoId(1),
          title: 'Buy milk',
          description: null,
          dueAt: null,
          dueDate: null,
          isCompleted: false,
          createdAt: '2026-09-30T12:00:00.000Z',
          version: 1,
          isOverdue: false,
          isDueSoon: false,
        },
      });
      expect(await storage.todos.findById(todoId(1))).not.toBeNull();
    });

    it('stores the deadline as an instant and flags a past one as overdue', async () => {
      const { todo } = await service.create({ title: 'Late', dueAt: '2026-09-01T10:00:00.000Z' });
      expect(todo).toMatchObject({ dueAt: '2026-09-01T10:00:00.000Z', isOverdue: true });
      expect(todo.isDueSoon).toBe(false);
      const stored = await storage.todos.findById(todo.id);
      expect(stored?.dueAt).toEqual(new Date('2026-09-01T10:00:00.000Z'));
    });

    it('flags a deadline within 24 hours as due soon', async () => {
      const { todo } = await service.create({ title: 'Soon', dueAt: '2026-09-30T18:00:00.000Z' });
      expect(todo).toMatchObject({ isOverdue: false, isDueSoon: true });
    });

    it('treats a todo created with no deadline as neither overdue nor due soon', async () => {
      const { todo } = await service.create({ title: 'Someday', dueAt: null });
      expect(todo).toMatchObject({ dueAt: null, isOverdue: false, isDueSoon: false });
    });

    it('stores the todo and replays the same response for a repeated key', async () => {
      const first = await service.create({ title: 'Once' }, 'key-1');
      const second = await service.create({ title: 'Once' }, 'key-1');
      expect(first.replayed).toBe(false);
      expect(second).toEqual({ todo: first.todo, replayed: true });
      expect(
        await storage.todos.list(DEFAULT_LIST_QUERY, new Date('2026-09-30T12:00:00.000Z')),
      ).toHaveLength(1);
    });

    it('rejects a key reused with a different payload', async () => {
      await service.create({ title: 'Once' }, 'key-1');
      await expect(service.create({ title: 'Other' }, 'key-1')).rejects.toBeInstanceOf(
        IdempotencyKeyReuseError,
      );
    });

    it('treats a key older than 24 hours as new', async () => {
      await service.create({ title: 'Once' }, 'key-1');
      clock.advance(IDEMPOTENCY_TTL_MS + 1);
      const again = await service.create({ title: 'Different' }, 'key-1');
      expect(again.replayed).toBe(false);
      expect(
        await storage.todos.list(DEFAULT_LIST_QUERY, new Date('2026-10-01T12:00:00.000Z')),
      ).toHaveLength(2);
    });

    it('creates exactly one todo for concurrent requests sharing a key', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => service.create({ title: 'Race' }, 'race-key')),
      );
      expect(results.filter((result) => !result.replayed)).toHaveLength(1);
      expect(new Set(results.map((result) => result.todo.id)).size).toBe(1);
      expect(
        await storage.todos.list(DEFAULT_LIST_QUERY, new Date('2026-09-30T12:00:00.000Z')),
      ).toHaveLength(1);
    });

    it('fails loudly if a claimed-by-someone-else record cannot be read back', async () => {
      const brokenStore: IdempotencyStore = {
        claim: async () => false,
        find: async () => null,
      };
      const brokenService = new TodoService({
        todos: storage.todos,
        unitOfWork: { run: (work) => work({ todos: storage.todos, idempotency: brokenStore }) },
        clock,
        ids: new SequentialIds(),
      });
      await expect(brokenService.create({ title: 'x' }, 'key-1')).rejects.toThrow(
        'Idempotency record for key-1 disappeared',
      );
    });
  });

  describe('get and list', () => {
    it('returns a todo by id', async () => {
      const { todo } = await service.create({ title: 'Read me' });
      await expect(service.get(todo.id)).resolves.toEqual(todo);
    });

    it('throws TodoNotFoundError for an unknown id', async () => {
      await expect(service.get(todoId(99))).rejects.toBeInstanceOf(TodoNotFoundError);
    });

    it('lists with the requested filter and computes the flags against the clock', async () => {
      await service.create({ title: 'Later', dueAt: '2026-09-30T12:00:00.000Z' });
      await service.create({ title: 'Late', dueAt: '2026-09-30T11:59:59.999Z' });
      const overdue = await service.list({ ...DEFAULT_LIST_QUERY, status: 'overdue' });
      expect(overdue.map((todo) => [todo.title, todo.isOverdue])).toEqual([['Late', true]]);
      clock.set('2026-10-01T00:00:00.000Z');
      const all = await service.list(DEFAULT_LIST_QUERY);
      expect(all.every((todo) => todo.isOverdue)).toBe(true);
    });

    it('passes the clock instant to the repository', async () => {
      const seen: Date[] = [];
      const spyService = new TodoService({
        todos: {
          ...storage.todos,
          list: async (_query, now) => {
            seen.push(now);
            return [];
          },
        },
        unitOfWork: storage.unitOfWork,
        clock,
        ids: new SequentialIds(),
      });
      await spyService.list(DEFAULT_LIST_QUERY);
      expect(seen).toEqual([new Date('2026-09-30T12:00:00.000Z')]);
    });
  });

  describe('update', () => {
    it('applies the patch and returns the new version', async () => {
      const { todo } = await service.create({ title: 'Old' });
      const updated = await service.update(todo.id, 1, {
        title: 'New',
        dueAt: '2026-10-05T09:00:00.000Z',
      });
      expect(updated).toEqual({
        ...todo,
        title: 'New',
        dueAt: '2026-10-05T09:00:00.000Z',
        dueDate: '2026-10-05',
        version: 2,
      });
      expect((await storage.todos.findById(todo.id))?.dueAt).toEqual(
        new Date('2026-10-05T09:00:00.000Z'),
      );
    });

    it('clears the deadline with null and leaves it alone when absent', async () => {
      const { todo } = await service.create({ title: 'Due', dueAt: '2026-10-05T09:00:00.000Z' });
      const untouched = await service.update(todo.id, 1, { title: 'Renamed' });
      expect(untouched.dueAt).toBe('2026-10-05T09:00:00.000Z');
      const cleared = await service.update(todo.id, 2, { dueAt: null });
      expect(cleared).toMatchObject({ dueAt: null, isOverdue: false, isDueSoon: false });
    });

    it('computes the flags against the clock when updating', async () => {
      const { todo } = await service.create({ title: 'Due' });
      const updated = await service.update(todo.id, 1, { dueAt: '2026-09-30T13:00:00.000Z' });
      expect(updated).toMatchObject({ isOverdue: false, isDueSoon: true });
    });

    it('requires a version (428 before anything else)', async () => {
      await expect(service.update(todoId(99), undefined, { title: 'x' })).rejects.toBeInstanceOf(
        PreconditionRequiredError,
      );
    });

    it('reports a missing todo as not found', async () => {
      await expect(service.update(todoId(99), 1, { title: 'x' })).rejects.toBeInstanceOf(
        TodoNotFoundError,
      );
    });

    it('reports a stale version as a conflict', async () => {
      const { todo } = await service.create({ title: 'Old' });
      await service.update(todo.id, 1, { title: 'First' });
      await expect(service.update(todo.id, 1, { title: 'Second' })).rejects.toBeInstanceOf(
        VersionConflictError,
      );
    });
  });

  describe('complete and uncomplete', () => {
    it('is idempotent and bumps the version only on change', async () => {
      const { todo } = await service.create({ title: 'Task' });
      const completed = await service.complete(todo.id);
      expect(completed).toMatchObject({ isCompleted: true, version: 2 });
      await expect(service.complete(todo.id)).resolves.toEqual(completed);
      await expect(service.uncomplete(todo.id)).resolves.toMatchObject({
        isCompleted: false,
        version: 3,
      });
    });

    it('clears the overdue and due-soon flags when completed', async () => {
      const late = await service.create({ title: 'Late', dueAt: '2026-09-01T00:00:00.000Z' });
      await expect(service.complete(late.todo.id)).resolves.toMatchObject({ isOverdue: false });
      const soon = await service.create({ title: 'Soon', dueAt: '2026-09-30T13:00:00.000Z' });
      await expect(service.complete(soon.todo.id)).resolves.toMatchObject({ isDueSoon: false });
    });

    it('throws TodoNotFoundError for an unknown id', async () => {
      await expect(service.complete(todoId(99))).rejects.toBeInstanceOf(TodoNotFoundError);
      await expect(service.uncomplete(todoId(99))).rejects.toBeInstanceOf(TodoNotFoundError);
    });
  });

  describe('delete', () => {
    it('deletes with the current version', async () => {
      const { todo } = await service.create({ title: 'Bye' });
      await service.delete(todo.id, 1);
      await expect(service.get(todo.id)).rejects.toBeInstanceOf(TodoNotFoundError);
    });

    it('requires a version', async () => {
      await expect(service.delete(todoId(99), undefined)).rejects.toBeInstanceOf(
        PreconditionRequiredError,
      );
    });

    it('distinguishes a stale version from a missing todo', async () => {
      const { todo } = await service.create({ title: 'Keep' });
      await expect(service.delete(todo.id, 7)).rejects.toBeInstanceOf(VersionConflictError);
      await expect(service.delete(todoId(99), 1)).rejects.toBeInstanceOf(TodoNotFoundError);
    });
  });
});
