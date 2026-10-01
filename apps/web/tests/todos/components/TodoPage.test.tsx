import { DEFAULT_LIST_QUERY } from '@foci/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TodoPage } from '../../../src/todos/components/TodoPage';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

describe('TodoPage', () => {
  it('lists todos, refetches when filters change and opens details', async () => {
    const todo = makeView({ title: 'Read me' });
    const list = vi.fn(async () => [todo]);
    const get = vi.fn(async () => todo);
    renderWithProviders(<TodoPage />, fakeClient({ list, get }));
    expect(screen.getByRole('link', { name: 'Developer' })).toHaveAttribute('href', '/dev');
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'Completed');
    await vi.waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, status: 'completed' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Read me' }));
    expect(await screen.findByRole('dialog', { name: 'Task details' })).toBeInTheDocument();
  });

  it('creates a task and shows it after the list refreshes', async () => {
    const created = makeView({ title: 'Brand new' });
    const list = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([created]);
    const create = vi.fn(async () => created);
    renderWithProviders(<TodoPage />, fakeClient({ list, create }));
    await userEvent.click(screen.getByRole('button', { name: '+ New task' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Brand new');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(await screen.findByRole('button', { name: 'Brand new' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
