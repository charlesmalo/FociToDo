import type { Repo } from '../../src/repo.js';

/** A Repo over a plain object of path → content, for tests. */
export function memoryRepo(initial: Record<string, string> = {}): Repo & {
  files: Map<string, string>;
} {
  const files = new Map(Object.entries(initial));
  return {
    files,
    read: (path) => {
      const content = files.get(path);
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    readBytes: (path) => {
      const content = files.get(path);
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return new TextEncoder().encode(content);
    },
    exists: (path) => files.has(path),
    list: (dir) => [...files.keys()].filter((path) => path.startsWith(`${dir}/`)).sort(),
    write: (path, content) => {
      files.set(path, content);
    },
    remove: (path) => {
      files.delete(path);
    },
  };
}
