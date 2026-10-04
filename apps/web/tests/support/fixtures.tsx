import type { TodoView } from '@foci/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { TodoClientProvider } from '../../src/api/TodoClientContext';
import type { TodoClient } from '../../src/api/todoClient';

let sequence = 0;

export function makeView(overrides: Partial<TodoView> = {}): TodoView {
  sequence += 1;
  const dueAt = overrides.dueAt ?? null;
  return {
    id: `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`,
    title: `Task ${sequence}`,
    description: null,
    dueAt,
    dueDate: dueAt?.slice(0, 10) ?? null,
    isCompleted: false,
    createdAt: '2026-09-30T12:00:00.000Z',
    version: 1,
    isOverdue: false,
    isDueSoon: false,
    ...overrides,
  };
}

/** A TodoClient whose methods fail loudly unless a test provides them. */
export function fakeClient(overrides: Partial<TodoClient> = {}): TodoClient {
  const unexpected = (name: string) =>
    vi.fn(() => Promise.reject(new Error(`unexpected TodoClient.${name} call`)));
  return {
    list: unexpected('list'),
    get: unexpected('get'),
    create: unexpected('create'),
    update: unexpected('update'),
    complete: unexpected('complete'),
    uncomplete: unexpected('uncomplete'),
    remove: unexpected('remove'),
    ...overrides,
  };
}

export function renderWithProviders(ui: ReactElement, client: TodoClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider client={client}>{ui}</TodoClientProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}
