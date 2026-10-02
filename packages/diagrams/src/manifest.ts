import type { Diagram } from './extract.js';
import { imagePath, MANIFEST_PATH } from './paths.js';

export interface ManifestEntry {
  id: string;
  file: string;
  heading: string;
  image: string;
  hash: string;
}

export interface Manifest {
  diagrams: ManifestEntry[];
}

export function buildManifest(diagrams: readonly Diagram[]): Manifest {
  return {
    diagrams: diagrams.map(({ id, file, heading, hash }) => ({
      id,
      file,
      heading,
      image: imagePath(id),
      hash,
    })),
  };
}

export function serialiseManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const FIELDS = ['id', 'file', 'heading', 'image', 'hash'] as const;

function isEntry(value: unknown): value is ManifestEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    FIELDS.every((field) => typeof (value as Record<string, unknown>)[field] === 'string')
  );
}

export function parseManifest(text: string): Manifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${MANIFEST_PATH} is not JSON`);
  }
  const diagrams = (value as { diagrams?: unknown } | null)?.diagrams;
  if (!Array.isArray(diagrams) || !diagrams.every(isEntry)) {
    throw new Error(`${MANIFEST_PATH} is not a diagram manifest`);
  }
  return { diagrams };
}
