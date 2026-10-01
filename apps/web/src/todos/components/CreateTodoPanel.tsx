import type { CreateTodoInput } from '@foci/shared';
import { useRef } from 'react';
import { newIdempotencyKey } from '../../api/idempotencyKey';
import { useCreateTodo } from '../useTodos';
import { TodoForm } from './TodoForm';

interface CreateTodoPanelProps {
  onDone: () => void;
  newKey?: () => string;
}

export function CreateTodoPanel({ onDone, newKey = newIdempotencyKey }: CreateTodoPanelProps) {
  const create = useCreateTodo();
  const lastAttempt = useRef<{ payload: string; key: string } | null>(null);

  /** Same payload → same key, so a retry or double submit can never create a duplicate. */
  const keyFor = (input: CreateTodoInput): string => {
    const payload = JSON.stringify(input);
    const previous = lastAttempt.current;
    if (previous !== null && previous.payload === payload) return previous.key;
    const attempt = { payload, key: newKey() };
    lastAttempt.current = attempt;
    return attempt.key;
  };

  return (
    <TodoForm
      submitLabel="Add task"
      onSubmit={async (input) => {
        await create.mutateAsync({ input, idempotencyKey: keyFor(input) });
        onDone();
      }}
    />
  );
}
