import { DEFAULT_LIST_QUERY } from '@foci/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TodoFilters } from '../../../src/todos/components/TodoFilters';

describe('TodoFilters', () => {
  it('reports each control change as a new query', async () => {
    const onChange = vi.fn();
    render(<TodoFilters query={DEFAULT_LIST_QUERY} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'Overdue');
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, status: 'overdue' });
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'Due date');
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, sort: 'dueDate' });
    await userEvent.selectOptions(screen.getByLabelText('Order'), 'Ascending');
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, order: 'asc' });
  });

  it('reflects the current query', () => {
    render(
      <TodoFilters
        query={{ status: 'completed', sort: 'title', order: 'asc' }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Show')).toHaveValue('completed');
    expect(screen.getByLabelText('Sort by')).toHaveValue('title');
    expect(screen.getByLabelText('Order')).toHaveValue('asc');
  });
});
