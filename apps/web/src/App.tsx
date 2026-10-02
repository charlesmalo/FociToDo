import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { TodoClientProvider } from './api/TodoClientContext';
import type { TodoClient } from './api/todoClient';
import { TodoPage } from './todos/components/TodoPage';

interface AppProps {
  client: TodoClient;
  queryClient: QueryClient;
}

export function App({ client, queryClient }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider client={client}>
        <TodoPage />
      </TodoClientProvider>
    </QueryClientProvider>
  );
}
