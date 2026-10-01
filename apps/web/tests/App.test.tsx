import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App, isDevPath } from '../src/App';
import { fakeClient } from './support/fixtures';

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg></svg>' })) },
}));

describe('isDevPath', () => {
  it.each([
    ['/dev', true],
    ['/dev/', true],
    ['/dev/anything', true],
    ['/', false],
    ['/developer', false],
  ])('%s → %s', (pathname, expected) => {
    expect(isDevPath(pathname)).toBe(expected);
  });
});

describe('App', () => {
  it('renders the todo page with its providers', async () => {
    const client = fakeClient({ list: vi.fn(async () => []) });
    render(<App client={client} queryClient={new QueryClient()} pathname="/" />);
    expect(screen.getByRole('heading', { name: 'FociToDo' })).toBeInTheDocument();
    expect(await screen.findByText('No tasks yet. Add your first one.')).toBeInTheDocument();
  });

  it('lazy-loads the developer portal on /dev', async () => {
    render(<App client={fakeClient()} queryClient={new QueryClient()} pathname="/dev" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading developer portal…');
    expect(await screen.findByRole('heading', { name: 'Developer portal' })).toBeInTheDocument();
  });

  it('reads the current location by default', () => {
    const client = fakeClient({ list: vi.fn(async () => []) });
    render(<App client={client} queryClient={new QueryClient()} />);
    expect(screen.getByRole('heading', { name: 'FociToDo' })).toBeInTheDocument();
  });
});
