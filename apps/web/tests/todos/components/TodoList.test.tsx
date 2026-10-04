import { DEFAULT_LIST_QUERY } from '@foci/shared';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TodoList } from '../../../src/todos/components/TodoList';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

describe('TodoList', () => {
  it('shows a loading state, then the todos', async () => {
    const todos = [makeView({ title: 'First' }), makeView({ title: 'Second' })];
    const client = fakeClient({ list: vi.fn(async () => todos) });
    renderWithProviders(<TodoList query={DEFAULT_LIST_QUERY} onOpen={vi.fn()} />, client);
    expect(screen.getByRole('status')).toHaveTextContent('Loading tasks…');
    const list = await screen.findByRole('list', { name: 'Tasks' });
    expect(list).toHaveTextContent('First');
    expect(list).toHaveTextContent('Second');
    expect(client.list).toHaveBeenCalledWith(DEFAULT_LIST_QUERY);
  });

  it('distinguishes an empty list from an empty filter', async () => {
    const client = fakeClient({ list: vi.fn(async () => []) });
    const { unmount } = renderWithProviders(
      <TodoList query={DEFAULT_LIST_QUERY} onOpen={vi.fn()} />,
      client,
    );
    expect(await screen.findByText('No tasks yet. Add your first one.')).toBeInTheDocument();
    unmount();
    renderWithProviders(
      <TodoList query={{ ...DEFAULT_LIST_QUERY, status: 'overdue' }} onOpen={vi.fn()} />,
      client,
    );
    expect(await screen.findByText('No tasks match this filter.')).toBeInTheDocument();
  });

  it('shows an error with a working retry', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce([makeView({ title: 'Recovered' })]);
    renderWithProviders(
      <TodoList query={DEFAULT_LIST_QUERY} onOpen={vi.fn()} />,
      fakeClient({ list }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Recovered')).toBeInTheDocument();
  });

  it('keeps the rows on screen when a background refresh fails, with a working retry', async () => {
    const todos = [makeView({ title: 'First' })];
    const list = vi
      .fn()
      .mockResolvedValueOnce(todos)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(todos);
    const { queryClient } = renderWithProviders(
      <TodoList query={DEFAULT_LIST_QUERY} onOpen={vi.fn()} />,
      fakeClient({ list }),
    );
    expect(await screen.findByRole('list', { name: 'Tasks' })).toHaveTextContent('First');

    await act(() => queryClient.refetchQueries());
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
    expect(screen.getByRole('list', { name: 'Tasks' })).toHaveTextContent('First');

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('list', { name: 'Tasks' })).toHaveTextContent('First');
  });
});
