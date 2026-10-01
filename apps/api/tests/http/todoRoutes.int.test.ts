import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRuntime, type Runtime } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { FixedClock, SequentialIds, todoId } from '../support/fakes.js';
import { resetDatabase, testDatabaseUrl } from '../support/testDatabase.js';

let runtime: Runtime;
let clock: FixedClock;
const api = () => request(runtime.app);
const PROBLEM_JSON = /^application\/problem\+json/;

const createTodo = (body: object = { title: 'Buy milk' }) => api().post('/api/todos').send(body);

beforeAll(() => {
  clock = new FixedClock('2026-09-30T12:00:00.000Z');
  runtime = createRuntime(loadConfig({ DATABASE_URL: testDatabaseUrl(), LOG_LEVEL: 'silent' }), {
    clock,
    ids: new SequentialIds(),
  });
});
beforeEach(async () => {
  await resetDatabase(runtime.pool);
  clock.set('2026-09-30T12:00:00.000Z');
});
afterAll(() => runtime.close());

describe('POST /api/todos', () => {
  it('creates a todo with Location and ETag', async () => {
    const response = await createTodo({ title: '  Buy milk ', dueDate: '2026-10-01' });
    expect(response.status).toBe(201);
    expect(response.headers.location).toBe(`/api/todos/${response.body.id}`);
    expect(response.headers.etag).toBe('"1"');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.body).toEqual({
      id: expect.any(String),
      title: 'Buy milk',
      description: null,
      dueDate: '2026-10-01',
      isCompleted: false,
      createdAt: '2026-09-30T12:00:00.000Z',
      version: 1,
      isOverdue: false,
    });
  });

  it('returns field errors as problem details', async () => {
    const response = await createTodo({ dueDat: '2026-10-01' });
    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(response.body).toMatchObject({
      type: '/problems/validation-error',
      status: 400,
      instance: '/api/todos',
      errors: expect.arrayContaining([
        { field: 'title', message: 'Title is required' },
        { field: 'dueDat', message: 'Unknown field' },
      ]),
    });
  });

  it('rejects malformed JSON', async () => {
    const response = await api()
      .post('/api/todos')
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(response.status).toBe(400);
    expect(response.body.type).toBe('/problems/malformed-json');
  });

  it('rejects a body that is not JSON', async () => {
    const response = await api().post('/api/todos').set('Content-Type', 'text/plain').send('x');
    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([
      { field: null, message: 'Request body must be a JSON object' },
    ]);
  });

  it('returns 413 for a body over 16 kB', async () => {
    const response = await createTodo({ title: 'x', description: 'd'.repeat(17_000) });
    expect(response.status).toBe(413);
    expect(response.body.type).toBe('/problems/payload-too-large');
  });

  it('returns 415 for an unsupported charset', async () => {
    const response = await api()
      .post('/api/todos')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{"title":"x"}');
    expect(response.status).toBe(415);
    expect(response.body.type).toBe('/problems/bad-request');
  });

  describe('Idempotency-Key', () => {
    const withKey = (key: string, body: object = { title: 'Once' }) =>
      api().post('/api/todos').set('Idempotency-Key', key).send(body);

    it('replays the original response for a repeated key', async () => {
      const first = await withKey('key-1');
      const second = await withKey('key-1');
      expect(first.status).toBe(201);
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(second.status).toBe(201);
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.headers.location).toBe(first.headers.location);
      expect(second.body).toEqual(first.body);
      expect((await api().get('/api/todos')).body).toHaveLength(1);
    });

    it('rejects a key reused with a different body', async () => {
      await withKey('key-1');
      const response = await withKey('key-1', { title: 'Different' });
      expect(response.status).toBe(422);
      expect(response.body.type).toBe('/problems/idempotency-key-reuse');
    });

    it('validates the key', async () => {
      const response = await withKey('has space');
      expect(response.status).toBe(400);
      expect(response.body.errors[0].field).toBe('Idempotency-Key');
    });
  });
});

describe('GET /api/todos', () => {
  beforeEach(async () => {
    await createTodo({ title: 'banana', dueDate: '2026-09-29' });
    clock.advance(1000);
    await createTodo({ title: 'Apple' });
    clock.advance(1000);
    await createTodo({ title: 'cherry', dueDate: '2026-10-05' });
  });

  it('lists newest first by default', async () => {
    const response = await api().get('/api/todos');
    expect(response.status).toBe(200);
    expect(response.body.map((todo: { title: string }) => todo.title)).toEqual([
      'cherry',
      'Apple',
      'banana',
    ]);
  });

  it('filters and sorts', async () => {
    const overdue = await api().get('/api/todos?status=overdue');
    expect(overdue.body.map((todo: { title: string }) => todo.title)).toEqual(['banana']);
    const byTitle = await api().get('/api/todos?sort=title&order=asc');
    expect(byTitle.body.map((todo: { title: string }) => todo.title)).toEqual([
      'Apple',
      'banana',
      'cherry',
    ]);
  });

  it.each([
    ['status=done', 'status'],
    ['sort=priority', 'sort'],
    ['page=2', 'page'],
  ])('rejects ?%s', async (query, field) => {
    const response = await api().get(`/api/todos?${query}`);
    expect(response.status).toBe(400);
    expect(response.body.errors[0].field).toBe(field);
  });

  it('rejects repeated query parameters', async () => {
    const response = await api().get('/api/todos?status=all&status=completed');
    expect(response.status).toBe(400);
    expect(response.body.errors[0].field).toBe('status');
  });
});

describe('GET /api/todos/:id', () => {
  it('returns the todo with its ETag', async () => {
    const created = await createTodo();
    const response = await api().get(`/api/todos/${created.body.id}`);
    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"1"');
    expect(response.body).toEqual(created.body);
  });

  it('returns 404 for an unknown id', async () => {
    const response = await api().get(`/api/todos/${todoId(999)}`);
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
  });

  it('returns 400 for a malformed id', async () => {
    const response = await api().get('/api/todos/42');
    expect(response.status).toBe(400);
    expect(response.body.errors[0].field).toBe('id');
  });
});

describe('PATCH /api/todos/:id', () => {
  let id: string;
  beforeEach(async () => {
    id = (await createTodo({ title: 'Old', description: 'Keep' })).body.id;
  });
  const patch = (body: object, ifMatch?: string, target = id) => {
    const call = api().patch(`/api/todos/${target}`).send(body);
    return ifMatch === undefined ? call : call.set('If-Match', ifMatch);
  };

  it('updates and returns the new ETag', async () => {
    const response = await patch({ title: 'New', dueDate: null }, '"1"');
    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"2"');
    expect(response.body).toMatchObject({ title: 'New', description: 'Keep', version: 2 });
  });

  it('returns 428 without If-Match', async () => {
    const response = await patch({ title: 'New' });
    expect(response.status).toBe(428);
    expect(response.body.type).toBe('/problems/precondition-required');
  });

  it('returns 412 for a stale ETag', async () => {
    await patch({ title: 'First' }, '"1"');
    const response = await patch({ title: 'Second' }, '"1"');
    expect(response.status).toBe(412);
    expect(response.body.type).toBe('/problems/version-conflict');
  });

  it('returns 404 for an unknown id', async () => {
    expect((await patch({ title: 'x' }, '"1"', todoId(999))).status).toBe(404);
  });

  it.each(['*', 'W/"1"', '"9999999999"', '"1", "2"'])(
    'rejects the If-Match value %s with 400',
    async (ifMatch) => {
      const response = await patch({ title: 'x' }, ifMatch);
      expect(response.status).toBe(400);
      expect(response.body.errors[0].field).toBe('If-Match');
    },
  );

  it('applies error precedence 400 → 428 → 404', async () => {
    expect((await patch({}, undefined)).status).toBe(400);
    expect((await patch({ title: 'x' }, undefined, todoId(999))).status).toBe(428);
    expect((await patch({ title: 'x' }, '"5"', todoId(999))).status).toBe(404);
  });

  it('requires at least one field', async () => {
    const response = await patch({}, '"1"');
    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([
      { field: null, message: 'At least one of title, description or dueDate is required' },
    ]);
  });
});

describe('POST /api/todos/:id/complete and /incomplete', () => {
  it('is idempotent and bumps the version only on change', async () => {
    const id = (await createTodo()).body.id;
    const first = await api().post(`/api/todos/${id}/complete`);
    expect(first.status).toBe(200);
    expect(first.headers.etag).toBe('"2"');
    expect(first.body.isCompleted).toBe(true);
    const again = await api().post(`/api/todos/${id}/complete`).set('If-Match', '"9"');
    expect(again.status).toBe(200);
    expect(again.headers.etag).toBe('"2"');
    const undone = await api().post(`/api/todos/${id}/incomplete`);
    expect(undone.body).toMatchObject({ isCompleted: false, version: 3 });
  });

  it('returns 404 for an unknown id', async () => {
    expect((await api().post(`/api/todos/${todoId(999)}/complete`)).status).toBe(404);
    expect((await api().post(`/api/todos/${todoId(999)}/incomplete`)).status).toBe(404);
  });
});

describe('DELETE /api/todos/:id', () => {
  it('deletes with the current ETag', async () => {
    const id = (await createTodo()).body.id;
    const response = await api().delete(`/api/todos/${id}`).set('If-Match', '"1"');
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect((await api().get(`/api/todos/${id}`)).status).toBe(404);
  });

  it('returns 428, 412 and 404 as appropriate', async () => {
    const id = (await createTodo()).body.id;
    expect((await api().delete(`/api/todos/${id}`)).status).toBe(428);
    expect((await api().delete(`/api/todos/${id}`).set('If-Match', '"2"')).status).toBe(412);
    expect(
      (
        await api()
          .delete(`/api/todos/${todoId(999)}`)
          .set('If-Match', '"1"')
      ).status,
    ).toBe(404);
  });
});

describe('unknown routes', () => {
  it('returns problem details', async () => {
    const response = await api()
      .put(`/api/todos/${todoId(1)}`)
      .send({});
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
  });
});
