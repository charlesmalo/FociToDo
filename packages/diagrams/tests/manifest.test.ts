import { describe, expect, it } from 'vitest';
import { extractDiagrams } from '../src/extract.js';
import { buildManifest, parseManifest, serialiseManifest } from '../src/manifest.js';
import { single } from './support/single.js';

const diagrams = extractDiagrams('docs/api.md', '## List\n```mermaid\nsequenceDiagram\n```\n');
const stamps = new Map([['api/list', 'stamp']]);

describe('manifest', () => {
  it('records id, file, heading, image, hash and depicts stamp per diagram', () => {
    expect(buildManifest(diagrams, stamps)).toEqual({
      diagrams: [
        {
          id: 'api/list',
          file: 'docs/api.md',
          heading: 'List',
          image: 'docs/diagrams/api/list.svg',
          hash: single(diagrams).hash,
          depictsHash: 'stamp',
        },
      ],
    });
  });

  it('refuses a diagram without a depicts stamp', () => {
    expect(() => buildManifest(diagrams, new Map())).toThrow('api/list: no depicts stamp');
  });

  it('round-trips through its JSON form, which ends with a newline', () => {
    const text = serialiseManifest(buildManifest(diagrams, stamps));
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseManifest(text)).toEqual(buildManifest(diagrams, stamps));
  });

  it.each([
    ['not json', 'not JSON'],
    ['null', 'not a diagram manifest'],
    ['[]', 'not a diagram manifest'],
    ['{"diagrams":[1]}', 'not a diagram manifest'],
    ['{"diagrams":[null]}', 'not a diagram manifest'],
    ['{"diagrams":[{"id":1}]}', 'not a diagram manifest'],
    [
      '{"diagrams":[{"id":"a","file":"b","heading":"c","image":"d","hash":"e"}]}',
      'not a diagram manifest',
    ],
  ])('rejects %s', (text, message) => {
    expect(() => parseManifest(text)).toThrow(message);
  });
});
