import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { apiCacheHeaders } from '../../src/http/apiCacheHeaders.js';

describe('apiCacheHeaders', () => {
  it('marks the response no-store and drops conditional-GET headers', () => {
    const req = {
      headers: {
        'if-none-match': '"3"',
        'if-modified-since': 'Tue, 01 Oct 2030 00:00:00 GMT',
        'if-match': '"3"',
      },
    } as unknown as Request;
    const set = vi.fn();
    const next = vi.fn() as NextFunction;
    apiCacheHeaders(req, { set } as unknown as Response, next);
    expect(set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(req.headers).toEqual({ 'if-match': '"3"' });
    expect(next).toHaveBeenCalledWith();
  });
});
