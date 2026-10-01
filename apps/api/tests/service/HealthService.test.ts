import { describe, expect, it } from 'vitest';
import { HealthService } from '../../src/service/HealthService.js';

describe('HealthService', () => {
  it('reports ok with the schema version when the database answers', async () => {
    const service = new HealthService({ check: async () => ({ schemaVersion: '001_init' }) });
    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      db: 'up',
      schemaVersion: '001_init',
    });
  });

  it('reports degraded when the database is unreachable', async () => {
    const service = new HealthService({
      check: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(service.check()).resolves.toEqual({
      status: 'degraded',
      db: 'down',
      schemaVersion: null,
    });
  });
});
