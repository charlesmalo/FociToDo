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

test('a deadline entered in New York reads as the same instant in Tokyo', async ({ browser }) => {
  const zone = 'America/New_York';
  // About 3 hours ahead (to the minute): Due soon, far from both the 0 h and 24 h boundaries.
  const instant = new Date(Math.floor((Date.now() + 3 * 60 * 60 * 1000) / 60_000) * 60_000);
  const wall = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const date = `${wall.year}-${wall.month}-${wall.day}`;
  const time = `${wall.hour}:${wall.minute}`;
  const title = uniqueTitle('tz form');
  const local = (timeZone: string): string =>
    new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(
      instant,
    );

  const newYork = await browser.newContext({ timezoneId: zone, locale: 'en-US' });
  const creator = await newYork.newPage();
  await creator.goto('/');
  await creator.getByRole('button', { name: '+ New task' }).click();
  const dialog = creator.getByRole('dialog', { name: 'New task' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Due date').fill(date);
  await dialog.getByLabel('Due time').fill(time);
  await dialog.getByRole('button', { name: 'Add task' }).click();
  await expect(dialog).toBeHidden();
  const nyRow = creator.getByRole('listitem').filter({ hasText: title });
  await expect(nyRow).toContainText(`Due ${local(zone)}`);
  await expect(nyRow.getByText('Due soon', { exact: true })).toBeVisible();
  await newYork.close();

  const tokyo = await browser.newContext({ timezoneId: 'Asia/Tokyo', locale: 'en-US' });
  const viewer = await tokyo.newPage();
  await viewer.goto('/');
  const tokyoRow = viewer.getByRole('listitem').filter({ hasText: title });
  await expect(tokyoRow).toContainText(`Due ${local('Asia/Tokyo')}`);
  await expect(tokyoRow.getByText('Due soon', { exact: true })).toBeVisible();
  await tokyo.close();
});
