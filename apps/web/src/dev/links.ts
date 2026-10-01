import { TABS } from './routes';

export const REPO_URL = 'https://github.com/charlesmalo/FociToDo/blob/main/';

/** URLs with a scheme, app paths and in-page anchors are used as-is. */
export function isExternalOrAppLink(href: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('/') || href.startsWith('#');
}

/** Resolves `relative` the way GitHub does: against the folder of the current document. */
export function resolveRepoPath(fromPath: string, relative: string): string {
  return new URL(relative, `https://repo.invalid/${fromPath}`).pathname.slice(1);
}

/** Where a Markdown link should point inside the portal. */
export function linkTarget(fromPath: string, href: string | undefined): string {
  if (href === undefined || href === '') return '#';
  if (isExternalOrAppLink(href)) return href;
  const path = resolveRepoPath(fromPath, href.split('#')[0] as string);
  const tab = TABS.find((candidate) => candidate.path === path);
  if (tab !== undefined) return `#${tab.id}`;
  const decision = /^docs\/decisions\/(\d{4}-[\w-]+)\.md$/.exec(path);
  if (decision !== null) return `#decisions/${decision[1] as string}`;
  return `${REPO_URL}${path}`;
}
