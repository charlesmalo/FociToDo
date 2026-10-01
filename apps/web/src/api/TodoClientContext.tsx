import { createContext, useContext, type ReactNode } from 'react';
import type { TodoClient } from './todoClient';

const TodoClientContext = createContext<TodoClient | null>(null);

export function TodoClientProvider({
  client,
  children,
}: {
  client: TodoClient;
  children: ReactNode;
}) {
  return <TodoClientContext.Provider value={client}>{children}</TodoClientContext.Provider>;
}

export function useTodoClient(): TodoClient {
  const client = useContext(TodoClientContext);
  if (client === null) throw new Error('useTodoClient must be used inside a TodoClientProvider');
  return client;
}
