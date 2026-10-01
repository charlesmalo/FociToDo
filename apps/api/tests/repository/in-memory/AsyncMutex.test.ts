import { describe, expect, it } from 'vitest';
import { AsyncMutex } from '../../../src/repository/in-memory/AsyncMutex.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe('AsyncMutex', () => {
  it('runs tasks one at a time in call order', async () => {
    const mutex = new AsyncMutex();
    const events: string[] = [];
    const task = (name: string) => async () => {
      events.push(`${name}:start`);
      await tick();
      events.push(`${name}:end`);
      return name;
    };
    const results = await Promise.all([
      mutex.runExclusive(task('a')),
      mutex.runExclusive(task('b')),
    ]);
    expect(results).toEqual(['a', 'b']);
    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('releases the lock when a task fails', async () => {
    const mutex = new AsyncMutex();
    await expect(
      mutex.runExclusive(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(mutex.runExclusive(async () => 'next')).resolves.toBe('next');
  });
});
