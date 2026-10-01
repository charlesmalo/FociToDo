import { describe, expect, it } from 'vitest';
import { TodoIdSchema } from '@foci/shared';
import { uuidGenerator } from '../../src/domain/ids.js';

describe('uuidGenerator', () => {
  it('generates distinct valid UUIDs', () => {
    const first = uuidGenerator.next();
    const second = uuidGenerator.next();
    expect(TodoIdSchema.parse(first)).toBe(first);
    expect(second).not.toBe(first);
  });
});
