import { describe, expect, it } from 'vitest';
import { systemClock } from '../../src/domain/clock.js';

describe('systemClock', () => {
  it('returns the current instant', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
