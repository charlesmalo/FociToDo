import { DEFAULT_LIST_QUERY, type ListTodosQuery } from '@foci/shared';
import { useState } from 'react';
import { TodoDialog, type DialogState } from './TodoDialog';
import { TodoFilters } from './TodoFilters';
import { TodoList } from './TodoList';
import styles from './TodoPage.module.css';

export function TodoPage() {
  const [query, setQuery] = useState<ListTodosQuery>(DEFAULT_LIST_QUERY);
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>FociToDo</h1>
        <nav className={styles.actions}>
          <button type="button" onClick={() => setDialog({ mode: 'create' })}>
            + New task
          </button>
          <a href="/dev">Developer</a>
        </nav>
      </header>
      <main>
        <TodoFilters query={query} onChange={setQuery} />
        <TodoList query={query} onOpen={(id) => setDialog({ mode: 'view', id })} />
      </main>
      <TodoDialog state={dialog} onChange={setDialog} />
    </div>
  );
}
