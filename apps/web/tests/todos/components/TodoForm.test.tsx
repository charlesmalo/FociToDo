import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/api/ApiError';
import { TodoForm, toFormValues, toInput } from '../../../src/todos/components/TodoForm';
import { makeView } from '../../support/fixtures';

const validationError = (errors: Array<{ field: string | null; message: string }>) =>
  new ApiError({
    type: '/problems/validation-error',
    title: 'Validation failed',
    status: 400,
    errors,
  });

describe('toInput / toFormValues', () => {
  it('maps empty optional fields to null and back to empty strings', () => {
    expect(toInput({ title: 'x', description: '', dueDate: '' })).toEqual({
      title: 'x',
      description: null,
      dueDate: null,
    });
    expect(toInput({ title: 'x', description: 'd', dueDate: '2026-10-01' })).toEqual({
      title: 'x',
      description: 'd',
      dueDate: '2026-10-01',
    });
    expect(toFormValues(makeView({ title: 't', description: null, dueDate: null }))).toEqual({
      title: 't',
      description: '',
      dueDate: '',
    });
    expect(toFormValues(makeView({ title: 't', description: 'd', dueDate: '2026-10-01' }))).toEqual(
      {
        title: 't',
        description: 'd',
        dueDate: '2026-10-01',
      },
    );
  });
});

describe('TodoForm', () => {
  it('validates on the client with the shared schema before submitting', async () => {
    const onSubmit = vi.fn();
    render(<TodoForm submitLabel="Add task" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(onSubmit).not.toHaveBeenCalled();
    const title = screen.getByLabelText('Title');
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('Title is required');
  });

  it('submits normalised input and shows a pending label', async () => {
    let finish: () => void = () => undefined;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<TodoForm submitLabel="Add task" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Buy milk');
    await userEvent.type(screen.getByLabelText('Description'), 'Oat');
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Buy milk',
      description: 'Oat',
      dueDate: '2026-10-01',
    });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    finish();
    expect(await screen.findByRole('button', { name: 'Add task' })).toBeEnabled();
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'false');
  });

  it('maps server field errors onto fields (first message wins) and body errors to a banner', async () => {
    const onSubmit = vi.fn(async () => {
      throw validationError([
        { field: 'title', message: 'Title is taken' },
        { field: 'title', message: 'Second message' },
        { field: null, message: 'Body problem' },
        { field: null, message: 'Another body problem' },
      ]);
    });
    render(
      <TodoForm
        submitLabel="Save"
        onSubmit={onSubmit}
        initialValues={{ title: 'x', description: '', dueDate: '' }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByLabelText('Title')).toHaveAccessibleDescription('Title is taken');
    expect(screen.getByRole('alert')).toHaveTextContent('Body problem');
  });

  it('shows a general error for non-validation failures and clears it on resubmit', async () => {
    const onSubmit = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(undefined);
    render(
      <TodoForm
        submitLabel="Save"
        onSubmit={onSubmit}
        initialValues={{ title: 'x', description: '', dueDate: '' }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an API error without field errors as a general error', async () => {
    const onSubmit = vi.fn(async () => {
      throw new ApiError({ type: 'x', title: 'Conflict', status: 409, detail: 'Try again' });
    });
    render(
      <TodoForm
        submitLabel="Save"
        onSubmit={onSubmit}
        initialValues={{ title: 'x', description: '', dueDate: '' }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again');
  });

  it('renders a cancel button only when cancellable', async () => {
    const onCancel = vi.fn();
    const { rerender } = render(<TodoForm submitLabel="Save" onSubmit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    rerender(<TodoForm submitLabel="Save" onSubmit={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
