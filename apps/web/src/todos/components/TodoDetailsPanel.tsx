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
  /** Version the open form was started from; `null` while not editing. */
  const [editBase, setEditBase] = useState<number | null>(null);
  /** Set by a 412 on Save: adopt the reloaded version as the new base once the refetch is done. */
  const [rebasePending, setRebasePending] = useState(false);
  /** Version on screen when Delete was clicked; `null` while not confirming. */
  const [deleteBase, setDeleteBase] = useState<number | null>(null);

  if (!editing && editBase !== null) setEditBase(null);

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
   * Save and Delete send the version the user started from, never one a background refetch
   * (e.g. on window focus) slipped in underneath them — otherwise another tab's change would be
   * overwritten without a 412. After a 412 the reloaded version becomes the new base, so saving
   * again (having seen the notice) is a deliberate overwrite of the fresh version.
   */
  if (editing && (editBase === null || (rebasePending && !todo.isFetching))) {
    setEditBase(current.version);
    setRebasePending(false);
  }
  const baseVersion = editBase ?? current.version;

  /**
   * Both mutations invalidate every todo query (incl. this detail query) once they settle,
   * success or failure — see `useInvalidateTodos` in `useTodos.ts` — so a 404/412 here always
   * ends with a fresh refetch of `current`, with no separate reload call needed.
   */
  const save = async (input: CreateTodoInput) => {
    try {
      await update.mutateAsync({ id: current.id, version: baseVersion, patch: input });
      setNotice(null);
      onEditingChange(false);
    } catch (error) {
      if (!isStatus(error, 412)) throw error;
      setRebasePending(true);
      setNotice(
        'This task was changed elsewhere and has been reloaded. Your edits are kept — review and save again.',
      );
    }
  };

  const confirmDelete = async (version: number) => {
    try {
      await remove.mutateAsync({ id: current.id, version });
      onClose();
    } catch (error) {
      setDeleteBase(null);
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
          {deleteBase !== null ? (
            <div role="group" aria-label="Confirm delete" className={styles.buttons}>
              <span>Delete this task?</span>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => void confirmDelete(deleteBase)}
              >
                Yes, delete
              </button>
              <button type="button" onClick={() => setDeleteBase(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.buttons}>
              <button type="button" onClick={() => onEditingChange(true)}>
                Edit
              </button>
              <button type="button" onClick={() => setDeleteBase(current.version)}>
                Delete
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
