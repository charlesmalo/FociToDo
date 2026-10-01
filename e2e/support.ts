/** Unique, readable titles so journeys never depend on each other's data. */
export function uniqueTitle(label: string): string {
  return `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
