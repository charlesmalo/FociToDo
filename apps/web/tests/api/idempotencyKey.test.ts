import { describe, expect, it } from 'vitest';
import { newIdempotencyKey } from '../../src/api/idempotencyKey';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newIdempotencyKey', () => {
  it('produces distinct v4 UUIDs', () => {
    const first = newIdempotencyKey();
    expect(first).toMatch(UUID_V4);
    expect(newIdempotencyKey()).not.toBe(first);
  });

  it('needs only getRandomValues, so it works where crypto.randomUUID is unavailable (http://<LAN-IP>)', () => {
    const key = newIdempotencyKey((bytes) => bytes.fill(0xff));
    expect(key).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
