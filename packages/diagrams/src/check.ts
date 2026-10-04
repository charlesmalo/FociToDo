import { checkDepicts } from './depicts.js';
import { extractDiagrams, type Diagram } from './extract.js';
import { checkLayout } from './layout.js';
import { parseManifest, type Manifest } from './manifest.js';
import { DIAGRAMS_DIR, FIX_COMMAND, imagePath, MANIFEST_PATH } from './paths.js';
import { checkReadmeMap } from './readmeMap.js';
import type { Repo } from './repo.js';

const FIX = `run: ${FIX_COMMAND}`;

/** README.md plus the guides directly under docs/ (ADRs and plans hold no diagrams). */
export function sourceFiles(repo: Repo): string[] {
  return ['README.md', ...repo.list('docs').filter((path) => /^docs\/[^/]+\.md$/.test(path))];
}

export function collectDiagrams(repo: Repo): Diagram[] {
  return sourceFiles(repo).flatMap((file) => extractDiagrams(file, repo.read(file)));
}

export function duplicateIds(diagrams: readonly Diagram[]): string[] {
  const first = new Map<string, Diagram>();
  return diagrams.flatMap((diagram) => {
    const earlier = first.get(diagram.id);
    if (earlier === undefined) {
      first.set(diagram.id, diagram);
      return [];
    }
    return [
      `${diagram.id}: id used by ${earlier.file}:${earlier.line} and ${diagram.file}:${diagram.line} — rename a heading`,
    ];
  });
}

/** The diagram manifest, or the one problem that prevents reading it. */
function loadManifest(repo: Repo): { manifest: Manifest } | { problem: string } {
  if (!repo.exists(MANIFEST_PATH)) return { problem: `${MANIFEST_PATH} is missing — ${FIX}` };
  try {
    return { manifest: parseManifest(repo.read(MANIFEST_PATH)) };
  } catch (error) {
    const reason = (error as Error).message;
    return { problem: `${MANIFEST_PATH} is unreadable (${reason}) — ${FIX}` };
  }
}

export function checkImages(repo: Repo, diagrams: readonly Diagram[]): string[] {
  const loaded = loadManifest(repo);
  if ('problem' in loaded) return [loaded.problem];
  const { manifest } = loaded;
  const entries = new Map(manifest.diagrams.map((entry) => [entry.id, entry] as const));
  const ids = new Set(diagrams.map((diagram) => diagram.id));
  const images = new Set(diagrams.map((diagram) => imagePath(diagram.id)));
  const problems = diagrams.flatMap((diagram) => {
    const entry = entries.get(diagram.id);
    const found: string[] = [];
    if (entry === undefined) found.push(`${diagram.id}: not in ${MANIFEST_PATH} — ${FIX}`);
    else if (entry.hash !== diagram.hash) {
      found.push(`${diagram.id}: image is stale (its Mermaid source changed) — ${FIX}`);
    }
    if (!repo.exists(imagePath(diagram.id))) {
      found.push(`${diagram.id}: image ${imagePath(diagram.id)} is missing — ${FIX}`);
    }
    return found;
  });
  for (const id of entries.keys()) {
    if (!ids.has(id)) problems.push(`${id}: manifest entry has no diagram — ${FIX}`);
  }
  for (const path of repo.list(DIAGRAMS_DIR)) {
    if (path.endsWith('.svg') && !images.has(path)) problems.push(`${path}: orphan image — ${FIX}`);
  }
  return problems;
}

/**
 * Every rule of spec §2.5, plus depicted-source freshness (spec 2026-10-03 brief-duedate §5.2);
 * an empty list means the repository's diagrams are current.
 */
export function checkRepository(repo: Repo): string[] {
  const diagrams = collectDiagrams(repo);
  const loaded = loadManifest(repo);
  const layout = sourceFiles(repo).flatMap((file) =>
    checkLayout(
      repo.read(file),
      diagrams.filter((diagram) => diagram.file === file),
    ),
  );
  return [
    ...duplicateIds(diagrams),
    ...checkImages(repo, diagrams),
    // An unreadable manifest is reported by checkImages; stamps are checked once it is readable.
    ...('manifest' in loaded ? checkDepicts(repo, diagrams, loaded.manifest) : []),
    ...layout,
    ...checkReadmeMap(repo.read('README.md'), diagrams),
  ];
}
