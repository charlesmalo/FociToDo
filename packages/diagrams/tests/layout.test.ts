import { describe, expect, it } from 'vitest';
import { extractDiagrams } from '../src/extract.js';
import { checkLayout, DETAILS_CLOSE, DETAILS_OPEN, expectedImageLine } from '../src/layout.js';
import { single } from './support/single.js';

const good = [
  '## Flow',
  '',
  '![Flow (flowchart)](diagrams/testing/flow.svg)',
  '',
  DETAILS_OPEN,
  '',
  '```mermaid',
  'flowchart LR',
  '```',
  '',
  DETAILS_CLOSE,
].join('\n');

const check = (markdown: string, file = 'docs/testing.md') =>
  checkLayout(markdown, extractDiagrams(file, markdown));

describe('expectedImageLine', () => {
  it('uses the alt text and the path relative to the document', () => {
    const diagram = single(
      extractDiagrams('README.md', '## Design overview\n```mermaid\nflowchart LR\n```'),
    );
    expect(expectedImageLine(diagram)).toBe(
      '![Design overview (flowchart)](docs/diagrams/readme/design-overview.svg)',
    );
  });
});

describe('checkLayout', () => {
  it('accepts image, blank, details, blank, fence, blank, /details', () => {
    expect(check(good)).toEqual([]);
  });

  it('accepts the same layout with CRLF line endings', () => {
    expect(check(good.replace(/\n/g, '\r\n'))).toEqual([]);
  });

  const noBlankAboveFence = [
    '## Flow',
    '',
    '![Flow (flowchart)](diagrams/testing/flow.svg)',
    '',
    DETAILS_OPEN,
    '```mermaid',
    'flowchart LR',
    '```',
    '',
    DETAILS_CLOSE,
  ].join('\n');

  const noBlankBelowFence = [
    '## Flow',
    '',
    '![Flow (flowchart)](diagrams/testing/flow.svg)',
    '',
    DETAILS_OPEN,
    '',
    '```mermaid',
    'flowchart LR',
    '```',
    DETAILS_CLOSE,
  ].join('\n');

  const noBlankAboveDetails = [
    '## Flow',
    '',
    '![Flow (flowchart)](diagrams/testing/flow.svg)',
    DETAILS_OPEN,
    '',
    '```mermaid',
    'flowchart LR',
    '```',
    '',
    DETAILS_CLOSE,
  ].join('\n');

  const imageIndented4 = [
    '## Flow',
    '',
    '    ![Flow (flowchart)](diagrams/testing/flow.svg)',
    '',
    DETAILS_OPEN,
    '',
    '```mermaid',
    'flowchart LR',
    '```',
    '',
    DETAILS_CLOSE,
  ].join('\n');

  const noBlankAfterClose = [
    '## Flow',
    '',
    '![Flow (flowchart)](diagrams/testing/flow.svg)',
    '',
    DETAILS_OPEN,
    '',
    '```mermaid',
    'flowchart LR',
    '```',
    '',
    DETAILS_CLOSE,
    'Not blank.',
  ].join('\n');

  it.each([
    ['a bare fence', ['## Flow', '```mermaid', 'flowchart LR', '```'].join('\n')],
    ['a wrong image path', good.replace('diagrams/testing/flow.svg', 'diagrams/testing/other.svg')],
    ['a wrong alt text', good.replace('Flow (flowchart)', 'Flow')],
    ['a missing </details>', good.replace(DETAILS_CLOSE, '')],
    ['a missing image', good.replace('![Flow (flowchart)](diagrams/testing/flow.svg)', '')],
    ['no blank line between <details> and the fence', noBlankAboveFence],
    ['no blank line between the fence and </details>', noBlankBelowFence],
    ['no blank line between the image and <details>', noBlankAboveDetails],
    ['the image line indented 4 spaces (renders as a code block)', imageIndented4],
    ['</details> directly followed by a non-blank line', noBlankAfterClose],
  ])('reports %s with the exact expected lines', (_name, markdown) => {
    expect(check(markdown)).toEqual([
      'docs/testing.md:' +
        String(markdown.split('\n').indexOf('```mermaid') + 1) +
        ': testing/flow must be shown as its image above its collapsed source — expected ' +
        '"![Flow (flowchart)](diagrams/testing/flow.svg)", then "<details><summary>Mermaid source</summary>" ' +
        'above the fence and "</details>" below it',
    ]);
  });

  it.each([
    ['a bare fence on the first line', ['```mermaid', 'flowchart LR', '```'], 1],
    [
      '<details> with no image above it',
      [DETAILS_OPEN, '', '```mermaid', 'flowchart LR', '```', '', DETAILS_CLOSE],
      3,
    ],
  ])('reports %s', (_name, lines, line) => {
    expect(check(lines.join('\n'))).toEqual([
      `docs/testing.md:${line}: testing/diagram must be shown as its image above its collapsed source — expected ` +
        '"![flowchart](diagrams/testing/diagram.svg)", then "<details><summary>Mermaid source</summary>" ' +
        'above the fence and "</details>" below it',
    ]);
  });
});
