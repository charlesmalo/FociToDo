import { describe, expect, it } from 'vitest';
import { formatTimestamp } from '../../src/todos/format';

describe('formatTimestamp', () => {
  it('formats an ISO timestamp for display in the given locale', () => {
    expect(formatTimestamp('2026-09-30T12:00:00.000Z', 'en-US')).toMatch(/Sep 30, 2026/);
  });
});
