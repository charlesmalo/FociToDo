import { describe, expect, it } from 'vitest';
import { formatDeadline, formatTimestamp } from '../../src/todos/format';

describe('formatTimestamp', () => {
  it('formats an ISO timestamp for display in the given locale', () => {
    expect(formatTimestamp('2026-09-30T12:00:00.000Z', 'en-US')).toMatch(/Sep 30, 2026/);
  });
});

describe('formatDeadline', () => {
  const iso = '2026-10-03T22:00:00.000Z';

  it('shows a medium date and short time in the given locale and timezone', () => {
    expect(formatDeadline(iso, 'en-US', 'America/New_York')).toBe('Oct 3, 2026, 6:00 PM');
    expect(formatDeadline(iso, 'en-US', 'Asia/Tokyo')).toBe('Oct 4, 2026, 7:00 AM');
  });

  it('follows the locale', () => {
    expect(formatDeadline(iso, 'de-DE', 'UTC')).toMatch(/03\.10\.2026/);
  });

  it('defaults to the viewer locale and timezone', () => {
    expect(formatDeadline(iso)).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(iso),
      ),
    );
  });
});
