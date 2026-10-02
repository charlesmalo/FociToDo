import { describe, expect, it } from 'vitest';
import {
  altText,
  diagramKind,
  docName,
  extractDiagrams,
  hashSource,
  normalise,
} from '../src/extract.js';
import { single } from './support/single.js';

const md = (...lines: string[]): string => lines.join('\n');

describe('docName', () => {
  it.each([
    ['README.md', 'readme'],
    ['docs/api.md', 'api'],
    ['docs/concurrency.md', 'concurrency'],
  ])('%s → %s', (file, expected) => {
    expect(docName(file)).toBe(expected);
  });
});

describe('normalise and hashSource', () => {
  it('trims and converts CRLF so equivalent sources hash the same', () => {
    expect(normalise('\r\n  flowchart LR\r\n  A-->B\r\n')).toBe('flowchart LR\n  A-->B');
    expect(hashSource('flowchart LR\r\n  A-->B\r\n')).toBe(hashSource('flowchart LR\n  A-->B'));
    expect(hashSource('flowchart LR\n  A-->B')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the source changes', () => {
    expect(hashSource('flowchart LR\n  A-->B')).not.toBe(hashSource('flowchart LR\n  A-->C'));
  });
});

describe('diagramKind and altText', () => {
  it.each([
    ['sequenceDiagram\n  A->>B: hi', 'sequence diagram'],
    ['flowchart LR\n  A-->B', 'flowchart'],
    ['graph TD\n  A-->B', 'flowchart'],
    ['stateDiagram-v2\n  [*] --> A', 'state diagram'],
    ['stateDiagram\n  [*] --> A', 'state diagram'],
    ['erDiagram\n  A ||--o{ B : has', 'entity-relationship diagram'],
    ['classDiagram\n  A <|-- B', 'class diagram'],
    ['pie\n  "a": 1', 'diagram'],
  ])('%#: kind of %s', (source, kind) => {
    expect(diagramKind(source)).toBe(kind);
  });

  it('combines heading and kind, or uses the kind alone without a heading', () => {
    const withHeading = single(
      extractDiagrams('docs/x.md', md('## Data model', '```mermaid', 'erDiagram', '```')),
    );
    const withoutHeading = single(
      extractDiagrams('docs/x.md', md('```mermaid', 'erDiagram', '```')),
    );
    expect(altText(withHeading)).toBe('Data model (entity-relationship diagram)');
    expect(altText(withoutHeading)).toBe('entity-relationship diagram');
  });
});

describe('extractDiagrams', () => {
  it('extracts each mermaid fence with its id, lines, heading, anchor, source and hash', () => {
    const text = md(
      '# API',
      '',
      '### Create — `POST /api/todos`',
      '',
      '```mermaid',
      'sequenceDiagram',
      '  C->>A: POST',
      '```',
    );
    expect(extractDiagrams('docs/api.md', text)).toEqual([
      {
        id: 'api/create-post-api-todos',
        file: 'docs/api.md',
        line: 5,
        endLine: 8,
        heading: 'Create — POST /api/todos',
        anchor: 'create--post-apitodos',
        source: 'sequenceDiagram\n  C->>A: POST',
        hash: hashSource('sequenceDiagram\n  C->>A: POST'),
      },
    ]);
  });

  it('ignores headings and mermaid fences inside other code blocks', () => {
    const text = md(
      '## Real heading',
      '```bash',
      '# not a heading',
      '```',
      '````markdown',
      '```mermaid',
      'flowchart LR',
      '```',
      '````',
      '```mermaid',
      'flowchart LR',
      '```',
    );
    const diagrams = extractDiagrams('README.md', text);
    expect(diagrams.map((d) => [d.id, d.heading, d.line])).toEqual([
      ['readme/real-heading', 'Real heading', 10],
    ]);
  });

  it('suffixes repeated slugs in one document and falls back to "diagram"', () => {
    const text = md(
      '```mermaid',
      'flowchart LR',
      '```',
      '## Flow',
      '```mermaid',
      'flowchart LR',
      '```',
      '```mermaid',
      'flowchart TB',
      '```',
      '## —',
      '```mermaid',
      'flowchart LR',
      '```',
    );
    expect(extractDiagrams('docs/testing.md', text).map((d) => d.id)).toEqual([
      'testing/diagram',
      'testing/flow',
      'testing/flow-2',
      'testing/diagram-2',
    ]);
  });

  it('numbers repeated heading anchors like GitHub', () => {
    const text = md('## Layers', 'text', '## Layers', '```mermaid', 'flowchart LR', '```');
    const diagram = single(extractDiagrams('docs/testing.md', text));
    expect(diagram.anchor).toBe('layers-1');
    expect(diagram.id).toBe('testing/layers');
  });

  it('reads CRLF documents', () => {
    const text = '## Flow\r\n```mermaid\r\nflowchart LR\r\n  A-->B\r\n```\r\n';
    const diagram = single(extractDiagrams('docs/x.md', text));
    expect(diagram.source).toBe('flowchart LR\n  A-->B');
    expect(diagram.endLine).toBe(5);
  });

  it('ignores an unclosed non-mermaid fence but rejects an unclosed mermaid fence', () => {
    expect(extractDiagrams('docs/x.md', md('```bash', 'echo'))).toEqual([]);
    expect(() => extractDiagrams('docs/x.md', md('## A', '```mermaid', 'flowchart LR'))).toThrow(
      'docs/x.md:2: unclosed mermaid fence',
    );
  });

  it('rejects an indented mermaid fence instead of silently ignoring it', () => {
    expect(() =>
      extractDiagrams('docs/x.md', md('## A', '  ```mermaid', 'flowchart LR', '  ```')),
    ).toThrow('docs/x.md:2: unsupported mermaid fence — put a bare ```mermaid fence at column 0');
  });

  it('rejects a mermaid fence whose info string has extra words', () => {
    expect(() =>
      extractDiagrams('docs/x.md', md('```mermaid title', 'flowchart LR', '```')),
    ).toThrow('docs/x.md:1: unsupported mermaid fence — put a bare ```mermaid fence at column 0');
  });

  it('supports a tilde fence with "mermaid" after trimming the info string', () => {
    const diagram = single(extractDiagrams('docs/x.md', md('~~~ mermaid', 'flowchart LR', '~~~')));
    expect(diagram.source).toBe('flowchart LR');
  });

  it('still ignores a mermaid-looking fence line nested inside another open fence', () => {
    const text = md('````markdown', '```mermaid', 'flowchart LR', '```', '````');
    expect(extractDiagrams('docs/x.md', text)).toEqual([]);
  });
});
