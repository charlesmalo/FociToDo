import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/api/ApiError';
import { formatDeadline } from '../../../src/todos/format';
import { TodoDetailsPanel } from '../../../src/todos/components/TodoDetailsPanel';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

// The deadline text depends on the viewer's locale and timezone; pin it so these tests do not.
vi.mock('../../../src/todos/format', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  formatDeadline: (iso: string) => `deadline ${iso}`,
}));

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
      dueAt: '2026-09-01T10:00:00.000Z',
      isOverdue: true,
      isCompleted: false,
    });
    setup({ get: vi.fn(async () => todo) });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(await screen.findByText('File taxes')).toBeInTheDocument();
    expect(screen.getByText('Blue folder')).toBeInTheDocument();
    const due = screen.getByText(formatDeadline('2026-09-01T10:00:00.000Z'), { exact: false });
    expect(screen.getByText('Due', { selector: 'dt' })).toBeInTheDocument();
    expect(due).toHaveTextContent('Overdue');
    expect(due).not.toHaveTextContent('Due soon');
    expect(screen.getByText('Not completed')).toBeInTheDocument();
  });

  it('shows the deadline and a due-soon badge', async () => {
    setup({
      get: vi.fn(async () => makeView({ dueAt: '2026-10-04T10:00:00.000Z', isDueSoon: true })),
    });
    const due = await screen.findByText(formatDeadline('2026-10-04T10:00:00.000Z'), {
      exact: false,
    });
    expect(due).toHaveTextContent('Due soon');
    expect(due).not.toHaveTextContent('Overdue');
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
    expect(update).toHaveBeenCalledWith(todo.id, 3, { title: 'New' });
  });

  it('sends only a cleared description as null', async () => {
    const todo = makeView({ description: 'Blue folder', dueAt: '2030-01-15T09:00:00.000Z' });
    const update = vi.fn(async () => makeView({ ...todo, description: null, version: 2 }));
    const { onEditingChange } = setup({ get: vi.fn(async () => todo), update }, true);
    await userEvent.clear(await screen.findByLabelText('Description'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onEditingChange).toHaveBeenCalledWith(false));
    expect(update).toHaveBeenCalledWith(todo.id, 1, { description: null });
  });

  it('leaves edit mode without a request when nothing changed', async () => {
    const update = vi.fn();
    const { onEditingChange } = setup(
      { get: vi.fn(async () => makeView({ dueAt: '2030-01-15T09:00:42.123Z' })), update },
      true,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(onEditingChange).toHaveBeenCalledWith(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves a stored deadline alone on a title-only edit', async () => {
    const dueAt = '2026-10-01T23:59:59.000Z';
    const todo = makeView({ title: 'Old', version: 3, dueAt });
    const update = vi.fn(async () => makeView({ ...todo, title: 'Old!', version: 4 }));
    setup({ get: vi.fn(async () => todo), update }, true);
    await userEvent.type(await screen.findByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(todo.id, 3, { title: 'Old!' });
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

  it('saves against the version editing started from, even after a background refetch', async () => {
    const original = makeView({ title: 'Old', version: 1 });
    const changedElsewhere = makeView({ ...original, title: 'Changed elsewhere', version: 2 });
    const get = vi.fn().mockResolvedValueOnce(original).mockResolvedValue(changedElsewhere);
    const update = vi
      .fn()
      .mockRejectedValueOnce(problem(412))
      .mockResolvedValueOnce(makeView({ ...changedElsewhere, title: 'Mine', version: 3 }));
    const { onEditingChange, queryClient } = setup({ get, update }, true);
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Mine');
    // e.g. a refetch on window focus brings in another tab's change while the form is open.
    await act(() => queryClient.invalidateQueries());
    expect(get).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere');
    expect(screen.getByLabelText('Title')).toHaveValue('Mine');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onEditingChange).toHaveBeenCalledWith(false));
    expect(update.mock.calls.map((call) => call[1])).toEqual([1, 2]);
  });

  it("on 412 adopts the other writer's description and keeps the edited title for the retry", async () => {
    const v1 = makeView({ title: 'Old', description: 'Original', version: 1 });
    const v2 = makeView({ ...v1, description: 'Theirs', version: 2 });
    const get = vi.fn().mockResolvedValueOnce(v1).mockResolvedValue(v2);
    const update = vi
      .fn()
      .mockRejectedValueOnce(problem(412))
      .mockResolvedValueOnce(makeView({ ...v2, title: 'Mine', version: 3 }));
    const { onEditingChange } = setup({ get, update }, true);
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Mine');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your edits are kept — review and save again.',
    );
    await vi.waitFor(() => expect(screen.getByLabelText('Description')).toHaveValue('Theirs'));
    expect(screen.getByLabelText('Title')).toHaveValue('Mine');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onEditingChange).toHaveBeenCalledWith(false));
    expect(update).toHaveBeenNthCalledWith(1, v1.id, 1, { title: 'Mine' });
    expect(update).toHaveBeenNthCalledWith(2, v1.id, 2, { title: 'Mine' });
  });

  it("on 412 adopts the other writer's title and keeps the edited deadline for the retry", async () => {
    const v1 = makeView({ title: 'Old', dueAt: '2030-01-15T09:00:00.000Z', version: 1 });
    const v2 = makeView({ ...v1, title: 'Theirs', version: 2 });
    const get = vi.fn().mockResolvedValueOnce(v1).mockResolvedValue(v2);
    const update = vi
      .fn()
      .mockRejectedValueOnce(problem(412))
      .mockResolvedValueOnce(makeView({ ...v2, version: 3 }));
    const { onEditingChange } = setup({ get, update }, true);
    fireEvent.change(await screen.findByLabelText('Due date'), {
      target: { value: '2030-02-01' },
    });
    const time = screen.getByLabelText('Due time');
    fireEvent.change(time, { target: { value: '08:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere');
    await vi.waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Theirs'));
    expect(screen.getByLabelText('Due date')).toHaveValue('2030-02-01');
    expect(screen.getByLabelText('Due time')).toHaveValue('08:00');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onEditingChange).toHaveBeenCalledWith(false));
    const dueAt = new Date('2030-02-01T08:00').toISOString();
    expect(update).toHaveBeenNthCalledWith(2, v1.id, 2, { dueAt });
  });

  it('lets the form show other save errors', async () => {
    const update = vi.fn(async () => Promise.reject(problem(500, 'Server exploded')));
    setup({ get: vi.fn(async () => makeView()), update }, true);
    await userEvent.type(await screen.findByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
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

  it('deletes with the version shown when Delete was clicked, even after a background refetch', async () => {
    const original = makeView({ version: 1 });
    const get = vi
      .fn()
      .mockResolvedValueOnce(original)
      .mockResolvedValue(makeView({ ...original, version: 2 }));
    const remove = vi.fn(async () => Promise.reject(problem(412)));
    const { queryClient } = setup({ get, remove });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await act(() => queryClient.invalidateQueries());
    expect(get).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check it before deleting');
    expect(remove).toHaveBeenCalledWith(original.id, 1);
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
