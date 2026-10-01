# PR 9 — End-to-End Tests and Full CI

> Read `00-index.md` first. Branch: `test/e2e-ci`.

**Delivers:** Playwright journeys that drive a real browser through nginx → API → Postgres, run in Docker from an isolated Compose project (no host port, no shared data), a Playwright version-pin check in the gate, and CI jobs for e2e and runtime images.

**Spec sections:** §8.2–8.4, §9.1 (end-to-end layer). Spec amendment **A9**: e2e uses `docker compose run` with an override file `compose.e2e.yaml` (`up --exit-code-from` would abort when the one-shot `migrate` container exits; the override removes the host port so e2e never collides with a running demo).

---

### Task 1: Playwright project, e2e image and isolated Compose overlay

**Files:**
- Create: `e2e/playwright.config.ts`, `e2e/tsconfig.json`, `e2e/support.ts`, `e2e/todos.spec.ts`, `e2e/api.spec.ts`, `compose.e2e.yaml`, `scripts/check-playwright-pin.mjs`
- Modify: `Dockerfile` (e2e target), `package.json` (devDependency + scripts), `.gitignore` already covers `test-results/` and `playwright-report/`

**Interfaces:**
- Produces: Docker target `e2e`; reviewer command `docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e` (report in `reports/e2e/index.html`); `npm run test:ci` now also runs `node scripts/check-playwright-pin.mjs`.

- [ ] **Step 1: Pin Playwright and extend the scripts**

Run: `dev npm install -D --save-exact @playwright/test@1.63.0`

In root `package.json`, set:
```json
    "typecheck": "npm run typecheck --workspaces --if-present && tsc -p e2e/tsconfig.json",
    "test:ci": "npm run format:check && npm run lint && npm run typecheck && vitest run --coverage && node scripts/check-playwright-pin.mjs"
```

- [ ] **Step 2: Create the Playwright project**

`e2e/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["."]
}
```

`e2e/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: process.env.REPORT_DIR ?? 'playwright-report', open: 'never' }],
  ],
  outputDir: process.env.RESULTS_DIR ?? 'test-results',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

`e2e/support.ts`:
```ts
/** Unique, readable titles so journeys never depend on each other's data. */
export function uniqueTitle(label: string): string {
  return `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
```

- [ ] **Step 3: Write the journeys**

`e2e/todos.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { uniqueTitle } from './support';

test('create, view, edit, complete, filter and delete a task', async ({ page }) => {
  const title = uniqueTitle('Buy milk');
  const edited = `${title} (oat)`;
  await page.goto('/');

  await page.getByRole('button', { name: '+ New task' }).click();
  const createDialog = page.getByRole('dialog', { name: 'New task' });
  await createDialog.getByLabel('Title').fill(title);
  await createDialog.getByLabel('Due date').fill('2030-01-15');
  await createDialog.getByRole('button', { name: 'Add task' }).click();
  await expect(createDialog).toBeHidden();

  const item = page.getByRole('listitem').filter({ hasText: title });
  await expect(item).toContainText('Due 2030-01-15');

  await item.getByRole('button', { name: title }).click();
  await page.getByRole('dialog', { name: 'Task details' }).getByRole('button', { name: 'Edit' }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit task' });
  await editDialog.getByLabel('Title').fill(edited);
  await editDialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog', { name: 'Task details' })).toContainText(edited);
  await page.keyboard.press('Escape');

  const checkbox = page.getByRole('checkbox', { name: `Mark "${edited}" complete` });
  await checkbox.click();
  await expect(page.getByRole('checkbox', { name: `Mark "${edited}" incomplete` })).toBeChecked();

  await page.getByLabel('Show').selectOption('completed');
  await page.getByRole('button', { name: edited }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: edited })).toHaveCount(0);
});

test('an empty title is rejected before anything is created', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New task' }).click();
  const dialog = page.getByRole('dialog', { name: 'New task' });
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog.getByText('Title is required')).toBeVisible();
  await expect(dialog.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true');
});

test('a concurrent edit shows a conflict notice and keeps my edits', async ({ page, request }) => {
  const title = uniqueTitle('Shared');
  const created = await (await request.post('/api/todos', { data: { title } })).json();

  await page.goto('/');
  await page.getByRole('button', { name: title }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Title').fill('My edit');

  const theirs = await request.patch(`/api/todos/${created.id}`, {
    headers: { 'If-Match': '"1"' },
    data: { title: 'Their edit' },
  });
  expect(theirs.status()).toBe(200);

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText('changed elsewhere');
  await expect(page.getByLabel('Title')).toHaveValue('My edit');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog', { name: 'Task details' })).toContainText('My edit');
});

test('tasks persist across a reload', async ({ page }) => {
  const title = uniqueTitle('Persist');
  await page.goto('/');
  await page.getByRole('button', { name: '+ New task' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('button', { name: title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: title })).toBeVisible();
});
```

`e2e/api.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { uniqueTitle } from './support';

test.describe('API through the nginx proxy', () => {
  test('passes problem details through unchanged', async ({ request }) => {
    const response = await request.post('/api/todos', { data: {} });
    expect(response.status()).toBe(400);
    expect(response.headers()['content-type']).toContain('application/problem+json');
    expect((await response.json()).errors).toContainEqual({ field: 'title', message: 'Title is required' });
  });

  test('passes ETag, If-Match and Location headers', async ({ request }) => {
    const created = await request.post('/api/todos', { data: { title: uniqueTitle('Headers') } });
    expect(created.headers().etag).toBe('"1"');
    const location = created.headers().location as string;
    expect(location).toMatch(/^\/api\/todos\/[0-9a-f-]{36}$/);
    const stale = await request.patch(location, { headers: { 'If-Match': '"9"' }, data: { title: 'x' } });
    expect(stale.status()).toBe(412);
  });

  test('passes the Idempotency-Key header (replay)', async ({ request }) => {
    const key = uniqueTitle('key').replace(/\s/g, '-');
    const body = { title: uniqueTitle('Once') };
    const first = await request.post('/api/todos', { headers: { 'Idempotency-Key': key }, data: body });
    const second = await request.post('/api/todos', { headers: { 'Idempotency-Key': key }, data: body });
    expect(second.headers()['idempotent-replayed']).toBe('true');
    expect(await second.json()).toEqual(await first.json());
  });

  test('serves the API explorer and deep links', async ({ request }) => {
    expect((await request.get('/api/docs/')).status()).toBe(200);
    expect((await request.get('/any/deep/link')).status()).toBe(200);
  });
});
```

- [ ] **Step 4: Add the e2e image, the Compose overlay and the pin check**

At the end of `Dockerfile`:
```dockerfile
# Browser tests: the official image ships matching browsers; only the test runner is installed.
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS e2e
WORKDIR /e2e
RUN npm init -y >/dev/null \
  && npm install --no-audit --no-fund --save-exact @playwright/test@1.63.0
COPY e2e/ ./
CMD ["npx", "playwright", "test"]
```

`compose.e2e.yaml`:
```yaml
# End-to-end overlay. Use with a separate project name so it never touches the demo:
#   docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e
services:
  web:
    ports: !reset []

  e2e:
    build:
      context: .
      target: e2e
    environment:
      BASE_URL: http://web:8080
      REPORT_DIR: /reports/e2e
      RESULTS_DIR: /reports/e2e-results
    depends_on:
      web:
        condition: service_healthy
    volumes:
      - ./reports:/reports
    shm_size: 1gb
    init: true
```

`scripts/check-playwright-pin.mjs`:
```js
// Fails when the Playwright test runner and the Playwright image drift apart (browsers would not start).
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const dockerfile = readFileSync('Dockerfile', 'utf8');

const pinned = manifest.devDependencies?.['@playwright/test'];
const image = dockerfile.match(/playwright:v(\d+\.\d+\.\d+)-noble/)?.[1];
const installed = dockerfile.match(/@playwright\/test@(\d+\.\d+\.\d+)/)?.[1];

if (pinned === undefined || pinned !== image || pinned !== installed) {
  console.error(
    `Playwright versions differ: package.json=${pinned} image=${image} e2e install=${installed}`,
  );
  process.exit(1);
}
console.log(`Playwright pinned consistently at ${pinned}`);
```

- [ ] **Step 5: Run the journeys against an isolated stack**

Run:
```bash
docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e
docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml down -v
```
Expected: 8 tests pass; `reports/e2e/index.html` exists; `docker compose ls` shows no `foci-e2e` project afterwards; a demo stack on port 8080 (if running) is unaffected.

- [ ] **Step 6: Prove a journey can fail**

Temporarily change the conflict notice text in `TodoDetailsPanel.tsx` (e.g. "changed elsewhere" → "changed somewhere"), rerun Step 5, confirm the conflict journey fails with a trace in `reports/e2e-results`, then revert.

- [ ] **Step 7: Gate and commit**

Run: `dev npx prettier --write e2e compose.e2e.yaml scripts` then `docker compose --profile test run --rm --build test` (now includes the pin check).
```bash
git add e2e compose.e2e.yaml scripts Dockerfile package.json package-lock.json
git commit -F - <<'EOF'
test(e2e): add Playwright journeys against an isolated Docker stack

Lifecycle, validation, concurrent-edit conflict and persistence journeys
plus proxy header checks, run from the official Playwright image in a
separate Compose project with no host port. The gate verifies the runner
and image versions match.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: CI jobs for e2e and runtime images

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the jobs**

Append to `jobs:` in `.github/workflows/ci.yml`:
```yaml
  e2e:
    name: End-to-end (Playwright)
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run end-to-end tests
        run: docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            reports/e2e
            reports/e2e-results
          if-no-files-found: ignore
      - name: Tear down
        if: always()
        run: docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml down -v

  images:
    name: Build runtime images
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build migrate, api and web targets
        run: docker compose build migrate api web
```

- [ ] **Step 2: Validate and commit**

Run: `dev npx prettier --check .github` (and, after pushing, confirm all three jobs pass on the PR).
```bash
git add .github/workflows/ci.yml
git commit -F - <<'EOF'
ci: run Playwright end-to-end tests and build runtime images

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Then follow the per-PR procedure. PR title: `test: end-to-end journeys and full CI`.
