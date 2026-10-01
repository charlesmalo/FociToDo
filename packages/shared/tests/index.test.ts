import { describe, expect, it } from 'vitest';
import * as shared from '../src/index.js';

describe('@foci/shared public API', () => {
  it('re-exports the problem module', () => {
    expect(shared.PROBLEM_TYPES.validation).toBe('/problems/validation-error');
    expect(typeof shared.toFieldErrors).toBe('function');
  });
});
