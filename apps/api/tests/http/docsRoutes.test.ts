import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createDocsRouter } from '../../src/http/docsRoutes.js';

const document = { openapi: '3.1.0', info: { title: 'Test', version: '1' }, paths: {} };
const app = express().use('/api', createDocsRouter(document));

describe('docs routes', () => {
  it('serves the OpenAPI document', async () => {
    const response = await request(app).get('/api/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(document);
  });

  it('serves Swagger UI', async () => {
    const response = await request(app).get('/api/docs/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('swagger-ui');
  });
});
