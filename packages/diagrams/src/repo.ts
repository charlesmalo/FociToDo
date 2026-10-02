import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

/** The few file operations the checker and generator need, with repository-relative paths. */
export interface Repo {
  read(path: string): string;
  exists(path: string): boolean;
  /** Every file under `dir`, recursively, as sorted repository-relative paths ([] if absent). */
  list(dir: string): string[];
  write(path: string, content: string): void;
  remove(path: string): void;
}

export function fsRepo(root: string): Repo {
  const at = (path: string): string => join(root, path);
  return {
    read: (path) => readFileSync(at(path), 'utf8'),
    exists: (path) => existsSync(at(path)),
    list: (dir) =>
      existsSync(at(dir))
        ? readdirSync(at(dir), { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => posix.relative(root, join(entry.parentPath, entry.name)))
            .sort()
        : [],
    write: (path, content) => {
      mkdirSync(dirname(at(path)), { recursive: true });
      writeFileSync(at(path), content);
    },
    remove: (path) => {
      rmSync(at(path), { force: true });
    },
  };
}
