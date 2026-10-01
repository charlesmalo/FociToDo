import { createRuntime } from './app.js';
import { ConfigError, loadConfig, type Config } from './config.js';

/** Bad configuration is an operator error: print the message (no stack) and exit non-zero. */
function loadConfigOrExit(): Config {
  try {
    return loadConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}

const config = loadConfigOrExit();
const runtime = createRuntime(config);
const server = runtime.app.listen(config.PORT, () => {
  runtime.logger.info({ port: config.PORT }, 'API listening');
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  // A second SIGTERM/SIGINT (e.g. an impatient Ctrl+C) must not close the server and pool twice.
  if (shuttingDown) return;
  shuttingDown = true;
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
