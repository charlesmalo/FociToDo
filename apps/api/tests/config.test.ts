import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const DATABASE_URL = 'postgres://todo:todo@db:5432/todo';

describe('loadConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('applies defaults', () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      PORT: 3000,
      DATABASE_URL,
      DB_POOL_MAX: 10,
      LOG_LEVEL: 'info',
    });
  });

  it('coerces numeric settings', () => {
    expect(
      loadConfig({ DATABASE_URL, PORT: '8081', DB_POOL_MAX: '4', LOG_LEVEL: 'silent' }),
    ).toEqual({ PORT: 8081, DATABASE_URL, DB_POOL_MAX: 4, LOG_LEVEL: 'silent' });
  });

  it('accepts the postgresql:// scheme', () => {
    expect(loadConfig({ DATABASE_URL: 'postgresql://a@b/c' }).DATABASE_URL).toBe(
      'postgresql://a@b/c',
    );
  });

  it('reads process.env by default', () => {
    vi.stubEnv('DATABASE_URL', DATABASE_URL);
    vi.stubEnv('PORT', '4000');
    expect(loadConfig().PORT).toBe(4000);
  });

  it.each([
    [{}, /DATABASE_URL/],
    [{ DATABASE_URL: 'mysql://x@y/z' }, /DATABASE_URL: DATABASE_URL must be a postgres:\/\/ URL/],
    [{ DATABASE_URL, PORT: '70000' }, /PORT/],
    [{ DATABASE_URL, LOG_LEVEL: 'loud' }, /LOG_LEVEL/],
  ])('rejects invalid configuration %j', (environment, message) => {
    expect(() => loadConfig(environment)).toThrow(ConfigError);
    expect(() => loadConfig(environment)).toThrow(message);
  });
});
