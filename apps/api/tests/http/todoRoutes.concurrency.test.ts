import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRuntime, type Runtime } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { resetDatabase, testDatabaseUrl } from '../support/testDatabase.js';

/** Each scenario repeats to raise the chance of hitting a real interleaving. */
const ROUNDS = 5;
const range = (count: number) => Array.from({ length: count }, (_, index) => index);

let runtime: Runtime;
let server: Server;
const api = () => request(server);

beforeAll(() => {
  runtime = createRuntime(
    loadConfig({ DATABASE_URL: testDatabaseUrl(), LOG_LEVEL: 'silent', DB_POOL_MAX: '10' }),
  );
  // A real listening server so requests genuinely overlap on the connection pool.
  server = runtime.app.listen(0);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.close();
});

async function countTodos(): Promise<number> {
  const { rows } = await runtime.pool.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM todos',
  );
  return rows[0]?.count ?? 0;
}

async function createTodo(title = 'Contended'): Promise<string> {
  const response = await api().post('/api/todos').send({ title });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

const sortedStatuses = (responses: Array<{ status: number }>) =>
  responses.map((response) => response.status).sort((a, b) => a - b);

async function eachRound(scenario: () => Promise<void>): Promise<void> {
  for (let round = 0; round < ROUNDS; round += 1) {
    await resetDatabase(runtime.pool);
    await scenario();
  }
}

describe('concurrency guarantees', () => {
  it('atomic writes: 50 parallel creates produce exactly 50 valid rows', async () => {
    await eachRound(async () => {
      const responses = await Promise.all(
        range(50).map((index) =>
          api()
            .post('/api/todos')
            .send({ title: `Task ${index}` }),
        ),
      );
      expect(responses.every((response) => response.status === 201)).toBe(true);
      expect(new Set(responses.map((response) => response.body.id)).size).toBe(50);
      expect(await countTodos()).toBe(50);
    });
  });

  it('no lost updates: two PATCHes from the same version → one 200, one 412', async () => {
    await eachRound(async () => {
      const id = await createTodo();
      const responses = await Promise.all(
        ['Alpha', 'Bravo'].map((title) =>
          api().patch(`/api/todos/${id}`).set('If-Match', '"1"').send({ title }),
        ),
      );
      expect(sortedStatuses(responses)).toEqual([200, 412]);
      const winner = responses.find((response) => response.status === 200);
      const final = await api().get(`/api/todos/${id}`);
      expect(final.body).toMatchObject({ title: winner?.body.title, version: 2 });
    });
  });

  it('no lost updates under mixed contention: version = 1 + successful mutations', async () => {
    await eachRound(async () => {
      const id = await createTodo();
      const patches = range(10).map((index) =>
        api()
          .patch(`/api/todos/${id}`)
          .set('If-Match', '"1"')
          .send({ title: `Edit ${index}` }),
      );
      const completes = range(5).map(() => api().post(`/api/todos/${id}/complete`));
      const [patchResponses, completeResponses] = await Promise.all([
        Promise.all(patches),
        Promise.all(completes),
      ]);
      expect(patchResponses.every((response) => [200, 412].includes(response.status))).toBe(true);
      expect(completeResponses.every((response) => response.status === 200)).toBe(true);
      const successfulPatches = patchResponses.filter((response) => response.status === 200);
      expect(successfulPatches.length).toBeLessThanOrEqual(1);

      const final = await api().get(`/api/todos/${id}`);
      // Exactly one complete changes state (+1); each successful patch adds +1.
      expect(final.body.isCompleted).toBe(true);
      expect(final.body.version).toBe(1 + 1 + successfulPatches.length);
      if (successfulPatches[0] !== undefined) {
        expect(final.body.title).toBe(successfulPatches[0].body.title);
      }
    });
  });

  it('idempotent status changes: 20 parallel completes → all 200, one version bump', async () => {
    await eachRound(async () => {
      const id = await createTodo();
      const completes = await Promise.all(
        range(20).map(() => api().post(`/api/todos/${id}/complete`)),
      );
      expect(completes.every((response) => response.status === 200)).toBe(true);
      expect((await api().get(`/api/todos/${id}`)).body).toMatchObject({
        isCompleted: true,
        version: 2,
      });

      const reopens = await Promise.all(
        range(20).map(() => api().post(`/api/todos/${id}/incomplete`)),
      );
      expect(reopens.every((response) => response.status === 200)).toBe(true);
      expect((await api().get(`/api/todos/${id}`)).body).toMatchObject({
        isCompleted: false,
        version: 3,
      });
    });
  });

  it('deterministic delete races: 10 parallel deletes → one 204, nine 404', async () => {
    await eachRound(async () => {
      const id = await createTodo();
      const responses = await Promise.all(
        range(10).map(() => api().delete(`/api/todos/${id}`).set('If-Match', '"1"')),
      );
      expect(sortedStatuses(responses)).toEqual([204, ...range(9).map(() => 404)]);
      expect(await countTodos()).toBe(0);
    });
  });

  it('delete vs patch from the same version: exactly one wins, state matches the winner', async () => {
    await eachRound(async () => {
      const id = await createTodo();
      const [deleted, patched] = await Promise.all([
        api().delete(`/api/todos/${id}`).set('If-Match', '"1"'),
        api().patch(`/api/todos/${id}`).set('If-Match', '"1"').send({ title: 'Edited' }),
      ]);
      const outcome = [deleted.status, patched.status];
      expect([
        [204, 404],
        [412, 200],
      ]).toContainEqual(outcome);
      expect(await countTodos()).toBe(deleted.status === 204 ? 0 : 1);
    });
  });

  it('idempotent create: 5 parallel POSTs with one key → one row, identical 201 bodies', async () => {
    await eachRound(async () => {
      const responses = await Promise.all(
        range(5).map(() =>
          api().post('/api/todos').set('Idempotency-Key', 'double-click').send({ title: 'Once' }),
        ),
      );
      expect(responses.every((response) => response.status === 201)).toBe(true);
      expect(new Set(responses.map((response) => JSON.stringify(response.body))).size).toBe(1);
      expect(responses.filter((response) => !response.headers['idempotent-replayed'])).toHaveLength(
        1,
      );
      expect(await countTodos()).toBe(1);
    });
  });

  it('idempotent create with conflicting bodies: winner replays, others get 422', async () => {
    await eachRound(async () => {
      const titles = ['A', 'B', 'A', 'B', 'A', 'B'];
      const responses = await Promise.all(
        titles.map((title) =>
          api().post('/api/todos').set('Idempotency-Key', 'shared').send({ title }),
        ),
      );
      const created = responses.filter((response) => response.status === 201);
      const winnerTitle = created[0]?.body.title as string;
      responses.forEach((response, index) => {
        expect(response.status).toBe(titles[index] === winnerTitle ? 201 : 422);
      });
      expect(await countTodos()).toBe(1);
    });
  });
});
