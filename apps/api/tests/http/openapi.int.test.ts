import { ProblemSchema, TodoViewListSchema, TodoViewSchema } from '@foci/shared';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRuntime, type Runtime } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { buildOpenApiDocument } from '../../src/http/openapi.js';
import { todoId } from '../support/fakes.js';
import { resetDatabase, testDatabaseUrl } from '../support/testDatabase.js';

const document = buildOpenApiDocument() as {
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
};
let runtime: Runtime;
const api = () => request(runtime.app);

/** Asserts the status is documented for this operation and the body matches its schema. */
function expectConforms(response: Response, path: string, method: string): void {
  const documented = Object.keys(document.paths[path]?.[method]?.responses ?? {});
  expect(documented).toContain(String(response.status));
  if (response.status >= 400) {
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    ProblemSchema.parse(response.body);
  }
}

beforeAll(() => {
  runtime = createRuntime(loadConfig({ DATABASE_URL: testDatabaseUrl(), LOG_LEVEL: 'silent' }));
});
beforeEach(() => resetDatabase(runtime.pool));
afterAll(() => runtime.close());

describe('responses conform to the OpenAPI document', () => {
  it('for the happy path of every operation', async () => {
    const created = await api().post('/api/todos').send({ title: 'Conform' });
    expectConforms(created, '/api/todos', 'post');
    TodoViewSchema.parse(created.body);
    const id = created.body.id as string;

    const list = await api().get('/api/todos');
    expectConforms(list, '/api/todos', 'get');
    TodoViewListSchema.parse(list.body);

    const one = await api().get(`/api/todos/${id}`);
    expectConforms(one, '/api/todos/{id}', 'get');
    TodoViewSchema.parse(one.body);

    const patched = await api()
      .patch(`/api/todos/${id}`)
      .set('If-Match', '"1"')
      .send({ title: 'x' });
    expectConforms(patched, '/api/todos/{id}', 'patch');
    TodoViewSchema.parse(patched.body);

    const completed = await api().post(`/api/todos/${id}/complete`);
    expectConforms(completed, '/api/todos/{id}/complete', 'post');
    const reopened = await api().post(`/api/todos/${id}/incomplete`);
    expectConforms(reopened, '/api/todos/{id}/incomplete', 'post');

    const deleted = await api().delete(`/api/todos/${id}`).set('If-Match', '"4"');
    expectConforms(deleted, '/api/todos/{id}', 'delete');

    expectConforms(await api().get('/api/health'), '/api/health', 'get');
  });

  it('for documented error responses', async () => {
    const missing = todoId(999);
    expectConforms(await api().post('/api/todos').send({}), '/api/todos', 'post');
    expectConforms(await api().get('/api/todos?status=nope'), '/api/todos', 'get');
    expectConforms(await api().get(`/api/todos/${missing}`), '/api/todos/{id}', 'get');
    expectConforms(
      await api().patch(`/api/todos/${missing}`).send({ title: 'x' }),
      '/api/todos/{id}',
      'patch',
    );
    expectConforms(
      await api().delete(`/api/todos/${missing}`).set('If-Match', '"1"'),
      '/api/todos/{id}',
      'delete',
    );
    expectConforms(
      await api().post(`/api/todos/${missing}/complete`),
      '/api/todos/{id}/complete',
      'post',
    );
    expectConforms(
      await api()
        .patch(`/api/todos/${missing}`)
        .set('If-Match', '"1"')
        .set('Content-Type', 'application/json; charset=latin1')
        .send('{"title":"x"}'),
      '/api/todos/{id}',
      'patch',
    );
  });

  it.each(['/api/docs', '/api/docs/', '/api/docs/index.html', '/api/openapi.json'])(
    'does not expose API documentation at %s',
    async (path) => {
      const response = await api().get(path);
      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(response.body.type).toBe('/problems/not-found');
    },
  );
});
