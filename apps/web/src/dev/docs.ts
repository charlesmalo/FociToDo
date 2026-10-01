import { isExternalOrAppLink, resolveRepoPath } from './links';

export interface DocPage {
  path: string;
  markdown: string;
}

export interface DocLibrary {
  get(path: string): DocPage | undefined;
  /** Bundled URL for an image referenced from a document, or the original source. */
  assetUrl(fromPath: string, src: string | undefined): string | undefined;
}

/** Glob keys look like `../../../../docs/api.md`; the library uses repository paths. */
const toRepoPath = (globKey: string): string => globKey.replace(/^(\.\.\/)+/, '');

export function createDocLibrary(
  markdownFiles: Record<string, string>,
  assetFiles: Record<string, string>,
): DocLibrary {
  const pages = new Map(
    Object.entries(markdownFiles).map(([key, text]) => [toRepoPath(key), text]),
  );
  const assets = new Map(Object.entries(assetFiles).map(([key, url]) => [toRepoPath(key), url]));
  return {
    get: (path) => {
      const markdown = pages.get(path);
      return markdown === undefined ? undefined : { path, markdown };
    },
    assetUrl: (fromPath, src) => {
      if (src === undefined || isExternalOrAppLink(src)) return src;
      return assets.get(resolveRepoPath(fromPath, src)) ?? src;
    },
  };
}

/** The repository's own documents, bundled at build time — the portal never holds a copy. */
export const docLibrary = createDocLibrary(
  import.meta.glob<string>(
    ['../../../../README.md', '../../../../docs/*.md', '../../../../docs/decisions/*.md'],
    { query: '?raw', import: 'default', eager: true },
  ),
  import.meta.glob<string>('../../../../docs/images/*', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);
