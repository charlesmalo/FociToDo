/** Creation timestamps are instants: show them in the viewer's locale and timezone. */
export function formatTimestamp(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/** Deadlines are instants: show them in the viewer's locale and timezone (medium date, short time). */
export function formatDeadline(iso: string, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}
