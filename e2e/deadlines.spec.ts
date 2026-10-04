import { expect, test } from '@playwright/test';
import { uniqueTitle } from './support';

test('the same deadline reads the same in New York and Tokyo', async ({ browser, request }) => {
  const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const soonTitle = uniqueTitle('tz soon');
  const lateTitle = uniqueTitle('tz late');
  for (const [title, dueAt] of [
    [soonTitle, soon],
    [lateTitle, past],
  ] as const) {
    expect((await request.post('/api/todos', { data: { title, dueAt } })).status()).toBe(201);
  }
  const local = (timeZone: string): string =>
    new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(soon),
    );

  for (const timezoneId of ['America/New_York', 'Asia/Tokyo']) {
    const context = await browser.newContext({ timezoneId, locale: 'en-US' });
    const page = await context.newPage();
    await page.goto('/');
    const soonRow = page.getByRole('listitem').filter({ hasText: soonTitle });
    const lateRow = page.getByRole('listitem').filter({ hasText: lateTitle });
    await expect(soonRow.getByText('Due soon', { exact: true })).toBeVisible();
    await expect(lateRow.getByText('Overdue', { exact: true })).toBeVisible();
    await expect(soonRow).toContainText(`Due ${local(timezoneId)}`);
    await context.close();
  }
});

test('a deadline entered in New York is stored as that instant and read in Tokyo', async ({
  browser,
  request,
}) => {
  // January 2030: New York is on EST (UTC−5), so 09:30 there is exactly 14:30 UTC. No clock, no DST edge.
  const instant = '2030-01-15T14:30:00.000Z';
  const title = uniqueTitle('tz form');
  const local = (timeZone: string): string =>
    new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(instant),
    );

  const newYork = await browser.newContext({ timezoneId: 'America/New_York', locale: 'en-US' });
  const creator = await newYork.newPage();
  await creator.goto('/');
  await creator.getByRole('button', { name: '+ New task' }).click();
  const dialog = creator.getByRole('dialog', { name: 'New task' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Due date').fill('2030-01-15');
  await dialog.getByLabel('Due time').fill('09:30');
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog).toBeHidden();
  await expect(creator.getByRole('listitem').filter({ hasText: title })).toContainText(
    `Due ${local('America/New_York')}`,
  );
  await newYork.close();

  const stored = (await (await request.get('/api/todos')).json()) as {
    title: string;
    dueAt: string;
  }[];
  expect(stored.find((todo) => todo.title === title)?.dueAt).toBe(instant);

  const tokyo = await browser.newContext({ timezoneId: 'Asia/Tokyo', locale: 'en-US' });
  const viewer = await tokyo.newPage();
  await viewer.goto('/');
  await expect(viewer.getByRole('listitem').filter({ hasText: title })).toContainText(
    `Due ${local('Asia/Tokyo')}`,
  );
  await tokyo.close();
});
