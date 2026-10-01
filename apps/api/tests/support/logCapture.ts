import { pino, type Logger } from 'pino';

/** A real pino logger whose JSON lines are collected for assertions. */
export function captureLogger(): { logger: Logger; entries: Array<Record<string, unknown>> } {
  const entries: Array<Record<string, unknown>> = [];
  const logger = pino(
    { level: 'info' },
    {
      write: (line: string) => {
        entries.push(JSON.parse(line) as Record<string, unknown>);
      },
    },
  );
  return { logger, entries };
}
