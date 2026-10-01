import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { HealthService } from '../service/HealthService.js';
import type { TodoService } from '../service/TodoService.js';
import { errorHandler, notFoundHandler } from './errorHandler.js';
import { createHealthRouter } from './healthRoutes.js';
import { createTodoRouter } from './todoRoutes.js';

export const JSON_BODY_LIMIT = '16kb';

export interface HttpDependencies {
  todoService: TodoService;
  healthService: HealthService;
  logger: Logger;
}

export function createHttpApp({ todoService, healthService, logger }: HttpDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  // ETags are version-based and set explicitly; Express's automatic body-hash ETags would conflict.
  app.set('etag', false);
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use('/api', createHealthRouter(healthService));
  app.use('/api', createTodoRouter(todoService));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
