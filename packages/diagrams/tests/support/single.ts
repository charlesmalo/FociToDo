/** The only element of a list; throws (failing the test) unless there is exactly one. */
export function single<T>(items: readonly T[]): T {
  const [item, ...rest] = items;
  if (item === undefined || rest.length > 0) {
    throw new Error(`expected exactly one item, got ${items.length}`);
  }
  return item;
}
