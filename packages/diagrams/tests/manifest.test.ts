import { describe, expect, it } from 'vitest';
import { extractDiagrams } from '../src/extract.js';
import { buildManifest, parseManifest, serialiseManifest } from '../src/manifest.js';
import { single } from './support/single.js';

const diagrams = extractDiagrams('docs/api.md', '## List\n```mermaid\nsequenceDiagram\n```\n');

describe('manifest', () => {
  it('records id, file, heading, image and hash per diagram', () => {
    expect(buildManifest(diagrams)).toEqual({
      diagrams: [
        {
          id: 'api/list',
          file: 'docs/api.md',
          heading: 'List',
          image: 'docs/diagrams/api/list.svg',
          hash: single(diagrams).hash,
        },
      ],
    });
  });

  it('round-trips through its JSON form, which ends with a newline', () => {
    const text = serialiseManifest(buildManifest(diagrams));
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseManifest(text)).toEqual(buildManifest(diagrams));
  });

  it.each([
    ['not json', 'not JSON'],
    ['null', 'not a diagram manifest'],
    ['[]', 'not a diagram manifest'],
    ['{"diagrams":[1]}', 'not a diagram manifest'],
    ['{"diagrams":[null]}', 'not a diagram manifest'],
    ['{"diagrams":[{"id":1}]}', 'not a diagram manifest'],
  ])('rejects %s', (text, message) => {
    expect(() => parseManifest(text)).toThrow(message);
  });
});
