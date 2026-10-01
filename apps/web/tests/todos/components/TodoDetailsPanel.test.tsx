import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/api/ApiError';
import { TodoDetailsPanel } from '../../../src/todos/components/TodoDetailsPanel';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

const problem = (status: number, detail = 'Problem') =>
  new ApiError({ type: '/problems/x', title: 'x', status, detail });

function setup(clientOverrides: Parameters<typeof fakeClient>[0], editing = false) {
  const props = { onEditingChange: vi.fn(), onClose: vi.fn() };
  const client = fakeClient(clientOverrides);
  const result = renderWithProviders(
    <TodoDetailsPanel id="todo-1" editing={editing} {...props} />,
    client,
  );
  return { ...props, client, ...result };
}

describe('TodoDetailsPanel — viewing', () => {
  it('shows loading, then every field', async () => {
    const todo = makeView({
      title: 'File taxes',
      description: 'Blue folder',
      dueDate: '2026-09-01',
      isOverdue: true,
      isCompleted: false,
    });
    setup({ get: vi.fn(async () => todo) });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(await screen.findByText('File taxes')).toBeInTheDocument();
    expect(screen.getByText('Blue folder')).toBeInTheDocument();
    expect(screen.getByText(/2026-09-01/)).toHaveTextContent('Overdue');
    expect(screen.getByText('Not completed')).toBeInTheDocument();
  });

  it('shows placeholders for empty optional fields and completed status', async () => {
    setup({ get: vi.fn(async () => makeView({ isCompleted: true })) });
    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('explains a todo that no longer exists', async () => {
    setup({ get: vi.fn(async () => Promise.reject(problem(404))) });
    expect(await screen.findByRole('alert')).toHaveTextContent('This task no longer exists.');
  });

  it('shows other load errors', async () => {
    setup({ get: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });

  it('switches to edit mode', async () => {
    const { onEditingChange } = setup({ get: vi.fn(async () => makeView()) });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(onEditingChange).toHaveBeenCalledWith(true);
  });
});

describe('TodoDetailsPanel — editing', () => {
  it('saves with the current version and leaves edit mode', async () => {
    const todo = makeView({ title: 'Old', version: 3 });
    const update = vi.fn(async () => makeView({ ...todo, title: 'New', version: 4 }));
    const { onEditingChange } = setup({ get: vi.fn(async () => todo), update }, true);
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onEditingChange).toHaveBeenCalledWith(false));
    expect(update).toHaveBeenCalledWith(todo.id, 3, {
      title: 'New',
      description: null,
      dueDate: null,
    });
  });

  it('on 412 shows a conflict notice, reloads, keeps the edits and saves against the new version', async () => {
    const stale = makeView({ title: 'Old', version: 1 });
    const fresh = makeView({ ...stale, title: 'Changed elsewhere', version: 2 });
    const get = vi.fn().mockResolvedValueOnce(stale).mockResolvedValue(fresh);
    const update = vi
      .fn()
      .mockRejectedValueOnce(problem(412))
      .mockResolvedValueOnce(makeView({ ...fresh, title: 'Mine', version: 3 }));
    const { onEditingChange } = setup({ get, update }, true);
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Mine');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere');
    expect(screen.getByLabelText('Title')).toHaveValue('Mine');
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onEditingChange).toHaveBeenCalledWith(false));
    expect(update.mock.calls.map((call) => call[1])).toEqual([1, 2]);
  });

  it('lets the form show other save errors', async () => {
    const update = vi.fn(async () => Promise.reject(problem(500, 'Server exploded')));
    setup({ get: vi.fn(async () => makeView()), update }, true);
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded');
  });

  it('cancels editing', async () => {
    const { onEditingChange } = setup({ get: vi.fn(async () => makeView()) }, true);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });
});

describe('TodoDetailsPanel — deleting', () => {
  it('asks for confirmation and can be cancelled', async () => {
    const remove = vi.fn();
    setup({ get: vi.fn(async () => makeView()), remove });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('group', { name: 'Confirm delete' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes with the current version and closes', async () => {
    const todo = makeView({ version: 5 });
    const remove = vi.fn(async () => undefined);
    const { onClose } = setup({ get: vi.fn(async () => todo), remove });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(remove).toHaveBeenCalledWith(todo.id, 5);
  });

  it('reloads after a 404 so the panel explains the task is gone', async () => {
    const get = vi.fn().mockResolvedValueOnce(makeView()).mockRejectedValue(problem(404));
    const remove = vi.fn(async () => Promise.reject(problem(404)));
    setup({ get, remove });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('This task no longer exists.')).toBeInTheDocument();
  });

  it('shows a conflict notice after a 412 and reloads', async () => {
    const get = vi.fn().mockResolvedValue(makeView());
    const remove = vi.fn(async () => Promise.reject(problem(412)));
    setup({ get, remove });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check it before deleting');
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('shows other delete errors', async () => {
    const remove = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
    setup({ get: vi.fn(async () => makeView()), remove });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });
});
