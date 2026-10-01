import { render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TodoClientProvider, useTodoClient } from '../../src/api/TodoClientContext';
import { fakeClient } from '../support/fixtures';

describe('useTodoClient', () => {
  it('returns the provided client', () => {
    const client = fakeClient();
    const { result } = renderHook(() => useTodoClient(), {
      wrapper: ({ children }) => (
        <TodoClientProvider client={client}>{children}</TodoClientProvider>
      ),
    });
    expect(result.current).toBe(client);
  });

  it('fails clearly without a provider', () => {
    function Consumer() {
      useTodoClient();
      return null;
    }
    expect(() => render(<Consumer />)).toThrow(
      'useTodoClient must be used inside a TodoClientProvider',
    );
  });
});
