import express from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler, notFoundHandler } from '../../src/http/errorHandler.js';
import { RequestValidationError } from '../../src/http/validation.js';
import { captureLogger } from '../support/logCapture.js';

function appThrowing(error: unknown) {
  const { logger, entries } = captureLogger();
  const app = express();
  app.use(pinoHttp({ logger, autoLogging: false }));
  app.get('/boom', () => {
    throw error;
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, entries };
}

describe('errorHandler', () => {
  it('returns a generic 500 problem without leaking the stack, and logs the error', async () => {
    const { app, entries } = appThrowing(new Error('database password is hunter2'));
    const response = await request(app).get('/boom');
    expect(response.status).toBe(500);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toEqual({
      type: '/problems/internal',
      title: 'Internal server error',
      status: 500,
      detail: 'An unexpected error occurred',
      instance: '/boom',
    });
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
    expect(entries).toContainEqual(
      expect.objectContaining({ level: 50, msg: 'Unhandled error', err: expect.anything() }),
    );
  });

  it('does not log client errors as errors', async () => {
    const { app, entries } = appThrowing(new RequestValidationError([]));
    const response = await request(app).get('/boom?x=1');
    expect(response.status).toBe(400);
    expect(response.body.instance).toBe('/boom?x=1');
    expect(entries.filter((entry) => entry.level === 50)).toEqual([]);
  });
});

describe('notFoundHandler', () => {
  it('returns a 404 problem for unknown routes', async () => {
    const { app } = appThrowing(new Error('unused'));
    const response = await request(app).delete('/missing');
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toEqual({
      type: '/problems/not-found',
      title: 'Not found',
      status: 404,
      detail: 'No route for DELETE /missing',
      instance: '/missing',
    });
  });
});
