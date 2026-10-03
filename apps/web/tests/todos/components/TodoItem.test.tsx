import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/api/ApiError';
import { formatDeadline } from '../../../src/todos/format';
import { TodoItem } from '../../../src/todos/components/TodoItem';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

// The deadline text depends on the viewer's locale and timezone; pin it so these tests do not.
vi.mock('../../../src/todos/format', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  formatDeadline: (iso: string) => `deadline ${iso}`,
}));

describe('TodoItem', () => {
  it('renders title, formatted deadline and overdue badge', () => {
    const dueAt = '2026-09-01T10:00:00.000Z';
    const todo = makeView({ title: 'File taxes', dueAt, isOverdue: true });
    renderWithProviders(<TodoItem todo={todo} onOpen={vi.fn()} />, fakeClient());
    expect(screen.getByRole('button', { name: 'File taxes' })).toBeInTheDocument();
    expect(screen.getByText(`Due ${formatDeadline(dueAt)}`)).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.queryByText('Due soon')).not.toBeInTheDocument();
  });

  it('renders the due-soon badge', () => {
    const dueAt = '2026-10-04T10:00:00.000Z';
    renderWithProviders(
      <TodoItem todo={makeView({ dueAt, isDueSoon: true })} onOpen={vi.fn()} />,
      fakeClient(),
    );
    expect(screen.getByText('Due soon')).toBeInTheDocument();
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });

  it('omits due date and badge when not applicable', () => {
    renderWithProviders(<TodoItem todo={makeView()} onOpen={vi.fn()} />, fakeClient());
    expect(screen.queryByText(/^Due /)).not.toBeInTheDocument();
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    expect(screen.queryByText('Due soon')).not.toBeInTheDocument();
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
