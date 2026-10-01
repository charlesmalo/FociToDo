/** Creation timestamps are instants: show them in the viewer's locale and timezone. */
export function formatTimestamp(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}
