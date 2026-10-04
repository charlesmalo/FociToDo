// Renders the README screenshots from the built web app with /api answered from fixtures, so no
// server, database or real clock is involved (spec 2026-10-03 brief-duedate §5.1). The fixtures
// are validated against the shared TodoView schemas by the test gate.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';

/** Paths inside the screenshots image (Dockerfile `screenshots` stage). */
const WEB_ROOT = '/tool/web';
const FIXTURES = '/tool/fixtures/todos.json';
const OUT_DIR = '/repo/docs/images';

/** The "now" the fixtures' isOverdue / isDueSoon flags were written for. */
const NOW = new Date('2026-10-03T12:00:00Z');

interface Todo {
  id: string;
  title: string;
  version: number;
  isDueSoon: boolean;
}

const todos = JSON.parse(readFileSync(FIXTURES, 'utf8')) as Todo[];

/** The single fixture with `isDueSoon`; the edit-dialog scene opens it. */
function dueSoonTodo(): Todo {
  const [todo, ...others] = todos.filter((candidate) => candidate.isDueSoon);
  if (todo === undefined || others.length > 0) throw new Error('expected one due-soon fixture');
  return todo;
}

/** Answers every request to the app's origin; anything unexpected fails the scene. */
async function serveApp(page: Page, unexpected: string[]): Promise<void> {
  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const todo = /^\/api\/todos\/([^/]+)$/.exec(url.pathname);
    if (request.method() !== 'GET' || url.origin !== 'http://screenshots.local') {
      unexpected.push(`${request.method()} ${request.url()}`);
      await route.abort();
    } else if (url.pathname === '/api/todos') {
      await route.fulfill({ json: todos });
    } else if (todo !== null) {
      const found = todos.find((candidate) => candidate.id === todo[1]);
      if (found === undefined) {
        unexpected.push(`GET ${request.url()}`);
        await route.abort();
      } else {
        await route.fulfill({ json: found, headers: { ETag: `"${found.version}"` } });
      }
    } else if (url.pathname.startsWith('/api/')) {
      unexpected.push(`GET ${request.url()}`);
      await route.abort();
    } else {
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      await route.fulfill({ path: join(WEB_ROOT, file) });
    }
  });
}

test.describe('README screenshots', () => {
  const unexpected: string[] = [];

  test.beforeEach(async ({ page }) => {
    unexpected.length = 0;
    await page.clock.setFixedTime(NOW);
    await serveApp(page, unexpected);
    await page.goto('/');
    await expect(page.getByRole('list', { name: 'Tasks' }).getByRole('listitem')).toHaveCount(
      todos.length,
    );
  });

  test.afterEach(() => {
    expect(unexpected).toEqual([]);
  });

  test('task list: overdue, due-soon, completed and no-deadline rows', async ({ page }) => {
    await page.screenshot({ path: `${OUT_DIR}/screenshot.png`, animations: 'disabled' });
  });

  test('edit dialog: due date and due time', async ({ page }) => {
    const todo = dueSoonTodo();
    await page.getByRole('button', { name: todo.title, exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Due date')).toHaveValue('2026-10-04');
    await expect(page.getByLabel('Due time')).toHaveValue('09:00');
    await page.screenshot({ path: `${OUT_DIR}/edit-dialog.png`, animations: 'disabled' });
  });
});
