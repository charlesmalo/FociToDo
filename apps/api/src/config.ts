import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const EnvironmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'DATABASE_URL must be a postgres:// URL',
  }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export type Config = z.output<typeof EnvironmentSchema>;
export type LogLevel = Config['LOG_LEVEL'];

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/** Validates the environment once at startup; the process refuses to start on bad config. */
export function loadConfig(environment: Record<string, string | undefined> = process.env): Config {
  const result = EnvironmentSchema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid configuration: ${details}`);
  }
  return result.data;
}
