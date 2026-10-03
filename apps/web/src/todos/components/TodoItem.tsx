import type { TodoView } from '@foci/shared';
import { describeError } from '../../api/describeError';
import { formatDeadline } from '../format';
import { useSetCompleted } from '../useTodos';
import styles from './TodoItem.module.css';

interface TodoItemProps {
  todo: TodoView;
  onOpen: (id: string) => void;
}

export function TodoItem({ todo, onOpen }: TodoItemProps) {
  const setCompleted = useSetCompleted();
  const nextState = todo.isCompleted ? 'incomplete' : 'complete';

  return (
    <li className={todo.isCompleted ? `${styles.item} ${styles.done}` : styles.item}>
      <input
        type="checkbox"
        checked={todo.isCompleted}
        disabled={setCompleted.isPending}
        aria-label={`Mark "${todo.title}" ${nextState}`}
        onChange={() => setCompleted.mutate({ id: todo.id, completed: !todo.isCompleted })}
      />
      <button type="button" className={styles.title} onClick={() => onOpen(todo.id)}>
        {todo.title}
      </button>
      {todo.isOverdue && <span className={styles.overdue}>Overdue</span>}
      {todo.isDueSoon && <span className={styles.dueSoon}>Due soon</span>}
      {todo.dueAt !== null && <span className={styles.due}>Due {formatDeadline(todo.dueAt)}</span>}
      {setCompleted.isError && (
        <span role="alert" className={styles.error}>
          {describeError(setCompleted.error)}
        </span>
      )}
    </li>
  );
}
