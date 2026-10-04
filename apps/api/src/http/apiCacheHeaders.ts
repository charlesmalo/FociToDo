import type { RequestHandler } from 'express';

/** Every API response is computed per request: `isOverdue`/`isDueSoon` follow the clock. */
export const apiCacheHeaders: RequestHandler = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // The ETag versions the stored todo for If-Match only; a 304 would replay clock-derived flags.
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  next();
};
