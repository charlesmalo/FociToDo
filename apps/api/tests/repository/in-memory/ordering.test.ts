import { describe, expect, it } from 'vitest';
import {
  compareCodePoints,
  compareTodos,
  matchesStatus,
} from '../../../src/repository/in-memory/ordering.js';
import { todoId } from '../../support/fakes.js';
import { makeTodo } from '../../support/todoFactory.js';

describe('compareCodePoints', () => {
  it('orders by Unicode code point, like Postgres COLLATE "C"', () => {
    expect(compareCodePoints('apple', 'banana')).toBeLessThan(0);
    expect(compareCodePoints('banana', 'éclair')).toBeLessThan(0);
    expect(compareCodePoints('same', 'same')).toBe(0);
  });

  it('orders a prefix first', () => {
    expect(compareCodePoints('app', 'apple')).toBeLessThan(0);
    expect(compareCodePoints('apple', 'app')).toBeGreaterThan(0);
  });

  it('compares astral characters by code point, not UTF-16 unit', () => {
    // U+FFFD is below U+1F600, but its UTF-16 unit is above the surrogate 0xD83D.
    expect(compareCodePoints('�', '😀')).toBeLessThan(0);
  });
});

describe('matchesStatus', () => {
  const today = '2026-09-30';
  const done = makeTodo({ isCompleted: true, dueDate: '2026-09-01' });
  const late = makeTodo({ dueDate: '2026-09-29' });
  const dueToday = makeTodo({ dueDate: today });
  const undated = makeTodo();
  const all = [done, late, dueToday, undated];

  it.each([
    ['all', [done, late, dueToday, undated]],
    ['completed', [done]],
    ['incomplete', [late, dueToday, undated]],
    ['overdue', [late]],
  ] as const)('filters %s', (status, expected) => {
    expect(all.filter(matchesStatus(status, today))).toEqual(expected);
  });
});

describe('compareTodos', () => {
  const at = (iso: string) => new Date(iso);

  it('sorts by createdAt in both directions', () => {
    const older = makeTodo({ createdAt: at('2026-09-01T00:00:00Z') });
    const newer = makeTodo({ createdAt: at('2026-09-02T00:00:00Z') });
    expect([newer, older].sort(compareTodos('createdAt', 'asc'))).toEqual([older, newer]);
    expect([older, newer].sort(compareTodos('createdAt', 'desc'))).toEqual([newer, older]);
  });

  it('sorts titles case-insensitively, breaking ties by newest first', () => {
    const upper = makeTodo({ title: 'Apple', createdAt: at('2026-09-01T00:00:00Z') });
    const lower = makeTodo({ title: 'apple', createdAt: at('2026-09-02T00:00:00Z') });
    const banana = makeTodo({ title: 'banana', createdAt: at('2026-09-03T00:00:00Z') });
    const eclair = makeTodo({ title: 'éclair', createdAt: at('2026-09-04T00:00:00Z') });
    const input = [eclair, upper, banana, lower];
    expect([...input].sort(compareTodos('title', 'asc'))).toEqual([lower, upper, banana, eclair]);
    expect([...input].sort(compareTodos('title', 'desc'))).toEqual([eclair, banana, lower, upper]);
  });

  it('puts todos without a due date last in both directions', () => {
    const early = makeTodo({ dueDate: '2026-10-01' });
    const late = makeTodo({ dueDate: '2026-12-01' });
    const undated = makeTodo({ dueDate: null });
    expect([undated, late, early].sort(compareTodos('dueDate', 'asc'))).toEqual([
      early,
      late,
      undated,
    ]);
    expect([undated, early, late].sort(compareTodos('dueDate', 'desc'))).toEqual([
      late,
      early,
      undated,
    ]);
  });

  it('breaks full ties by id ascending', () => {
    const createdAt = at('2026-09-01T00:00:00Z');
    const first = makeTodo({ id: todoId(1), dueDate: '2026-10-01', createdAt });
    const second = makeTodo({ id: todoId(2), dueDate: '2026-10-01', createdAt });
    const undatedFirst = makeTodo({ id: todoId(3), dueDate: null, createdAt });
    const undatedSecond = makeTodo({ id: todoId(4), dueDate: null, createdAt });
    expect(
      [undatedSecond, second, undatedFirst, first].sort(compareTodos('dueDate', 'asc')),
    ).toEqual([first, second, undatedFirst, undatedSecond]);
  });
});
