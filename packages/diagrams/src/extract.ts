import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { githubSlug, headingText, slugify } from './slug.js';

/** One ```mermaid fence in a Markdown document. */
export interface Diagram {
  /** `<doc>/<slug>`, e.g. `api/create-post-api-todos`. */
  id: string;
  /** Repository-relative Markdown path, e.g. `docs/api.md`. */
  file: string;
  /** 1-based line of the opening fence. */
  line: number;
  /** 1-based line of the closing fence. */
  endLine: number;
  /** Plain text of the nearest preceding heading ('' when there is none). */
  heading: string;
  /** GitHub anchor of that heading within the document ('' when there is none). */
  anchor: string;
  /** The diagram's Mermaid text, normalised. */
  source: string;
  hash: string;
}

const FENCE_MARKER = /^(?:`{3,}|~{3,})/;
const HEADING = /^#{1,6}\s+\S/;
/** A mermaid fence this tool can't handle: indented, or an info string that isn't bare `mermaid`. */
const UNSUPPORTED_MERMAID_FENCE = /^\s*(?:`{3,}|~{3,})\s*mermaid\b/;

const KINDS: Readonly<Record<string, string>> = {
  sequenceDiagram: 'sequence diagram',
  flowchart: 'flowchart',
  graph: 'flowchart',
  stateDiagram: 'state diagram',
  'stateDiagram-v2': 'state diagram',
  erDiagram: 'entity-relationship diagram',
  classDiagram: 'class diagram',
};

export function docName(file: string): string {
  return file === 'README.md' ? 'readme' : posix.basename(file, '.md');
}

export function normalise(source: string): string {
  return source.replace(/\r\n/g, '\n').trim();
}

export function hashSource(source: string): string {
  return createHash('sha256').update(normalise(source)).digest('hex');
}

export function diagramKind(source: string): string {
  const keyword = normalise(source).replace(/\s[\s\S]*$/, '');
  return KINDS[keyword] ?? 'diagram';
}

export function altText(diagram: Diagram): string {
  const kind = diagramKind(diagram.source);
  return diagram.heading === '' ? kind : `${diagram.heading} (${kind})`;
}

/** Counts names so repeats get GitHub-style (`-1`) or id-style (`-2`) suffixes. */
function counter(): (name: string) => number {
  const seen = new Map<string, number>();
  return (name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count;
  };
}

function isClosingFence(line: string, marker: string): boolean {
  const text = line.trimEnd();
  return text.length >= marker.length && [...text].every((char) => char === marker[0]);
}

interface OpenFence {
  marker: string;
  mermaid: boolean;
  line: number;
  body: string[];
}

export function extractDiagrams(file: string, markdown: string): Diagram[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const doc = docName(file);
  const anchorRepeat = counter();
  const slugRepeat = counter();
  const diagrams: Diagram[] = [];
  let heading = '';
  let anchor = '';
  let fence: OpenFence | undefined;

  for (const [index, line] of lines.entries()) {
    if (fence !== undefined) {
      if (!isClosingFence(line, fence.marker)) {
        fence.body.push(line);
        continue;
      }
      if (fence.mermaid) {
        const base = slugify(heading) || 'diagram';
        const repeat = slugRepeat(base);
        const source = normalise(fence.body.join('\n'));
        diagrams.push({
          id: `${doc}/${repeat === 0 ? base : `${base}-${repeat + 1}`}`,
          file,
          line: fence.line,
          endLine: index + 1,
          heading,
          anchor,
          source,
          hash: hashSource(source),
        });
      }
      fence = undefined;
      continue;
    }
    const marker = FENCE_MARKER.exec(line)?.[0];
    if (marker !== undefined) {
      const info = line.slice(marker.length).trim();
      if (info !== 'mermaid' && UNSUPPORTED_MERMAID_FENCE.test(line)) {
        throw new Error(
          `${file}:${index + 1}: unsupported mermaid fence — put a bare \`\`\`mermaid fence at column 0`,
        );
      }
      fence = { marker, mermaid: info === 'mermaid', line: index + 1, body: [] };
      continue;
    }
    if (UNSUPPORTED_MERMAID_FENCE.test(line)) {
      throw new Error(
        `${file}:${index + 1}: unsupported mermaid fence — put a bare \`\`\`mermaid fence at column 0`,
      );
    }
    if (HEADING.test(line)) {
      heading = headingText(line);
      const base = githubSlug(heading);
      const repeat = anchorRepeat(base);
      anchor = repeat === 0 ? base : `${base}-${repeat}`;
    }
  }

  if (fence?.mermaid === true) throw new Error(`${file}:${fence.line}: unclosed mermaid fence`);
  return diagrams;
}
