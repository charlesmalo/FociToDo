import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/api/ApiError';
import { TodoItem } from '../../../src/todos/components/TodoItem';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

describe('TodoItem', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders title, due date and overdue badge', () => {
    const todo = makeView({ title: 'File taxes', dueDate: '2026-09-01', isOverdue: true });
    renderWithProviders(<TodoItem todo={todo} onOpen={vi.fn()} />, fakeClient());
    expect(screen.getByRole('button', { name: 'File taxes' })).toBeInTheDocument();
    expect(screen.getByText('Due 2026-09-01')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('renders the due date exactly as stored, even west of UTC', () => {
    vi.stubEnv('TZ', 'Pacific/Honolulu');
    renderWithProviders(
      <TodoItem todo={makeView({ dueDate: '2026-10-01' })} onOpen={vi.fn()} />,
      fakeClient(),
    );
    expect(screen.getByText('Due 2026-10-01')).toBeInTheDocument();
  });

  it('omits due date and badge when not applicable', () => {
    renderWithProviders(<TodoItem todo={makeView()} onOpen={vi.fn()} />, fakeClient());
    expect(screen.queryByText(/^Due /)).not.toBeInTheDocument();
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });

  it('opens the todo', async () => {
    const onOpen = vi.fn();
    const todo = makeView({ title: 'Open me' });
    renderWithProviders(<TodoItem todo={todo} onOpen={onOpen} />, fakeClient());
    await userEvent.click(screen.getByRole('button', { name: 'Open me' }));
    expect(onOpen).toHaveBeenCalledWith(todo.id);
  });

  it('completes an incomplete todo, disabling the checkbox while pending', async () => {
    let resolve: (value: ReturnType<typeof makeView>) => void = () => undefined;
    const complete = vi.fn(() => new Promise<ReturnType<typeof makeView>>((r) => (resolve = r)));
    const todo = makeView({ title: 'Buy milk' });
    renderWithProviders(
      <TodoItem todo={todo} onOpen={vi.fn()} />,
      fakeClient({ complete, list: vi.fn(async () => []) }),
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Mark "Buy milk" complete' });
    await userEvent.click(checkbox);
    expect(complete).toHaveBeenCalledWith(todo.id);
    expect(checkbox).toBeDisabled();
    resolve(makeView({ ...todo, isCompleted: true, version: 2 }));
    await vi.waitFor(() => expect(checkbox).toBeEnabled());
  });

  it('reopens a completed todo', async () => {
    const uncomplete = vi.fn(async () => makeView());
    const todo = makeView({ title: 'Done', isCompleted: true });
    renderWithProviders(<TodoItem todo={todo} onOpen={vi.fn()} />, fakeClient({ uncomplete }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark "Done" incomplete' }));
    expect(uncomplete).toHaveBeenCalledWith(todo.id);
  });

  it('shows a failed toggle', async () => {
    const complete = vi.fn(async () => {
      throw new ApiError({
        type: '/problems/not-found',
        title: 'Not found',
        status: 404,
        detail: 'Todo was not found',
      });
    });
    renderWithProviders(
      <TodoItem todo={makeView({ title: 'Gone' })} onOpen={vi.fn()} />,
      fakeClient({ complete }),
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark "Gone" complete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Todo was not found');
  });
});
