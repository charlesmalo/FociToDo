import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/logger.js';

describe('createLogger', () => {
  it('creates a pino logger at the requested level', () => {
    expect(createLogger('warn').level).toBe('warn');
    expect(createLogger('silent').level).toBe('silent');
  });
});
