import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createTodoClient } from './api/todoClient';
import { createQueryClient } from './queryClient';
import './styles/tokens.css';
import './styles/global.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App client={createTodoClient()} queryClient={createQueryClient()} />
  </StrictMode>,
);
