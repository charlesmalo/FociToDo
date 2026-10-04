import { createHash } from 'node:crypto';
import type { Repo } from './repo.js';

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** One hash over the files' paths and contents, in the given order (callers sort). */
export function hashFiles(repo: Repo, paths: readonly string[]): string {
  return sha256(paths.map((path) => `${path}\0${sha256(repo.readBytes(path))}\n`).join(''));
}
