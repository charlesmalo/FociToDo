import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createRuntime } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { testDatabaseUrl } from '../support/testDatabase.js';

describe('GET /api/health', () => {
  it('reports ok with the schema version', async () => {
    const runtime = createRuntime(
      loadConfig({ DATABASE_URL: testDatabaseUrl(), LOG_LEVEL: 'silent' }),
    );
    const response = await request(runtime.app).get('/api/health');
    await runtime.close();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      db: 'up',
      schemaVersion: '1759190400002_due-at-instants',
    });
  });

  it('returns 503 when the database is unreachable', async () => {
    const runtime = createRuntime(
      loadConfig({
        DATABASE_URL: 'postgres://todo:todo@127.0.0.1:1/none_test',
        LOG_LEVEL: 'silent',
      }),
    );
    const response = await request(runtime.app).get('/api/health');
    await runtime.close();
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'degraded', db: 'down', schemaVersion: null });
  });
});
