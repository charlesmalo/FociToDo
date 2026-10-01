import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useHash } from '../../src/dev/useHash';

describe('useHash', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('tracks hash changes', () => {
    window.location.hash = '#api';
    const { result, unmount } = renderHook(() => useHash());
    expect(result.current).toBe('#api');
    act(() => {
      window.location.hash = '#testing';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toBe('#testing');
    unmount();
  });
});
