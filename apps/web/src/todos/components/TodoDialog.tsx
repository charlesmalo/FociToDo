import * as Dialog from '@radix-ui/react-dialog';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { CreateTodoPanel } from './CreateTodoPanel';
import { TodoDetailsPanel } from './TodoDetailsPanel';
import styles from './TodoDialog.module.css';

export type DialogState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'view'; id: string }
  | { mode: 'edit'; id: string };

const TITLES = { create: 'New task', view: 'Task details', edit: 'Edit task' } as const;

interface TodoDialogProps {
  state: DialogState;
  onChange: (state: DialogState) => void;
  /** Receives focus on close when the opener is gone (e.g. the row of a task just deleted). */
  fallbackFocusRef: RefObject<HTMLElement | null>;
}

/**
 * Radix handles focus trapping, Escape, focus return and aria-modal. The panels inside know
 * nothing about the dialog, so replacing it with an inline panel would not touch them.
 *
 * This dialog is opened from arbitrary buttons elsewhere in the tree (there's no `Dialog.Trigger`
 * wrapping them), so Radix has no trigger element of its own to return focus to on close — its
 * built-in fallback silently does nothing in that case. We capture whatever was focused right
 * before the dialog opened and restore it ourselves via `onCloseAutoFocus` — or, if that element
 * has left the page meanwhile, focus `fallbackFocusRef` so focus never drops to `<body>`.
 */
export function TodoDialog({ state, onChange, fallbackFocusRef }: TodoDialogProps) {
  const wasOpenRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);

  /**
   * Runs as a layout effect so it reads `document.activeElement` before Radix's own (passive)
   * autofocus-into-the-dialog effect moves focus away from the opener.
   */
  useLayoutEffect(() => {
    if (state.mode === 'closed') {
      wasOpenRef.current = false;
      return;
    }
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      // Whatever can take focus (the thing that opened this dialog) is always an HTMLElement.
      openerRef.current = document.activeElement as HTMLElement | null;
    }
  });

  if (state.mode === 'closed') return null;
  const close = () => onChange({ mode: 'closed' });

  return (
    <Dialog.Root open onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const opener = openerRef.current;
            (opener?.isConnected ? opener : fallbackFocusRef.current)?.focus();
          }}
        >
          <Dialog.Title>{TITLES[state.mode]}</Dialog.Title>
          {state.mode === 'create' ? (
            <CreateTodoPanel onDone={close} />
          ) : (
            <TodoDetailsPanel
              id={state.id}
              editing={state.mode === 'edit'}
              onEditingChange={(editing) =>
                onChange({ mode: editing ? 'edit' : 'view', id: state.id })
              }
              onClose={close}
            />
          )}
          <Dialog.Close className={styles.close} aria-label="Close">
            ×
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
