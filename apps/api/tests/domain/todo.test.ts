import { describe, expect, it } from 'vitest';
import {
  DUE_SOON_WINDOW_MS,
  isDueSoon,
  isOverdue,
  toView,
  type Todo,
} from '../../src/domain/todo.js';
import { makeTodo } from '../support/todoFactory.js';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);
const due = (offsetMs: number, overrides: Partial<Todo> = {}): Todo =>
  makeTodo({ dueAt: at(offsetMs), ...overrides });

describe('DUE_SOON_WINDOW_MS', () => {
  it('is 24 hours', () => {
    expect(DUE_SOON_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('isOverdue', () => {
  it('is true one millisecond after the deadline', () => {
    expect(isOverdue(due(-1), NOW)).toBe(true);
  });

  it('is false exactly at the deadline', () => {
    expect(isOverdue(due(0), NOW)).toBe(false);
  });

  it('is false before the deadline', () => {
    expect(isOverdue(due(1), NOW)).toBe(false);
  });

  it('is false for a completed todo even when past due', () => {
    expect(isOverdue(due(-DUE_SOON_WINDOW_MS, { isCompleted: true }), NOW)).toBe(false);
  });

  it('is false without a deadline', () => {
    expect(isOverdue(makeTodo({ dueAt: null }), NOW)).toBe(false);
  });
});

describe('isDueSoon', () => {
  it('is true exactly at the deadline', () => {
    expect(isDueSoon(due(0), NOW)).toBe(true);
  });

  it('is true one millisecond before the 24 hour edge', () => {
    expect(isDueSoon(due(DUE_SOON_WINDOW_MS - 1), NOW)).toBe(true);
  });

  it('is false exactly 24 hours ahead', () => {
    expect(isDueSoon(due(DUE_SOON_WINDOW_MS), NOW)).toBe(false);
  });

  it('is false one millisecond after the deadline', () => {
    expect(isDueSoon(due(-1), NOW)).toBe(false);
  });

  it('is false for a completed todo', () => {
    expect(isDueSoon(due(0, { isCompleted: true }), NOW)).toBe(false);
  });

  it('is false without a deadline', () => {
    expect(isDueSoon(makeTodo({ dueAt: null }), NOW)).toBe(false);
  });
});

describe('overdue and due soon', () => {
  it('are never both true', () => {
    const offsets = [-DUE_SOON_WINDOW_MS, -1, 0, 1, DUE_SOON_WINDOW_MS - 1, DUE_SOON_WINDOW_MS];
    for (const offset of offsets) {
      const todo = due(offset);
      expect(isOverdue(todo, NOW) && isDueSoon(todo, NOW)).toBe(false);
    }
  });
});

describe('toView', () => {
  it('serialises every field and derives the flags', () => {
    const todo = makeTodo({
      title: 'File taxes',
      description: 'Receipts in the blue folder',
      dueAt: new Date('2026-10-03T11:00:00.000Z'),
      createdAt: new Date('2026-08-15T09:30:00.000Z'),
      version: 4,
    });
    expect(toView(todo, NOW)).toEqual({
      id: todo.id,
      title: 'File taxes',
      description: 'Receipts in the blue folder',
      dueAt: '2026-10-03T11:00:00.000Z',
      dueDate: '2026-10-03',
      isCompleted: false,
      createdAt: '2026-08-15T09:30:00.000Z',
      version: 4,
      isOverdue: true,
      isDueSoon: false,
    });
  });

  it('derives dueDate as the UTC calendar date of dueAt', () => {
    // 22:00 on 10 Oct in New York is already 11 Oct in UTC.
    const todo = makeTodo({ dueAt: new Date('2026-10-11T02:00:00.000Z') });
    expect(toView(todo, NOW).dueDate).toBe('2026-10-11');
  });

  it('serialises a missing deadline as null and a due-soon todo', () => {
    expect(toView(makeTodo({ dueAt: null }), NOW)).toMatchObject({
      dueAt: null,
      dueDate: null,
      isOverdue: false,
      isDueSoon: false,
    });
    expect(toView(due(60_000), NOW)).toMatchObject({ isOverdue: false, isDueSoon: true });
  });
});
