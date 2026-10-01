import type { Express } from 'express';
import { Pool } from 'pg';
import type { Logger } from 'pino';
import type { Config } from './config.js';
import { systemClock, type Clock } from './domain/clock.js';
import { uuidGenerator, type IdGenerator } from './domain/ids.js';
import { createHttpApp } from './http/createHttpApp.js';
import { createLogger } from './logger.js';
import { PgDatabaseProbe } from './repository/postgres/PgDatabaseProbe.js';
import { createPostgresStorage } from './repository/postgres/createPostgresStorage.js';
import { HealthService } from './service/HealthService.js';
import { TodoService } from './service/TodoService.js';

export interface RuntimeOverrides {
  clock?: Clock;
  ids?: IdGenerator;
  logger?: Logger;
}

export interface Runtime {
  app: Express;
  logger: Logger;
  pool: Pool;
  close(): Promise<void>;
}

/** Composition root: the only place that chooses concrete implementations. */
export function createRuntime(config: Config, overrides: RuntimeOverrides = {}): Runtime {
  const logger = overrides.logger ?? createLogger(config.LOG_LEVEL);
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: config.DB_POOL_MAX });
  pool.on('error', (error) => logger.error({ err: error }, 'Idle database client error'));

  const storage = createPostgresStorage(pool);
  const todoService = new TodoService({
    todos: storage.todos,
    unitOfWork: storage.unitOfWork,
    clock: overrides.clock ?? systemClock,
    ids: overrides.ids ?? uuidGenerator,
  });
  const healthService = new HealthService(new PgDatabaseProbe(pool));
  const app = createHttpApp({ todoService, healthService, logger });

  return { app, logger, pool, close: () => pool.end() };
}
