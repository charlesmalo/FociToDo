import { pino, type Logger } from 'pino';
import type { LogLevel } from './config.js';

export function createLogger(level: LogLevel): Logger {
  return pino({
    level,
    base: { service: 'foci-todo-api' },
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
  });
}
