import { createRuntime } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const runtime = createRuntime(config);
const server = runtime.app.listen(config.PORT, () => {
  runtime.logger.info({ port: config.PORT }, 'API listening');
});

function shutdown(signal: NodeJS.Signals): void {
  runtime.logger.info({ signal }, 'Shutting down');
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(() => {
    runtime.close().then(
      () => process.exit(0),
      (error: unknown) => {
        runtime.logger.error({ err: error }, 'Failed to close the database pool');
        process.exit(1);
      },
    );
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
