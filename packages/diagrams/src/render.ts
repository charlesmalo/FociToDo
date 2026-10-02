import { collectDiagrams, duplicateIds } from './check.js';
import { buildManifest, serialiseManifest, type Manifest } from './manifest.js';
import { DIAGRAMS_DIR, imagePath, MANIFEST_PATH } from './paths.js';
import type { Repo } from './repo.js';

/** Turns one diagram's Mermaid text into SVG markup. */
export type Renderer = (source: string) => Promise<string>;

/** Renders every diagram, deletes orphan images, then writes the manifest (last, so a failure leaves none). */
export async function renderRepository(repo: Repo, render: Renderer): Promise<Manifest> {
  const diagrams = collectDiagrams(repo);
  const duplicates = duplicateIds(diagrams);
  if (duplicates.length > 0) throw new Error(duplicates.join('\n'));

  repo.remove(MANIFEST_PATH);
  for (const diagram of diagrams) {
    let svg: string;
    try {
      svg = await render(diagram.source);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${diagram.file}:${diagram.line}: ${diagram.id} failed to render: ${reason}`,
        {
          cause: error,
        },
      );
    }
    repo.write(imagePath(diagram.id), svg);
  }

  const images = new Set(diagrams.map((diagram) => imagePath(diagram.id)));
  for (const path of repo.list(DIAGRAMS_DIR)) {
    if (path.endsWith('.svg') && !images.has(path)) repo.remove(path);
  }

  const manifest = buildManifest(diagrams);
  repo.write(MANIFEST_PATH, serialiseManifest(manifest));
  return manifest;
}
