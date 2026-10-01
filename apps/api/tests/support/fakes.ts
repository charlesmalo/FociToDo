import type { Clock } from '../../src/domain/clock.js';
import type { IdGenerator } from '../../src/domain/ids.js';

/** Deterministic clock for tests. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(initial: Date | string = '2026-09-30T12:00:00.000Z') {
    this.current = new Date(initial);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(instant: Date | string): void {
    this.current = new Date(instant);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

/** Valid, predictable UUIDs: todoId(1) = 00000000-0000-4000-8000-000000000001. */
export function todoId(sequence: number): string {
  return `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
}

export class SequentialIds implements IdGenerator {
  private sequence = 0;

  next(): string {
    this.sequence += 1;
    return todoId(this.sequence);
  }
}
