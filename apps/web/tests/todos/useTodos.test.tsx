import { DEFAULT_LIST_QUERY } from '@foci/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TodoClientProvider } from '../../src/api/TodoClientContext';
import type { TodoClient } from '../../src/api/todoClient';
import { TODO_REFETCH_INTERVAL_MS, todoKeys, useTodo, useTodoList } from '../../src/todos/useTodos';
import { fakeClient, makeView } from '../support/fixtures';

function setup(client: TodoClient) {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider client={client}>{children}</TodoClientProvider>
    </QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('TODO_REFETCH_INTERVAL_MS', () => {
  it('is one minute', () => {
    expect(TODO_REFETCH_INTERVAL_MS).toBe(60_000);
  });
});

describe('useTodoList', () => {
  it('refetches every minute so the overdue and due-soon badges do not go stale', () => {
    const { queryClient, wrapper } = setup(fakeClient({ list: vi.fn(async () => []) }));
    renderHook(() => useTodoList(DEFAULT_LIST_QUERY), { wrapper });
    const query = queryClient.getQueryCache().find({ queryKey: todoKeys.list(DEFAULT_LIST_QUERY) });
    expect(query?.observers[0]?.options.refetchInterval).toBe(TODO_REFETCH_INTERVAL_MS);
  });
});

describe('useTodo', () => {
  it('refetches every minute so an open details view does not show stale badges', () => {
    const { queryClient, wrapper } = setup(fakeClient({ get: vi.fn(async () => makeView()) }));
    renderHook(() => useTodo('todo-1'), { wrapper });
    const query = queryClient.getQueryCache().find({ queryKey: todoKeys.detail('todo-1') });
    expect(query?.observers[0]?.options.refetchInterval).toBe(TODO_REFETCH_INTERVAL_MS);
  });
});
