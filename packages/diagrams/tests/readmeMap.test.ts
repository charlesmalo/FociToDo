import { describe, expect, it } from 'vitest';
import { extractDiagrams } from '../src/extract.js';
import { checkReadmeMap, sourceLink } from '../src/readmeMap.js';
import { single } from './support/single.js';

const readmeDiagram = single(
  extractDiagrams('README.md', '## Design overview\n```mermaid\nflowchart LR\n```'),
);
const apiDiagram = single(
  extractDiagrams('docs/api.md', '### List — `GET /api/todos`\n```mermaid\nsequenceDiagram\n```'),
);
const noHeading = single(extractDiagrams('docs/api.md', '```mermaid\nsequenceDiagram\n```'));
const readmeNoHeading = single(extractDiagrams('README.md', '```mermaid\nflowchart LR\n```'));

const row = (label: string, image: string, source: string) =>
  `| ${label} | [SVG](${image}) | [Mermaid](${source}) |`;

describe('sourceLink', () => {
  it('links the heading anchor, in the same file for README diagrams', () => {
    expect(sourceLink(readmeDiagram)).toBe('#design-overview');
    expect(sourceLink(apiDiagram)).toBe('docs/api.md#list--get-apitodos');
    expect(sourceLink(noHeading)).toBe('docs/api.md');
    expect(sourceLink(readmeNoHeading)).toBe('README.md');
  });
});

describe('checkReadmeMap', () => {
  const both = [readmeDiagram, apiDiagram];

  it('accepts one row per diagram with its image and source links', () => {
    const readme = [
      row('Design overview', 'docs/diagrams/readme/design-overview.svg', '#design-overview'),
      row('List', 'docs/diagrams/api/list-get-api-todos.svg', 'docs/api.md#list--get-apitodos'),
    ].join('\n');
    expect(checkReadmeMap(readme, both)).toEqual([]);
  });

  it('reports a missing row, a wrong source link and a link to an unknown image', () => {
    const readme = [
      row('List', 'docs/diagrams/api/list-get-api-todos.svg', 'docs/api.md#list'),
      '![stray](docs/diagrams/api/gone.svg)',
    ].join('\n');
    expect(checkReadmeMap(readme, both)).toEqual([
      'README.md: the diagram map has no row for readme/design-overview (image link "docs/diagrams/readme/design-overview.svg")',
      'README.md: the map row for api/list-get-api-todos must link its Mermaid source "docs/api.md#list--get-apitodos"',
      'README.md: links docs/diagrams/api/gone.svg, which is not a diagram image',
    ]);
  });
});
