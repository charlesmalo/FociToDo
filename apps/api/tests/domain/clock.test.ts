import { describe, expect, it } from 'vitest';
import { systemClock, utcDate } from '../../src/domain/clock.js';

describe('systemClock', () => {
  it('returns the current instant', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe('utcDate', () => {
  it('returns the UTC calendar date', () => {
    expect(utcDate(new Date('2026-09-30T12:00:00.000Z'))).toBe('2026-09-30');
  });

  it('uses UTC, not the local offset, near midnight', () => {
    expect(utcDate(new Date('2026-09-30T23:30:00-04:00'))).toBe('2026-10-01');
  });
});
