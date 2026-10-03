import {
  SORT_ORDERS,
  TODO_SORT_FIELDS,
  TODO_STATUSES,
  type ListTodosQuery,
  type SortOrder,
  type TodoSortField,
  type TodoStatus,
} from '@foci/shared';
import { useId } from 'react';
import styles from './TodoList.module.css';

const STATUS_LABELS: Record<TodoStatus, string> = {
  all: 'All',
  completed: 'Completed',
  incomplete: 'Incomplete',
  overdue: 'Overdue',
};
const SORT_LABELS: Record<TodoSortField, string> = {
  createdAt: 'Created',
  dueDate: 'Due date',
  title: 'Title',
};
const ORDER_LABELS: Record<SortOrder, string> = { desc: 'Descending', asc: 'Ascending' };

interface TodoFiltersProps {
  query: ListTodosQuery;
  onChange: (query: ListTodosQuery) => void;
}

export function TodoFilters({ query, onChange }: TodoFiltersProps) {
  const showId = useId();
  const sortId = useId();
  const orderId = useId();
  return (
    <div role="group" aria-label="Filter and sort" className={styles.filters}>
      <span className={styles.field}>
        <label htmlFor={showId}>Show</label>
        <select
          id={showId}
          value={query.status}
          onChange={(event) => onChange({ ...query, status: event.target.value as TodoStatus })}
        >
          {TODO_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </span>
      <span className={styles.field}>
        <label htmlFor={sortId}>Sort by</label>
        <select
          id={sortId}
          value={query.sort}
          onChange={(event) => onChange({ ...query, sort: event.target.value as TodoSortField })}
        >
          {TODO_SORT_FIELDS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </span>
      <span className={styles.field}>
        <label htmlFor={orderId}>Order</label>
        <select
          id={orderId}
          value={query.order}
          onChange={(event) => onChange({ ...query, order: event.target.value as SortOrder })}
        >
          {SORT_ORDERS.map((order) => (
            <option key={order} value={order}>
              {ORDER_LABELS[order]}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}
