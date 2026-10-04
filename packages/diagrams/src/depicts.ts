import type { Diagram } from './extract.js';
import { hashFiles } from './hash.js';
import type { Manifest } from './manifest.js';
import { FIX_COMMAND } from './paths.js';
import type { Repo } from './repo.js';

/** Hand-written: each diagram id → the source files it depicts (spec 2026-10-03 brief-duedate §5.2). */
export const DEPICTS_PATH = 'docs/diagram-depicts.json';

const MISSING = `${DEPICTS_PATH} is missing — declare the source files each diagram depicts`;

export function parseDepicts(text: string): Record<string, string[]> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${DEPICTS_PATH} is not JSON`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${DEPICTS_PATH} must be an object mapping diagram ids to file lists`);
  }
  for (const [id, paths] of Object.entries(value)) {
    if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) {
      throw new Error(`${DEPICTS_PATH}: ${id} must map to a list of file paths`);
    }
  }
  return value as Record<string, string[]>;
}

function readDepicts(repo: Repo): Map<string, readonly string[]> {
  if (!repo.exists(DEPICTS_PATH)) throw new Error(MISSING);
  return new Map(Object.entries(parseDepicts(repo.read(DEPICTS_PATH))));
}

function stamp(repo: Repo, paths: readonly string[]): string {
  return hashFiles(repo, [...paths].sort());
}

/** Each diagram's `depictsHash`; throws a named error for a missing declaration or file. */
export function depictsStamps(repo: Repo, diagrams: readonly Diagram[]): Map<string, string> {
  const depicts = readDepicts(repo);
  return new Map(
    diagrams.map((diagram) => {
      const paths = depicts.get(diagram.id);
      if (paths === undefined) throw new Error(`${diagram.id}: no entry in ${DEPICTS_PATH}`);
      const missing = paths.find((path) => !repo.exists(path));
      if (missing !== undefined) {
        throw new Error(`${diagram.id}: depicts ${missing}, which does not exist`);
      }
      return [diagram.id, stamp(repo, paths)] as const;
    }),
  );
}

/** Flags diagrams whose depicted sources changed since they were last reviewed and stamped. */
export function checkDepicts(
  repo: Repo,
  diagrams: readonly Diagram[],
  manifest: Manifest,
): string[] {
  let depicts: Map<string, readonly string[]>;
  try {
    depicts = readDepicts(repo);
  } catch (error) {
    return [(error as Error).message];
  }
  const stamps = new Map(manifest.diagrams.map((entry) => [entry.id, entry.depictsHash] as const));
  const ids = new Set(diagrams.map((diagram) => diagram.id));
  const problems = diagrams.flatMap((diagram) => {
    const paths = depicts.get(diagram.id);
    if (paths === undefined) return [`${diagram.id}: not declared in ${DEPICTS_PATH}`];
    const missing = paths.filter((path) => !repo.exists(path));
    if (missing.length > 0) {
      return missing.map((path) => `${diagram.id}: depicts missing file ${path}`);
    }
    const recorded = stamps.get(diagram.id);
    // A diagram absent from the manifest is already reported by the image check.
    if (recorded === undefined || recorded === stamp(repo, paths)) return [];
    return [
      `${diagram.id}: its depicted sources changed — review the diagram against the code, update it if needed, then run: ${FIX_COMMAND}`,
    ];
  });
  for (const id of depicts.keys()) {
    if (!ids.has(id)) problems.push(`${DEPICTS_PATH}: unknown diagram ${id}`);
  }
  return problems;
}
