import { describe, expect, it } from 'vitest';
import { createRuntime } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { captureLogger } from './support/logCapture.js';

// No query is issued, so no database is needed: pg connects lazily.
const config = loadConfig({
  DATABASE_URL: 'postgres://todo:todo@127.0.0.1:1/x_test',
  LOG_LEVEL: 'silent',
});

describe('createRuntime', () => {
  it('builds a logger from config by default', async () => {
    const runtime = createRuntime(config);
    expect(runtime.logger.level).toBe('silent');
    expect(typeof runtime.app).toBe('function');
    await runtime.close();
  });

  it('logs idle-client pool errors instead of crashing', async () => {
    const { logger, entries } = captureLogger();
    const runtime = createRuntime(config, { logger });
    runtime.pool.emit('error', new Error('connection reset'));
    expect(entries).toContainEqual(
      expect.objectContaining({ level: 50, msg: 'Idle database client error' }),
    );
    await runtime.close();
  });
});
