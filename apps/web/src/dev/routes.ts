export const DECISIONS_INDEX = 'docs/decisions/README.md';

export const TABS = [
  { id: 'overview', label: 'Overview', path: 'README.md' },
  { id: 'architecture', label: 'Architecture', path: 'docs/architecture.md' },
  { id: 'api', label: 'API', path: 'docs/api.md' },
  { id: 'concurrency', label: 'Concurrency', path: 'docs/concurrency.md' },
  { id: 'testing', label: 'Testing', path: 'docs/testing.md' },
  { id: 'decisions', label: 'Decisions', path: DECISIONS_INDEX },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export interface Route {
  tab: TabId;
  path: string;
}

function decodeHash(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return ''; // malformed percent-encoding: treat as no route
  }
}

/** `#api` → API tab; `#decisions/0004-…` → one ADR; anything else → Overview. */
export function routeFromHash(hash: string): Route {
  const value = decodeHash(hash);
  const decision = /^decisions\/(\d{4}-[\w-]+)$/.exec(value);
  if (decision !== null) {
    return { tab: 'decisions', path: `docs/decisions/${decision[1] as string}.md` };
  }
  const tab = TABS.find((candidate) => candidate.id === value) ?? TABS[0];
  return { tab: tab.id, path: tab.path };
}
