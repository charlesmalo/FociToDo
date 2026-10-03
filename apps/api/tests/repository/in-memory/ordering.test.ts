import { describe, expect, it } from 'vitest';
import {
  compareCodePoints,
  compareDueAts,
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
  const now = new Date('2026-09-30T12:00:00.000Z');
  const offset = (ms: number) => new Date(now.getTime() + ms);
  const day = 24 * 60 * 60 * 1000;
  const done = makeTodo({ isCompleted: true, dueAt: offset(-day) });
  const late = makeTodo({ dueAt: offset(-1) });
  const atNow = makeTodo({ dueAt: offset(0) });
  const soon = makeTodo({ dueAt: offset(day - 1) });
  const afterWindow = makeTodo({ dueAt: offset(day) });
  const undated = makeTodo();
  const all = [done, late, atNow, soon, afterWindow, undated];

  it.each([
    ['all', all],
    ['completed', [done]],
    ['incomplete', [late, atNow, soon, afterWindow, undated]],
    ['overdue', [late]],
    ['due-soon', [atNow, soon]],
  ] as const)('filters %s', (status, expected) => {
    expect(all.filter(matchesStatus(status, now))).toEqual(expected);
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

  it('puts todos without a deadline last in both directions', () => {
    const early = makeTodo({ dueAt: at('2026-10-01T10:00:00Z') });
    const late = makeTodo({ dueAt: at('2026-10-01T10:00:00.001Z') });
    const undated = makeTodo({ dueAt: null });
    expect([undated, late, early].sort(compareTodos('dueAt', 'asc'))).toEqual([
      early,
      late,
      undated,
    ]);
    expect([undated, early, late].sort(compareTodos('dueAt', 'desc'))).toEqual([
      late,
      early,
      undated,
    ]);
  });

  it('breaks full ties by id ascending', () => {
    const createdAt = at('2026-09-01T00:00:00Z');
    const first = makeTodo({ id: todoId(1), dueAt: at('2026-10-01T10:00:00Z'), createdAt });
    const second = makeTodo({ id: todoId(2), dueAt: at('2026-10-01T10:00:00Z'), createdAt });
    const undatedFirst = makeTodo({ id: todoId(3), dueAt: null, createdAt });
    const undatedSecond = makeTodo({ id: todoId(4), dueAt: null, createdAt });
    expect([undatedSecond, second, undatedFirst, first].sort(compareTodos('dueAt', 'asc'))).toEqual(
      [first, second, undatedFirst, undatedSecond],
    );
  });
});

describe('compareDueAts', () => {
  const early = new Date('2026-10-01T10:00:00Z');
  const late = new Date('2026-10-01T10:00:00.001Z');

  it('compares instants in the given direction', () => {
    expect(compareDueAts(early, late, 1)).toBeLessThan(0);
    expect(compareDueAts(early, late, -1)).toBeGreaterThan(0);
    expect(compareDueAts(early, new Date(early), 1)).toBe(0);
  });

  it('puts null last in both directions and ties null with null', () => {
    expect(compareDueAts(null, early, 1)).toBe(1);
    expect(compareDueAts(null, early, -1)).toBe(1);
    expect(compareDueAts(early, null, -1)).toBe(-1);
    expect(compareDueAts(null, null, 1)).toBe(0);
  });
});
