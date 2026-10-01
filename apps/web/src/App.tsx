import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { TodoClientProvider } from './api/TodoClientContext';
import type { TodoClient } from './api/todoClient';
import { TodoPage } from './todos/components/TodoPage';

// Separate chunk: the portal (and mermaid) download only when /dev is opened.
const DevPortal = lazy(() =>
  import('./dev/DevPortal').then((module) => ({ default: module.DevPortal })),
);

export function isDevPath(pathname: string): boolean {
  return pathname === '/dev' || pathname.startsWith('/dev/');
}

interface AppProps {
  client: TodoClient;
  queryClient: QueryClient;
  pathname?: string;
}

export function App({ client, queryClient, pathname = window.location.pathname }: AppProps) {
  if (isDevPath(pathname)) {
    return (
      <Suspense fallback={<p role="status">Loading developer portal…</p>}>
        <DevPortal />
      </Suspense>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider client={client}>
        <TodoPage />
      </TodoClientProvider>
    </QueryClientProvider>
  );
}
