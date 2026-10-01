import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevPortal } from '../../src/dev/DevPortal';
import { createDocLibrary } from '../../src/dev/docs';

const library = createDocLibrary(
  {
    '../../../../README.md': '# Overview doc',
    '../../../../docs/api.md': '# API doc',
    '../../../../docs/decisions/README.md': '# Decisions index',
    '../../../../docs/decisions/0004-optimistic-locking-with-etags.md': '# 0004 Optimistic locking',
  },
  {},
);

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg></svg>' })) },
}));

function navigate(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('DevPortal', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('shows the overview, build info and a way back to the app', () => {
    render(<DevPortal library={library} />);
    expect(screen.getByRole('heading', { name: 'Overview doc' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Back to app' })).toHaveAttribute('href', '/');
    expect(screen.getByText('v1.2.3 · commit abcdef0 · built 2026-10-01')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

  it('switches tabs from the hash and links the API explorer', () => {
    render(<DevPortal library={library} />);
    navigate('#api');
    expect(screen.getByRole('heading', { name: 'API doc' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'API' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
    const explorer = screen.getByRole('link', { name: 'API explorer →' });
    expect(explorer).toHaveAttribute('href', '/api/docs');
    expect(explorer).toHaveAttribute('target', '_blank');
  });

  it('shows one decision with a link back to the index', () => {
    render(<DevPortal library={library} />);
    navigate('#decisions');
    expect(screen.getByRole('heading', { name: 'Decisions index' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '← All decisions' })).not.toBeInTheDocument();
    navigate('#decisions/0004-optimistic-locking-with-etags');
    expect(screen.getByRole('heading', { name: '0004 Optimistic locking' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← All decisions' })).toHaveAttribute(
      'href',
      '#decisions',
    );
  });

  it('reports a missing document', () => {
    render(<DevPortal library={library} />);
    navigate('#testing');
    expect(screen.getByRole('alert')).toHaveTextContent('Document not found.');
  });

  it('starts each document with fresh diagram state', async () => {
    const diagrams = createDocLibrary(
      {
        '../../../../README.md': '# Overview doc\n\n```mermaid\nflowchart LR\n```\n',
        '../../../../docs/api.md': '# API doc\n\n```mermaid\nsequenceDiagram\n```\n',
      },
      {},
    );
    render(<DevPortal library={diagrams} />);
    expect(await screen.findByRole('img', { name: 'Diagram' })).toBeInTheDocument();
    navigate('#api');
    expect(screen.getByRole('heading', { name: 'API doc' })).toBeInTheDocument();
    // A reused MermaidBlock would still show the overview's diagram here.
    expect(screen.queryByRole('img', { name: 'Diagram' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Rendering diagram…');
    expect(await screen.findByRole('img', { name: 'Diagram' })).toBeInTheDocument();
  });

  it('uses the bundled repository docs by default', () => {
    render(<DevPortal />);
    expect(screen.getByRole('heading', { level: 1, name: 'Developer portal' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'FociToDo' }).length).toBeGreaterThan(0);
  });
});
