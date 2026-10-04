import { posix } from 'node:path';

export const DIAGRAMS_DIR = 'docs/diagrams';
export const MANIFEST_PATH = `${DIAGRAMS_DIR}/manifest.json`;
export const FIX_COMMAND = 'docker compose --profile docs run --rm --build diagrams';

export function imagePath(id: string): string {
  return `${DIAGRAMS_DIR}/${id}.svg`;
}

/** The image path as written in `file` (Markdown links are relative to the document). */
export function relativeImagePath(file: string, id: string): string {
  return posix.relative(posix.dirname(file), imagePath(id));
}

/** The repository path a link written in `file` points to (Markdown links are relative to the document). */
export function resolveLink(file: string, link: string): string {
  return posix.join(posix.dirname(file), link);
}
