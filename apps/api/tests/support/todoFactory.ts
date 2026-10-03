import type { Todo } from '../../src/domain/todo.js';
import { todoId } from './fakes.js';

let sequence = 1000;

export function makeTodo(overrides: Partial<Todo> = {}): Todo {
  sequence += 1;
  return {
    id: todoId(sequence),
    title: `Task ${sequence}`,
    description: null,
    dueAt: null,
    isCompleted: false,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    version: 1,
    ...overrides,
  };
}
