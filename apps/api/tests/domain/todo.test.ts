import { describe, expect, it } from 'vitest';
import { isOverdue, toView } from '../../src/domain/todo.js';
import { makeTodo } from '../support/todoFactory.js';

const TODAY = '2026-09-30';

describe('isOverdue', () => {
  it('is true for an incomplete todo due before today', () => {
    expect(isOverdue(makeTodo({ dueDate: '2026-09-29' }), TODAY)).toBe(true);
  });

  it('is false for a todo due today', () => {
    expect(isOverdue(makeTodo({ dueDate: TODAY }), TODAY)).toBe(false);
  });

  it('is false for a completed todo even when past due', () => {
    expect(isOverdue(makeTodo({ dueDate: '2026-01-01', isCompleted: true }), TODAY)).toBe(false);
  });

  it('is false without a due date', () => {
    expect(isOverdue(makeTodo({ dueDate: null }), TODAY)).toBe(false);
  });
});

describe('toView', () => {
  it('serialises every field and derives isOverdue', () => {
    const todo = makeTodo({
      title: 'File taxes',
      description: 'Receipts in the blue folder',
      dueDate: '2026-09-01',
      createdAt: new Date('2026-08-15T09:30:00.000Z'),
      version: 4,
    });
    expect(toView(todo, TODAY)).toEqual({
      id: todo.id,
      title: 'File taxes',
      description: 'Receipts in the blue folder',
      dueDate: '2026-09-01',
      isCompleted: false,
      createdAt: '2026-08-15T09:30:00.000Z',
      version: 4,
      isOverdue: true,
    });
  });
});
