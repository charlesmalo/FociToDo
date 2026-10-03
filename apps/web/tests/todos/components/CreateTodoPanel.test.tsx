import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TodoClient } from '../../../src/api/todoClient';
import { CreateTodoPanel } from '../../../src/todos/components/CreateTodoPanel';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

describe('CreateTodoPanel', () => {
  it('creates the todo with an idempotency key and finishes', async () => {
    const create = vi.fn(async () => makeView());
    const onDone = vi.fn();
    renderWithProviders(
      <CreateTodoPanel onDone={onDone} newKey={() => 'key-1'} />,
      fakeClient({ create }),
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Buy milk');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledWith(
      { title: 'Buy milk', description: null, dueAt: null },
      'key-1',
    );
  });

  it('reuses the key when retrying the same submission and renews it when the input changes', async () => {
    const keys = ['key-1', 'key-2'];
    const create = vi
      .fn<TodoClient['create']>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(makeView());
    renderWithProviders(
      <CreateTodoPanel onDone={vi.fn()} newKey={() => keys.shift() as string} />,
      fakeClient({ create }),
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Retry me');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(3));
    expect(create.mock.calls.map((call) => call[1])).toEqual(['key-1', 'key-1', 'key-2']);
  });

  it('generates real keys by default', async () => {
    const create = vi.fn<TodoClient['create']>(async () => makeView());
    renderWithProviders(<CreateTodoPanel onDone={vi.fn()} />, fakeClient({ create }));
    await userEvent.type(screen.getByLabelText('Title'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0]?.[1]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
