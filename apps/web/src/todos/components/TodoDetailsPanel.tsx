import type { CreateTodoInput } from '@foci/shared';
import { useState } from 'react';
import { ApiError } from '../../api/ApiError';
import { describeError } from '../../api/describeError';
import { formatTimestamp } from '../format';
import { useDeleteTodo, useTodo, useUpdateTodo } from '../useTodos';
import { ErrorBanner } from './ErrorBanner';
import styles from './TodoDetailsPanel.module.css';
import { TodoForm, toFormValues } from './TodoForm';

const isStatus = (error: unknown, status: number) =>
  error instanceof ApiError && error.status === status;

interface TodoDetailsPanelProps {
  id: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onClose: () => void;
}

export function TodoDetailsPanel({ id, editing, onEditingChange, onClose }: TodoDetailsPanelProps) {
  const todo = useTodo(id);
  const update = useUpdateTodo();
  const remove = useDeleteTodo();
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (todo.isPending) return <p role="status">Loading…</p>;
  if (todo.isError) {
    return (
      <ErrorBanner
        message={
          isStatus(todo.error, 404) ? 'This task no longer exists.' : describeError(todo.error)
        }
      />
    );
  }

  const current = todo.data;

  /**
   * Both mutations invalidate every todo query (incl. this detail query) once they settle,
   * success or failure — see `useInvalidateTodos` in `useTodos.ts` — so a 404/412 here always
   * ends with a fresh refetch of `current`, with no separate reload call needed.
   */
  const save = async (input: CreateTodoInput) => {
    try {
      await update.mutateAsync({ id: current.id, version: current.version, patch: input });
      setNotice(null);
      onEditingChange(false);
    } catch (error) {
      if (!isStatus(error, 412)) throw error;
      setNotice(
        'This task was changed elsewhere and has been reloaded. Your edits are kept — review and save again.',
      );
    }
  };

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync({ id: current.id, version: current.version });
      onClose();
    } catch (error) {
      setConfirmingDelete(false);
      if (isStatus(error, 404)) {
        // The refetch triggered by the mutation's onSettled will surface the 404 via todo.isError.
      } else if (isStatus(error, 412)) {
        setNotice(
          'This task was changed elsewhere and has been reloaded. Check it before deleting.',
        );
      } else {
        setNotice(describeError(error));
      }
    }
  };

  return (
    <div className={styles.details}>
      {notice !== null && <ErrorBanner message={notice} />}
      {editing ? (
        <TodoForm
          initialValues={toFormValues(current)}
          submitLabel="Save"
          onSubmit={save}
          onCancel={() => {
            setNotice(null);
            onEditingChange(false);
          }}
        />
      ) : (
        <>
          <dl className={styles.fields}>
            <dt>Title</dt>
            <dd>{current.title}</dd>
            <dt>Description</dt>
            <dd>{current.description ?? '—'}</dd>
            <dt>Due date</dt>
            <dd>
              {current.dueDate ?? '—'}
              {current.isOverdue && <span className={styles.overdue}> Overdue</span>}
            </dd>
            <dt>Status</dt>
            <dd>{current.isCompleted ? 'Completed' : 'Not completed'}</dd>
            <dt>Created</dt>
            <dd>{formatTimestamp(current.createdAt)}</dd>
          </dl>
          {confirmingDelete ? (
            <div role="group" aria-label="Confirm delete" className={styles.buttons}>
              <span>Delete this task?</span>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => void confirmDelete()}
              >
                Yes, delete
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.buttons}>
              <button type="button" onClick={() => onEditingChange(true)}>
                Edit
              </button>
              <button type="button" onClick={() => setConfirmingDelete(true)}>
                Delete
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
