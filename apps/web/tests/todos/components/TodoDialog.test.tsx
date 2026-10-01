import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TodoDialog, type DialogState } from '../../../src/todos/components/TodoDialog';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

function Harness({ next }: { next: DialogState }) {
  const [state, setState] = useState<DialogState>({ mode: 'closed' });
  return (
    <>
      <button type="button" onClick={() => setState(next)}>
        Open
      </button>
      <TodoDialog state={state} onChange={setState} />
    </>
  );
}

describe('TodoDialog', () => {
  it('renders nothing while closed', () => {
    renderWithProviders(<TodoDialog state={{ mode: 'closed' }} onChange={vi.fn()} />, fakeClient());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens as a labelled modal, closes on Escape and returns focus', async () => {
    renderWithProviders(<Harness next={{ mode: 'create' }} />, fakeClient());
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(opener).toHaveFocus());
  });

  it('closes with the close button', async () => {
    renderWithProviders(<Harness next={{ mode: 'create' }} />, fakeClient());
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves between view and edit modes', async () => {
    const todo = makeView({ title: 'Switch me' });
    renderWithProviders(
      <Harness next={{ mode: 'view', id: todo.id }} />,
      fakeClient({ get: vi.fn(async () => todo) }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'Task details' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Task details' })).toBeInTheDocument();
  });

  it('closes after creating', async () => {
    const create = vi.fn(async () => makeView());
    renderWithProviders(
      <Harness next={{ mode: 'create' }} />,
      fakeClient({ create, list: vi.fn(async () => []) }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.type(screen.getByLabelText('Title'), 'New one');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
