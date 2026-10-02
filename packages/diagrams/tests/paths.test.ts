import { describe, expect, it } from 'vitest';
import { FIX_COMMAND, imagePath, MANIFEST_PATH, relativeImagePath } from '../src/paths.js';

describe('paths', () => {
  it('places images and the manifest under docs/diagrams', () => {
    expect(imagePath('api/create-post-api-todos')).toBe(
      'docs/diagrams/api/create-post-api-todos.svg',
    );
    expect(MANIFEST_PATH).toBe('docs/diagrams/manifest.json');
    expect(FIX_COMMAND).toBe('docker compose --profile docs run --rm --build diagrams');
  });

  it('links images relative to the document that shows them', () => {
    expect(relativeImagePath('README.md', 'readme/design-overview')).toBe(
      'docs/diagrams/readme/design-overview.svg',
    );
    expect(relativeImagePath('docs/api.md', 'api/list-get-api-todos')).toBe(
      'diagrams/api/list-get-api-todos.svg',
    );
  });
});
