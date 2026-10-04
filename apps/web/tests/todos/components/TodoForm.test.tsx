import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/api/ApiError';
import {
  changedFields,
  rebaseValues,
  REAL_DATE_ERROR,
  TodoForm,
  toFormValues,
  toInput,
  type TodoFormValues,
} from '../../../src/todos/components/TodoForm';
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

describe('changedFields', () => {
  const start: TodoFormValues = {
    title: 't',
    description: 'd',
    dueDate: '2030-01-15',
    dueTime: '09:00',
  };

  it('reports nothing for untouched values', () => {
    expect(changedFields({ ...start }, start)).toEqual([]);
  });

  it('reports each edited field, in wire order', () => {
    expect(changedFields({ ...start, title: 'T' }, start)).toEqual(['title']);
    expect(changedFields({ ...start, description: '' }, start)).toEqual(['description']);
    expect(changedFields({ ...start, dueDate: '2030-01-16' }, start)).toEqual(['dueAt']);
    expect(changedFields({ title: 'T', description: '', dueDate: '', dueTime: '' }, start)).toEqual(
      ['title', 'description', 'dueAt'],
    );
  });

  it('reports a time-only edit as a deadline change', () => {
    expect(changedFields({ ...start, dueTime: '10:30' }, start)).toEqual(['dueAt']);
  });

  it('treats an empty time and 17:00 as the same deadline', () => {
    const noTime = { ...start, dueTime: '' };
    expect(changedFields({ ...start, dueTime: '17:00' }, noTime)).toEqual([]);
  });

  it('treats a time kept while the date is empty as no deadline', () => {
    const none: TodoFormValues = { title: 't', description: 'd', dueDate: '', dueTime: '' };
    expect(changedFields({ ...none, dueTime: '09:00' }, none)).toEqual([]);
  });
});

describe('rebaseValues', () => {
  const start: TodoFormValues = { title: 'A', description: 'old', dueDate: '', dueTime: '' };
  const reloaded: TodoFormValues = {
    title: 'Theirs',
    description: 'new',
    dueDate: '2030-01-15',
    dueTime: '09:00',
  };

  it('adopts every reloaded value when nothing was edited', () => {
    expect(rebaseValues({ ...start }, start, reloaded)).toEqual(reloaded);
  });

  it('keeps an edited title or description and adopts the rest', () => {
    expect(rebaseValues({ ...start, title: 'Mine' }, start, reloaded)).toEqual({
      ...reloaded,
      title: 'Mine',
    });
    expect(rebaseValues({ ...start, description: 'mine' }, start, reloaded)).toEqual({
      ...reloaded,
      description: 'mine',
    });
  });

  it('keeps an edited deadline (date and time together) and adopts the rest', () => {
    const values = { ...start, dueDate: '2030-02-01', dueTime: '08:00' };
    expect(rebaseValues(values, start, reloaded)).toEqual({
      title: 'Theirs',
      description: 'new',
      dueDate: '2030-02-01',
      dueTime: '08:00',
    });
  });

  it('adopts the reloaded deadline when only a time was kept with an empty date', () => {
    expect(rebaseValues({ ...start, dueTime: '09:00' }, start, reloaded)).toEqual(reloaded);
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
    expect(onSubmit).toHaveBeenCalledWith({ title: 'x more', description: null, dueAt }, ['title']);
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
    expect(onSubmit).toHaveBeenCalledWith({ title: 'x more', description: null, dueAt: x }, [
      'title',
    ]);
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
    expect(onSubmit).toHaveBeenCalledWith(
      { title: 'x', description: null, dueAt: local(`${initialValues.dueDate}T08:15`) },
      ['dueAt'],
    );
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

  it('prefills 17:00 when a date is entered and keeps a chosen time across date changes', () => {
    render(<TodoForm submitLabel="Add task" onSubmit={vi.fn()} />);
    const date = screen.getByLabelText('Due date');
    const time = screen.getByLabelText('Due time');
    expect(time).toHaveValue('');
    fireEvent.change(date, { target: { value: '2026-10-03' } });
    expect(time).toHaveValue('17:00');
    fireEvent.change(time, { target: { value: '08:15' } });
    fireEvent.change(date, { target: { value: '2026-10-04' } });
    expect(time).toHaveValue('08:15');
  });

  it('keeps a chosen time while the date is briefly emptied (date → "" → date)', () => {
    render(<TodoForm submitLabel="Add task" onSubmit={vi.fn()} />);
    const date = screen.getByLabelText('Due date');
    const time = screen.getByLabelText('Due time');
    fireEvent.change(date, { target: { value: '2030-01-15' } });
    fireEvent.change(time, { target: { value: '09:00' } });
    fireEvent.change(date, { target: { value: '' } });
    expect(time).toHaveValue('');
    expect(time).toBeDisabled();
    fireEvent.change(date, { target: { value: '2030-01-16' } });
    expect(time).toHaveValue('09:00');
  });

  it('defaults to 17:00 only when no time was ever chosen', () => {
    render(<TodoForm submitLabel="Add task" onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2030-01-15' } });
    expect(screen.getByLabelText('Due time')).toHaveValue('17:00');
  });

  it('clearing the date and saving clears the deadline', async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(
      <TodoForm
        initialValues={{ title: 'x', description: '', dueDate: '2030-01-15', dueTime: '09:00' }}
        initialDueAt="2030-01-15T09:00:00.000Z"
        baseVersion={1}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ dueAt: null }), ['dueAt']);
  });

  it('resends the exact stored instant for an untouched deadline and reports no change', async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(
      <TodoForm
        initialValues={{ title: 'x', description: '', dueDate: '2030-01-15', dueTime: '09:00' }}
        initialDueAt="2030-01-15T09:00:42.123Z"
        baseVersion={1}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ dueAt: '2030-01-15T09:00:42.123Z' }),
      [],
    );
  });

  it('reports a time-only edit as a deadline change', async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(
      <TodoForm
        initialValues={{ title: 'x', description: '', dueDate: '2030-01-15', dueTime: '09:00' }}
        initialDueAt="2030-01-15T09:00:00.000Z"
        baseVersion={1}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText('Due time'), { target: { value: '10:30' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ dueAt: new Date('2030-01-15T10:30').toISOString() }),
      ['dueAt'],
    );
  });

  it('after a rebase, untouched fields adopt the reloaded values and edited fields keep the input', () => {
    const props = { submitLabel: 'Save', onSubmit: vi.fn(async () => undefined) };
    const { rerender } = render(
      <TodoForm
        {...props}
        initialValues={{ title: 'A', description: 'old', dueDate: '', dueTime: '' }}
        initialDueAt={null}
        baseVersion={1}
      />,
    );
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Mine' } });
    rerender(
      <TodoForm
        {...props}
        initialValues={{
          title: 'Theirs',
          description: 'new',
          dueDate: '2030-01-15',
          dueTime: '09:00',
        }}
        initialDueAt="2030-01-15T09:00:00.000Z"
        baseVersion={2}
      />,
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Mine');
    expect(screen.getByLabelText('Description')).toHaveValue('new');
    expect(screen.getByLabelText('Due date')).toHaveValue('2030-01-15');
  });

  it('after a rebase, compares against and resends the reloaded deadline', async () => {
    const onSubmit = vi.fn(async () => undefined);
    const props = { submitLabel: 'Save', onSubmit };
    const values = { title: 'A', description: '', dueDate: '2030-01-15', dueTime: '09:00' };
    const { rerender } = render(
      <TodoForm
        {...props}
        initialValues={values}
        initialDueAt="2030-01-15T09:00:00.000Z"
        baseVersion={1}
      />,
    );
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Mine' } });
    rerender(
      <TodoForm
        {...props}
        initialValues={{ ...values, dueTime: '11:00' }}
        initialDueAt="2030-01-15T11:00:42.000Z"
        baseVersion={2}
      />,
    );
    expect(screen.getByLabelText('Due time')).toHaveValue('11:00');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mine', dueAt: '2030-01-15T11:00:42.000Z' }),
      ['title'],
    );
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
    expect(onSubmit).toHaveBeenCalledWith({ title: 'x', description: null, dueAt }, []);
  });

  it('shows "Enter a real date" under Due date for an impossible date and sends nothing', async () => {
    const onSubmit = vi.fn();
    render(
      <TodoForm
        initialValues={{ title: 'x', description: '', dueDate: '2026-02-30', dueTime: '10:00' }}
        submitLabel="Add task"
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(screen.getByText('Enter a real date')).toBeVisible();
    expect(screen.getByLabelText('Due date')).toHaveAccessibleDescription(REAL_DATE_ERROR);
    expect(onSubmit).not.toHaveBeenCalled();
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
    expect(onSubmit).toHaveBeenCalledWith(
      { title: 'Buy milk', description: 'Oat', dueAt: local('2026-10-01T17:00') },
      ['title', 'description', 'dueAt'],
    );
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
