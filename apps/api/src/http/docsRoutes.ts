import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import type { OpenApiDocument } from './openapi.js';

export function createDocsRouter(document: OpenApiDocument): Router {
  const router = Router();
  router.get('/openapi.json', (_req, res) => {
    res.json(document);
  });
  router.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(document, { customSiteTitle: 'FociToDo API explorer' }),
  );
  return router;
}
