import type { Diagram } from './extract.js';
import { imagePath } from './paths.js';

/** The README link to a diagram's Mermaid source: its heading anchor in its document. */
export function sourceLink(diagram: Diagram): string {
  const file = diagram.file === 'README.md' ? '' : diagram.file;
  return diagram.anchor === '' ? file || 'README.md' : `${file}#${diagram.anchor}`;
}

/** Spec §2.3: every diagram has a README table row linking its image and its source. */
export function checkReadmeMap(readme: string, diagrams: readonly Diagram[]): string[] {
  const rows = readme.split('\n').filter((line) => line.trimStart().startsWith('|'));
  const problems = diagrams.flatMap((diagram) => {
    const image = imagePath(diagram.id);
    const row = rows.find((line) => line.includes(`(${image})`));
    if (row === undefined) {
      return [`README.md: the diagram map has no row for ${diagram.id} (image link "${image}")`];
    }
    const source = sourceLink(diagram);
    return row.includes(`(${source})`)
      ? []
      : [`README.md: the map row for ${diagram.id} must link its Mermaid source "${source}"`];
  });
  const known = new Set(diagrams.map((diagram) => imagePath(diagram.id)));
  for (const match of readme.matchAll(/\(docs\/diagrams\/[^)\s]+\.svg\)/g)) {
    const link = match[0].slice(1, -1);
    if (!known.has(link)) problems.push(`README.md: links ${link}, which is not a diagram image`);
  }
  return problems;
}
