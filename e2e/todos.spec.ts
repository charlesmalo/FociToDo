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
  await page
    .getByRole('dialog', { name: 'Task details' })
    .getByRole('button', { name: 'Edit' })
    .click();
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
  await page
    .getByRole('dialog', { name: 'Task details' })
    .getByRole('button', { name: 'Edit' })
    .click();
  const editDialog = page.getByRole('dialog', { name: 'Edit task' });
  await editDialog.getByLabel('Title').fill('My edit');

  const theirs = await request.patch(`/api/todos/${created.id}`, {
    headers: { 'If-Match': '"1"' },
    data: { title: 'Their edit' },
  });
  expect(theirs.status()).toBe(200);

  await editDialog.getByRole('button', { name: 'Save' }).click();
  await expect(editDialog.getByRole('alert')).toContainText('changed elsewhere');
  await expect(editDialog.getByLabel('Title')).toHaveValue('My edit');

  await editDialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog', { name: 'Task details' })).toContainText('My edit');
});

test('tasks persist across a reload', async ({ page }) => {
  const title = uniqueTitle('Persist');
  await page.goto('/');
  await page.getByRole('button', { name: '+ New task' }).click();
  const dialog = page.getByRole('dialog', { name: 'New task' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('button', { name: title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: title })).toBeVisible();
});

test('the developer portal renders the docs with diagrams', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Developer' }).click();
  await expect(page.getByRole('heading', { name: 'Developer portal' })).toBeVisible();
  // Scoped to the portal nav: the rendered README also links to "concurrency" inline.
  await page
    .getByRole('navigation', { name: 'Documentation' })
    .getByRole('link', { name: 'Concurrency' })
    .click();
  // docs/concurrency.md has three ```mermaid sequenceDiagram blocks. Assert every one of
  // them rendered as a real SVG (MermaidBlock's success path), not its <code> fallback
  // (no role at all) for a failed render — checking only `.first()` would miss a diagram
  // that silently fell back while an earlier one on the page still rendered.
  const diagrams = page.getByRole('img', { name: 'Diagram' });
  await expect(diagrams).toHaveCount(3);
  for (const diagram of await diagrams.all()) {
    await expect(diagram.locator('svg')).toBeVisible();
  }
  await page.getByRole('link', { name: '← Back to app' }).click();
  await expect(page.getByRole('heading', { name: 'FociToDo' })).toBeVisible();
});
