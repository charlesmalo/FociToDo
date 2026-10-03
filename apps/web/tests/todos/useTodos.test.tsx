import { DEFAULT_LIST_QUERY } from '@foci/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TodoClientProvider } from '../../src/api/TodoClientContext';
import { todoKeys, useTodoList } from '../../src/todos/useTodos';
import { fakeClient } from '../support/fixtures';

describe('useTodoList', () => {
  it('refetches every minute so the overdue and due-soon badges do not go stale', async () => {
    const list = vi.fn(async () => []);
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <TodoClientProvider client={fakeClient({ list })}>{children}</TodoClientProvider>
      </QueryClientProvider>
    );
    renderHook(() => useTodoList(DEFAULT_LIST_QUERY), { wrapper });
    const query = queryClient.getQueryCache().find({ queryKey: todoKeys.list(DEFAULT_LIST_QUERY) });
    expect(query?.observers[0]?.options.refetchInterval).toBe(60_000);
  });
});
