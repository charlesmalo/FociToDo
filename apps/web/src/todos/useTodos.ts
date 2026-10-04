import type { CreateTodoInput, ListTodosQuery, UpdateTodoInput } from '@foci/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTodoClient } from '../api/TodoClientContext';

export const todoKeys = {
  all: ['todos'] as const,
  list: (query: ListTodosQuery) => ['todos', 'list', query] as const,
  detail: (id: string) => ['todos', 'detail', id] as const,
};

/** Overdue and due-soon flags are derived from the clock, so open views re-read them every minute. */
export const TODO_REFETCH_INTERVAL_MS = 60_000;

export function useTodoList(query: ListTodosQuery) {
  const client = useTodoClient();
  return useQuery({
    queryKey: todoKeys.list(query),
    queryFn: () => client.list(query),
    refetchInterval: TODO_REFETCH_INTERVAL_MS,
  });
}

export function useTodo(id: string) {
  const client = useTodoClient();
  return useQuery({
    queryKey: todoKeys.detail(id),
    queryFn: () => client.get(id),
    refetchInterval: TODO_REFETCH_INTERVAL_MS,
  });
}

/** Every mutation refreshes all todo queries once it settles (success or failure). */
function useInvalidateTodos() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: todoKeys.all });
}

export function useCreateTodo() {
  const client = useTodoClient();
  const onSettled = useInvalidateTodos();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateTodoInput; idempotencyKey: string }) =>
      client.create(input, idempotencyKey),
    onSettled,
  });
}

export function useUpdateTodo() {
  const client = useTodoClient();
  const onSettled = useInvalidateTodos();
  return useMutation({
    mutationFn: ({ id, version, patch }: { id: string; version: number; patch: UpdateTodoInput }) =>
      client.update(id, version, patch),
    onSettled,
  });
}

export function useSetCompleted() {
  const client = useTodoClient();
  const onSettled = useInvalidateTodos();
  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      completed ? client.complete(id) : client.uncomplete(id),
    onSettled,
  });
}

export function useDeleteTodo() {
  const client = useTodoClient();
  const onSettled = useInvalidateTodos();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => client.remove(id, version),
    onSettled,
  });
}
