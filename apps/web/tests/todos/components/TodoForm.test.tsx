import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const local = (value: string) => new Date(value).toISOString();

describe('toInput / toFormValues', () => {
  it('maps an empty date to a null deadline and empty description to null', () => {
    expect(toInput({ title: 'x', description: '', dueDate: '', dueTime: '' })).toEqual({
      title: 'x',
      description: null,
      dueAt: null,
    });
  });

  it('converts the local date and time to a UTC instant', () => {
    expect(
      toInput({ title: 'x', description: 'd', dueDate: '2026-10-03', dueTime: '09:30' }),
    ).toEqual({ title: 'x', description: 'd', dueAt: local('2026-10-03T09:30') });
  });

  it('uses 17:00 when the time is empty', () => {
    expect(toInput({ title: 'x', description: '', dueDate: '2026-10-03', dueTime: '' }).dueAt).toBe(
      local('2026-10-03T17:00'),
    );
  });

  it('passes an unparseable local value through so the schema rejects it', () => {
    expect(
      toInput({ title: 'x', description: '', dueDate: '2026-02-30', dueTime: '10:00' }).dueAt,
    ).toBe('2026-02-30T10:00');
    expect(
      toInput({ title: 'x', description: '', dueDate: '2026-10-03', dueTime: '25:00' }).dueAt,
    ).toBe('2026-10-03T25:00');
  });

  it('splits a deadline into local date and time, or empty strings', () => {
    expect(toFormValues(makeView({ title: 't', description: null, dueAt: null }))).toEqual({
      title: 't',
      description: '',
      dueDate: '',
      dueTime: '',
    });
    expect(
      toFormValues(makeView({ title: 't', description: 'd', dueAt: local('2026-10-03T07:05') })),
    ).toEqual({ title: 't', description: 'd', dueDate: '2026-10-03', dueTime: '07:05' });
  });
});

describe('local time to UTC outside UTC', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });
  const inNewYork = () => {
    process.env.TZ = 'America/New_York';
    // Node applies a runtime TZ change; if this fails the tests below prove nothing.
    expect(new Date('2026-10-03T18:00').toISOString()).toBe('2026-10-03T22:00:00.000Z');
  };

  it('converts New York wall-clock time to the UTC instant', () => {
    inNewYork();
    expect(
      toInput({ title: 'x', description: '', dueDate: '2026-10-03', dueTime: '18:00' }).dueAt,
    ).toBe('2026-10-03T22:00:00.000Z');
  });

  it('shifts a time inside the spring-forward gap forward by the skipped hour', () => {
    inNewYork();
    // 02:30 does not exist on 2026-03-08 in New York; the clock jumps 02:00 -> 03:00 (EST -> EDT).
    expect(
      toInput({ title: 'x', description: '', dueDate: '2026-03-08', dueTime: '02:30' }).dueAt,
    ).toBe('2026-03-08T07:30:00.000Z');
  });

  it('prefills the New York date and time of a stored instant', () => {
    inNewYork();
    expect(toFormValues(makeView({ title: 't', dueAt: '2026-10-03T22:00:00.000Z' }))).toMatchObject(
      { dueDate: '2026-10-03', dueTime: '18:00' },
    );
  });
});

describe('TodoForm', () => {
  it('sends an untouched deadline exactly as stored, even for a title-only edit', async () => {
    const dueAt = '2026-10-01T23:59:59.000Z';
    const onSubmit = vi.fn(async () => undefined);
    const todo = makeView({ title: 'x', dueAt });
    render(
      <TodoForm
        submitLabel="Save"
        onSubmit={onSubmit}
        initialValues={toFormValues(todo)}
        initialDueAt={dueAt}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), ' more');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'x more', description: null, dueAt });
  });

  it('keeps the deadline it started from when the props change underneath it', async () => {
    const x = '2026-10-01T23:59:59.000Z';
    const y = '2026-10-05T10:30:00.000Z';
    const onSubmit = vi.fn(async () => undefined);
    const props = { submitLabel: 'Save', onSubmit };
    const { rerender } = render(
      <TodoForm
        {...props}
        initialValues={toFormValues(makeView({ title: 'x', dueAt: x }))}
        initialDueAt={x}
      />,
    );
    // A background refetch brings another tab's deadline in while the form is open.
    rerender(
      <TodoForm
        {...props}
        initialValues={toFormValues(makeView({ title: 'x', dueAt: y }))}
        initialDueAt={y}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), ' more');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'x more', description: null, dueAt: x });
  });

  it('sends the new instant once only the time changed', async () => {
    const dueAt = '2026-10-01T23:59:59.000Z';
    const onSubmit = vi.fn(async () => undefined);
    const initialValues = toFormValues(makeView({ title: 'x', dueAt }));
    render(
      <TodoForm
        submitLabel="Save"
        onSubmit={onSubmit}
        initialValues={initialValues}
        initialDueAt={dueAt}
      />,
    );
    fireEvent.change(screen.getByLabelText('Due time'), { target: { value: '08:15' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'x',
      description: null,
      dueAt: local(`${initialValues.dueDate}T08:15`),
    });
  });

  it('disables Due time until a date is entered', () => {
    render(<TodoForm submitLabel="Add task" onSubmit={vi.fn()} />);
    const time = screen.getByLabelText('Due time');
    expect(time).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-03' } });
    expect(time).toBeEnabled();
  });

  it('re-prefills 17:00 when the time is cleared while a date is set', () => {
    render(<TodoForm submitLabel="Add task" onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-03' } });
    const time = screen.getByLabelText('Due time');
    fireEvent.change(time, { target: { value: '' } });
    expect(time).toHaveValue('');
    fireEvent.blur(time);
    expect(time).toHaveValue('17:00');
    fireEvent.change(time, { target: { value: '09:00' } });
    fireEvent.blur(time);
    expect(time).toHaveValue('09:00');
  });

  it('prefills 17:00 when a date is entered, keeps a chosen time and clears both with the date', () => {
    render(<TodoForm submitLabel="Add task" onSubmit={vi.fn()} />);
    const date = screen.getByLabelText('Due date');
    const time = screen.getByLabelText('Due time');
    expect(time).toHaveValue('');
    fireEvent.change(date, { target: { value: '2026-10-03' } });
    expect(time).toHaveValue('17:00');
    fireEvent.change(time, { target: { value: '08:15' } });
    fireEvent.change(date, { target: { value: '2026-10-04' } });
    expect(time).toHaveValue('08:15');
    fireEvent.change(date, { target: { value: '' } });
    expect(time).toHaveValue('');
  });

  it('prefills local date and time from an existing deadline and submits it unchanged', async () => {
    const dueAt = local('2026-10-03T07:05');
    const onSubmit = vi.fn(async () => undefined);
    render(
      <TodoForm
        submitLabel="Save"
        onSubmit={onSubmit}
        initialValues={toFormValues(makeView({ title: 'x', dueAt }))}
      />,
    );
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-10-03');
    expect(screen.getByLabelText('Due time')).toHaveValue('07:05');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'x', description: null, dueAt });
  });

  it('shows a client validation error on an impossible date under Due date', async () => {
    const onSubmit = vi.fn();
    render(
      <TodoForm
        submitLabel="Save"
        onSubmit={onSubmit}
        initialValues={{ title: 'x', description: '', dueDate: '2026-02-30', dueTime: '10:00' }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Due date')).toHaveAccessibleDescription(/Due must be a date/);
  });

  it('shows a server error on dueAt under Due date', async () => {
    const onSubmit = vi.fn(async () => {
      throw validationError([{ field: 'dueAt', message: 'Due is invalid' }]);
    });
    render(
      <TodoForm
        submitLabel="Save"
        onSubmit={onSubmit}
        initialValues={{ title: 'x', description: '', dueDate: '2026-10-03', dueTime: '10:00' }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByLabelText('Due date')).toHaveAccessibleDescription('Due is invalid');
  });

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
      dueAt: local('2026-10-01T17:00'),
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
        initialValues={{ title: 'x', description: '', dueDate: '', dueTime: '' }}
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
        initialValues={{ title: 'x', description: '', dueDate: '', dueTime: '' }}
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
        initialValues={{ title: 'x', description: '', dueDate: '', dueTime: '' }}
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
