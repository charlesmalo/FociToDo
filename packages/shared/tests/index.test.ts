import { describe, expect, it } from 'vitest';
import * as shared from '../src/index.js';

describe('@foci/shared public API', () => {
  it('re-exports the problem module', () => {
    expect(shared.PROBLEM_TYPES.validation).toBe('/problems/validation-error');
    expect(typeof shared.toFieldErrors).toBe('function');
  });

  it('re-exports the todo module', () => {
    expect(shared.TITLE_MAX_LENGTH).toBe(200);
    expect(typeof shared.CreateTodoSchema.parse).toBe('function');
  });
});
