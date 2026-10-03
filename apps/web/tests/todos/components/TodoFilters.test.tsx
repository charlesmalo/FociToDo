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
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'Due soon');
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, status: 'due-soon' });
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'Due');
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, sort: 'dueAt' });
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

  it('names each control by its label alone, not by the options it lists', () => {
    render(<TodoFilters query={DEFAULT_LIST_QUERY} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Show' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Order' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Due date')).not.toBeInTheDocument();
  });

  it("associates each select with a label whose text is only the label's own caption", () => {
    render(<TodoFilters query={DEFAULT_LIST_QUERY} onChange={vi.fn()} />);
    const [show, sort, order] = screen.getAllByRole<HTMLSelectElement>('combobox');
    expect(show?.labels?.[0]?.textContent?.trim()).toBe('Show');
    expect(sort?.labels?.[0]?.textContent?.trim()).toBe('Sort by');
    expect(order?.labels?.[0]?.textContent?.trim()).toBe('Order');
  });
});
