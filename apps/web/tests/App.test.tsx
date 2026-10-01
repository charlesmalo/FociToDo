import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { fakeClient } from './support/fixtures';

describe('App', () => {
  it('provides the client and query cache to the todo page', async () => {
    const client = fakeClient({ list: vi.fn(async () => []) });
    render(<App client={client} queryClient={new QueryClient()} />);
    expect(screen.getByRole('heading', { name: 'FociToDo' })).toBeInTheDocument();
    expect(await screen.findByText('No tasks yet. Add your first one.')).toBeInTheDocument();
  });
});
