import { expect, test } from '@playwright/test';
import { uniqueTitle } from './support';

test.describe('API through the nginx proxy', () => {
  test('passes problem details through unchanged', async ({ request }) => {
    const response = await request.post('/api/todos', { data: {} });
    expect(response.status()).toBe(400);
    expect(response.headers()['content-type']).toContain('application/problem+json');
    expect((await response.json()).errors).toContainEqual({
      field: 'title',
      message: 'Title is required',
    });
  });

  test("accepts the brief's dueDate and returns both deadline fields", async ({ request }) => {
    const response = await request.post('/api/todos', {
      data: { title: uniqueTitle('Brief date'), dueDate: '2030-01-02' },
    });
    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({
      dueAt: '2030-01-02T23:59:59.000Z',
      dueDate: '2030-01-02',
    });
  });

  test('passes ETag, If-Match and Location headers', async ({ request }) => {
    const created = await request.post('/api/todos', { data: { title: uniqueTitle('Headers') } });
    expect(created.headers().etag).toBe('"1"');
    const location = created.headers().location as string;
    expect(location).toMatch(/^\/api\/todos\/[0-9a-f-]{36}$/);
    const stale = await request.patch(location, {
      headers: { 'If-Match': '"9"' },
      data: { title: 'x' },
    });
    expect(stale.status()).toBe(412);
  });

  test('never answers a conditional GET with 304, and marks responses no-store', async ({
    request,
  }) => {
    const created = await request.post('/api/todos', { data: { title: uniqueTitle('No 304') } });
    const location = created.headers().location as string;
    const etag = created.headers().etag as string;
    const response = await request.get(location, { headers: { 'If-None-Match': etag } });
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect((await response.json()).title).toContain('No 304');
  });

  test('passes the Idempotency-Key header (replay)', async ({ request }) => {
    const key = uniqueTitle('key').replace(/\s/g, '-');
    const body = { title: uniqueTitle('Once') };
    const first = await request.post('/api/todos', {
      headers: { 'Idempotency-Key': key },
      data: body,
    });
    const second = await request.post('/api/todos', {
      headers: { 'Idempotency-Key': key },
      data: body,
    });
    expect(second.headers()['idempotent-replayed']).toBe('true');
    expect(await second.json()).toEqual(await first.json());
  });

  test('does not expose API docs, and deep links fall back to the app', async ({ request }) => {
    for (const path of ['/api/docs/', '/api/openapi.json']) {
      const response = await request.get(path);
      expect(response.status()).toBe(404);
      expect(response.headers()['content-type']).toMatch(/^application\/problem\+json/);
    }
    expect((await request.get('/any/deep/link')).status()).toBe(200);
  });
});
