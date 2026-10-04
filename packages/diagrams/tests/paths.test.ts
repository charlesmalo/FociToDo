import { describe, expect, it } from 'vitest';
import {
  FIX_COMMAND,
  imagePath,
  MANIFEST_PATH,
  relativeImagePath,
  resolveLink,
} from '../src/paths.js';

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

  it('resolves a link written in a document to a repository path', () => {
    expect(resolveLink('README.md', 'docs/images/screenshot.png')).toBe(
      'docs/images/screenshot.png',
    );
    expect(resolveLink('docs/ui.md', 'images/edit-dialog.png')).toBe('docs/images/edit-dialog.png');
    expect(resolveLink('docs/ui.md', './images/../images/x.png')).toBe('docs/images/x.png');
    expect(resolveLink('docs/ui.md', '../docs/images/x.png')).toBe('docs/images/x.png');
  });
});
