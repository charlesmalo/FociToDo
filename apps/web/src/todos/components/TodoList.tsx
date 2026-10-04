import type { ListTodosQuery } from '@foci/shared';
import { describeError } from '../../api/describeError';
import { useTodoList } from '../useTodos';
import { ErrorBanner } from './ErrorBanner';
import { TodoItem } from './TodoItem';
import styles from './TodoList.module.css';

interface TodoListProps {
  query: ListTodosQuery;
  onOpen: (id: string) => void;
}

export function TodoList({ query, onOpen }: TodoListProps) {
  const { data, isPending, isError, error, refetch } = useTodoList(query);

  if (isPending) return <p role="status">Loading tasks…</p>;

  const banner = isError ? (
    <ErrorBanner message={describeError(error)} onRetry={() => void refetch()} />
  ) : null;
  // A failed first load has nothing to show; a failed background refresh keeps the cached rows.
  if (data === undefined) return banner;
  if (data.length === 0) {
    return (
      <>
        {banner}
        <p className={styles.empty}>
          {query.status === 'all'
            ? 'No tasks yet. Add your first one.'
            : 'No tasks match this filter.'}
        </p>
      </>
    );
  }
  return (
    <>
      {banner}
      <ul className={styles.list} aria-label="Tasks">
        {data.map((todo) => (
          <TodoItem key={todo.id} todo={todo} onOpen={onOpen} />
        ))}
      </ul>
    </>
  );
}
