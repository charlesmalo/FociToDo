import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDocLibrary } from '../../src/dev/docs';
import { DocView } from '../../src/dev/DocView';
import { REPO_URL } from '../../src/dev/links';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg data-testid="diagram"></svg>' })),
  },
}));

const markdown = `# Guide

| A | B |
|---|---|
| 1 | 2 |

See [API](./api.md), [ADR](./decisions/0004-optimistic-locking-with-etags.md), [rules](../CLAUDE.md), [explorer](/api/docs) and [RFC](https://www.rfc-editor.org/rfc/rfc9457).

![Shot](./images/shot.png)

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

\`\`\`bash
docker compose up
\`\`\`

Inline \`code\`.
`;

const library = createDocLibrary({}, { '../../../../docs/images/shot.png': '/assets/shot.png' });

describe('DocView', () => {
  it('renders GitHub-flavoured Markdown with rewritten links, bundled images and diagrams', async () => {
    render(<DocView page={{ path: 'docs/architecture.md', markdown }} library={library} />);
    expect(screen.getByRole('heading', { name: 'Guide' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'API' })).toHaveAttribute('href', '#api');
    expect(screen.getByRole('link', { name: 'ADR' })).toHaveAttribute(
      'href',
      '#decisions/0004-optimistic-locking-with-etags',
    );
    const rules = screen.getByRole('link', { name: 'rules' });
    expect(rules).toHaveAttribute('href', `${REPO_URL}CLAUDE.md`);
    expect(rules).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'explorer' })).toHaveAttribute('href', '/api/docs');
    expect(screen.getByRole('link', { name: 'explorer' })).not.toHaveAttribute('target');
    expect(screen.getByRole('img', { name: 'Shot' })).toHaveAttribute('src', '/assets/shot.png');
    expect(await screen.findByTestId('diagram')).toBeInTheDocument();
    expect(screen.getByText('docker compose up')).toBeInTheDocument();
    expect(screen.getByText('code').tagName).toBe('CODE');
  });
});
