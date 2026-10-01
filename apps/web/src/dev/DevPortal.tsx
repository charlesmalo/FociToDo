import styles from './DevPortal.module.css';
import { docLibrary, type DocLibrary } from './docs';
import { DocView } from './DocView';
import { DECISIONS_INDEX, TABS, routeFromHash } from './routes';
import { useHash } from './useHash';

const BUILD = `v${__APP_VERSION__} · commit ${__GIT_SHA__.slice(0, 7)} · built ${__BUILD_DATE__}`;

export function DevPortal({ library = docLibrary }: { library?: DocLibrary }) {
  const route = routeFromHash(useHash());
  const page = library.get(route.path);

  return (
    <div className={styles.portal}>
      <header className={styles.header}>
        <a href="/">← Back to app</a>
        <h1>Developer portal</h1>
        <p className={styles.build}>{BUILD}</p>
      </header>
      <nav aria-label="Documentation" className={styles.nav}>
        {TABS.map((tab) => (
          <a
            key={tab.id}
            href={`#${tab.id}`}
            aria-current={route.tab === tab.id ? 'page' : undefined}
          >
            {tab.label}
          </a>
        ))}
      </nav>
      <main>
        {route.tab === 'api' && (
          <p className={styles.callout}>
            Try every endpoint in the{' '}
            <a href="/api/docs" target="_blank" rel="noreferrer">
              API explorer →
            </a>
          </p>
        )}
        {route.tab === 'decisions' && route.path !== DECISIONS_INDEX && (
          <p>
            <a href="#decisions">← All decisions</a>
          </p>
        )}
        {page === undefined ? (
          <p role="alert">Document not found.</p>
        ) : (
          <DocView page={page} library={library} />
        )}
      </main>
    </div>
  );
}
