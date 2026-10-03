type Json = unknown;

const isObject = (value: Json): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function resolve(root: Json, ref: string): Json {
  const tokens = ref
    .slice(2)
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: Json = root;
  for (const token of tokens) {
    if (!(isObject(current) || Array.isArray(current)) || !Object.hasOwn(current, token)) {
      throw new Error(`Unresolvable $ref: ${ref}`);
    }
    current = (current as Record<string, Json>)[token];
  }
  return current;
}

/**
 * Replaces every local `$ref` (`#/...`) with the value it points to, recursively. Swagger UI's
 * own resolver does not work when the page is opened from `file://`, so the reference page ships
 * a document with no local refs left. Siblings of `$ref` are kept and win; a ref already being
 * expanded higher up the path (a cycle) is left as is; non-local refs are untouched. Pure.
 */
export function inlineRefs(document: Json): Json {
  const walk = (value: Json, expanding: readonly string[]): Json => {
    if (Array.isArray(value)) return value.map((item) => walk(item, expanding));
    if (!isObject(value)) return value;
    const { $ref, ...siblings } = value;
    if (typeof $ref === 'string' && $ref.startsWith('#/') && !expanding.includes($ref)) {
      const target = walk(resolve(document, $ref), [...expanding, $ref]);
      const own = walk(siblings, expanding) as Record<string, Json>;
      return isObject(target) ? { ...target, ...own } : target;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, walk(child, expanding)]),
    );
  };
  return walk(document, []);
}
