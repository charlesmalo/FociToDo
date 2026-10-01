# PR 5 — API HTTP Layer, Runtime and Images

> Read `00-index.md` first. Branch: `feat/api-http`.

**Delivers:** validated configuration, structured logging, request validation helpers, RFC 9457 problem mapping, the Express routers (todos + health), the composition root (`createRuntime`), the server bootstrap, the `api` and `migrate` Docker targets, and the default Compose stack (`db`, `migrate`, `api`).

**Spec sections:** §5.5, §5.6, §8.1–8.2, Review Focus items 1–3.

---

### Task 1: Configuration, logging and request validation

**Files:**
- Create: `apps/api/src/config.ts`, `apps/api/src/logger.ts`, `apps/api/src/http/validation.ts`
- Create: `apps/api/tests/support/logCapture.ts`
- Test: `apps/api/tests/config.test.ts`, `apps/api/tests/logger.test.ts`, `apps/api/tests/http/validation.test.ts`

**Interfaces:**
- Produces:
  - `interface Config { PORT: number; DATABASE_URL: string; DB_POOL_MAX: number; LOG_LEVEL: LogLevel }`, `type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'`, `class ConfigError extends Error`, `loadConfig(environment?: Record<string, string | undefined>): Config`
  - `createLogger(level: LogLevel): Logger` (pino)
  - `class RequestValidationError extends Error { readonly errors: FieldError[] }`, `parseRequest<S extends z.ZodType>(schema: S, value: unknown, prefix?: string): z.output<S>`, `parseOptionalHeader<S extends z.ZodType>(schema: S, value: string | undefined, name: string): z.output<S> | undefined`
  - Test support: `captureLogger(): { logger: Logger; entries: Array<Record<string, unknown>> }`

- [ ] **Step 1: Add dependencies**

Run:
```bash
dev npm install -w @foci/api zod@^4.6.5 express@^5.2.1 pino@^10.3.1 pino-http@^11.0.0
dev npm install -w @foci/api -D @types/express@^5.0.6 supertest@^7.3.0 @types/supertest@^7.2.1
```

- [ ] **Step 2: Write the failing tests**

`apps/api/tests/support/logCapture.ts`:
```ts
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
```

`apps/api/tests/config.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const DATABASE_URL = 'postgres://todo:todo@db:5432/todo';

describe('loadConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('applies defaults', () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      PORT: 3000,
      DATABASE_URL,
      DB_POOL_MAX: 10,
      LOG_LEVEL: 'info',
    });
  });

  it('coerces numeric settings', () => {
    expect(
      loadConfig({ DATABASE_URL, PORT: '8081', DB_POOL_MAX: '4', LOG_LEVEL: 'silent' }),
    ).toEqual({ PORT: 8081, DATABASE_URL, DB_POOL_MAX: 4, LOG_LEVEL: 'silent' });
  });

  it('accepts the postgresql:// scheme', () => {
    expect(loadConfig({ DATABASE_URL: 'postgresql://a@b/c' }).DATABASE_URL).toBe(
      'postgresql://a@b/c',
    );
  });

  it('reads process.env by default', () => {
    vi.stubEnv('DATABASE_URL', DATABASE_URL);
    vi.stubEnv('PORT', '4000');
    expect(loadConfig().PORT).toBe(4000);
  });

  it.each([
    [{}, /DATABASE_URL/],
    [{ DATABASE_URL: 'mysql://x@y/z' }, /DATABASE_URL: DATABASE_URL must be a postgres:\/\/ URL/],
    [{ DATABASE_URL, PORT: '70000' }, /PORT/],
    [{ DATABASE_URL, LOG_LEVEL: 'loud' }, /LOG_LEVEL/],
  ])('rejects invalid configuration %j', (environment, message) => {
    expect(() => loadConfig(environment)).toThrow(ConfigError);
    expect(() => loadConfig(environment)).toThrow(message);
  });
});
```

`apps/api/tests/logger.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/logger.js';

describe('createLogger', () => {
  it('creates a pino logger at the requested level', () => {
    expect(createLogger('warn').level).toBe('warn');
    expect(createLogger('silent').level).toBe('silent');
  });
});
```

`apps/api/tests/http/validation.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  RequestValidationError,
  parseOptionalHeader,
  parseRequest,
} from '../../src/http/validation.js';

const Schema = z.strictObject({ title: z.string().trim().min(1, { error: 'Required' }) });

describe('parseRequest', () => {
  it('returns the parsed output', () => {
    expect(parseRequest(Schema, { title: ' x ' })).toEqual({ title: 'x' });
  });

  it('throws RequestValidationError with field errors', () => {
    try {
      parseRequest(Schema, { title: '' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RequestValidationError);
      expect((error as RequestValidationError).errors).toEqual([
        { field: 'title', message: 'Required' },
      ]);
      expect((error as Error).name).toBe('RequestValidationError');
    }
  });

  it('prefixes field names', () => {
    expect(() => parseRequest(z.uuid(), 'nope', 'id')).toThrow(
      expect.objectContaining({ errors: [{ field: 'id', message: expect.any(String) }] }),
    );
  });
});

describe('parseOptionalHeader', () => {
  it('returns undefined when the header is absent', () => {
    expect(parseOptionalHeader(z.string().min(2), undefined, 'X-Test')).toBeUndefined();
  });

  it('parses a present header', () => {
    expect(parseOptionalHeader(z.string().min(2), 'ok', 'X-Test')).toBe('ok');
  });

  it('reports errors against the header name', () => {
    expect(() => parseOptionalHeader(z.string().min(2), 'x', 'X-Test')).toThrow(
      expect.objectContaining({ errors: [{ field: 'X-Test', message: expect.any(String) }] }),
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `dev npx vitest run apps/api/tests/config.test.ts apps/api/tests/logger.test.ts apps/api/tests/http/validation.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`apps/api/src/config.ts`:
```ts
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
```

`apps/api/src/logger.ts`:
```ts
import { pino, type Logger } from 'pino';
import type { LogLevel } from './config.js';

export function createLogger(level: LogLevel): Logger {
  return pino({
    level,
    base: { service: 'foci-todo-api' },
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
  });
}
```

`apps/api/src/http/validation.ts`:
```ts
import { toFieldErrors, type FieldError } from '@foci/shared';
import type { z } from 'zod';

export class RequestValidationError extends Error {
  override readonly name = 'RequestValidationError';

  constructor(readonly errors: FieldError[]) {
    super('Request validation failed');
  }
}

export function parseRequest<S extends z.ZodType>(
  schema: S,
  value: unknown,
  prefix?: string,
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new RequestValidationError(toFieldErrors(result.error, prefix));
  return result.data;
}

export function parseOptionalHeader<S extends z.ZodType>(
  schema: S,
  value: string | undefined,
  name: string,
): z.output<S> | undefined {
  return value === undefined ? undefined : parseRequest(schema, value, name);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: same command as Step 3. Expected: PASS.

- [ ] **Step 6: Format, gate, commit**

Run: `dev npx prettier --write apps/api` then `docker compose --profile test run --rm --build test`.
```bash
git add apps/api package.json package-lock.json
git commit -F - <<'EOF'
feat(api): add validated config, structured logging and request parsing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Problem details and the error handler

**Files:**
- Create: `apps/api/src/http/problems.ts`, `apps/api/src/http/errorHandler.ts`
- Test: `apps/api/tests/http/problems.test.ts`, `apps/api/tests/http/errorHandler.test.ts`

**Interfaces:**
- Consumes: domain errors (PR 2), `RequestValidationError` (Task 1), `PROBLEM_TYPES`, `Problem` (`@foci/shared`).
- Produces: `toProblem(error: unknown): Problem`; `notFoundHandler: RequestHandler`; `errorHandler: ErrorRequestHandler` (adds `instance`, logs 5xx via `req.log`, responds `application/problem+json`).

- [ ] **Step 1: Write the failing tests**

`apps/api/tests/http/problems.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PROBLEM_TYPES } from '@foci/shared';
import {
  IdempotencyKeyReuseError,
  PreconditionRequiredError,
  TodoNotFoundError,
  VersionConflictError,
} from '../../src/domain/errors.js';
import { toProblem } from '../../src/http/problems.js';
import { RequestValidationError } from '../../src/http/validation.js';

/** Shape of the errors thrown by Express's JSON body parser (http-errors). */
const parserError = (properties: Record<string, unknown>) =>
  Object.assign(new Error('parser message'), properties);

describe('toProblem', () => {
  it('maps validation errors to 400 with field errors', () => {
    const errors = [{ field: 'title', message: 'Title is required' }];
    expect(toProblem(new RequestValidationError(errors))).toEqual({
      type: PROBLEM_TYPES.validation,
      title: 'Validation failed',
      status: 400,
      detail: 'The request contains invalid fields',
      errors,
    });
  });

  it.each([
    [new TodoNotFoundError('a'), 404, PROBLEM_TYPES.notFound],
    [new VersionConflictError('a'), 412, PROBLEM_TYPES.versionConflict],
    [new IdempotencyKeyReuseError('k'), 422, PROBLEM_TYPES.idempotencyKeyReuse],
    [new PreconditionRequiredError(), 428, PROBLEM_TYPES.preconditionRequired],
  ])('maps %s', (error, status, type) => {
    expect(toProblem(error)).toMatchObject({ status, type, detail: expect.any(String) });
  });

  it('maps malformed JSON to 400', () => {
    const error = parserError({ status: 400, expose: true, type: 'entity.parse.failed' });
    expect(toProblem(error)).toMatchObject({ status: 400, type: PROBLEM_TYPES.malformedJson });
  });

  it('maps an oversized body to 413', () => {
    const error = parserError({ status: 413, expose: true, type: 'entity.too.large' });
    expect(toProblem(error)).toMatchObject({ status: 413, type: PROBLEM_TYPES.payloadTooLarge });
  });

  it('keeps the status of other exposed client errors (e.g. 415 unsupported charset)', () => {
    const error = parserError({ status: 415, expose: true, type: 'charset.unsupported' });
    expect(toProblem(error)).toEqual({
      type: PROBLEM_TYPES.badRequest,
      title: 'Bad request',
      status: 415,
      detail: 'parser message',
    });
  });

  it.each([
    ['a non-Error value', 'boom'],
    ['an Error without status', new Error('x')],
    ['a non-numeric status', parserError({ status: '400', expose: true })],
    ['a status below 400', parserError({ status: 302, expose: true })],
    ['a server status', parserError({ status: 503, expose: true })],
    ['an unexposed error', parserError({ status: 400 })],
    ['an explicitly unexposed error', parserError({ status: 400, expose: false })],
  ])('maps %s to a generic 500', (_label, error) => {
    expect(toProblem(error)).toEqual({
      type: PROBLEM_TYPES.internal,
      title: 'Internal server error',
      status: 500,
      detail: 'An unexpected error occurred',
    });
  });
});
```

`apps/api/tests/http/errorHandler.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dev npx vitest run apps/api/tests/http/problems.test.ts apps/api/tests/http/errorHandler.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`apps/api/src/http/problems.ts`:
```ts
import { PROBLEM_TYPES, type Problem } from '@foci/shared';
import {
  IdempotencyKeyReuseError,
  PreconditionRequiredError,
  TodoNotFoundError,
  VersionConflictError,
} from '../domain/errors.js';
import { RequestValidationError } from './validation.js';

/** Errors raised by Express's JSON body parser (http-errors with `expose: true`). */
interface HttpClientError extends Error {
  status: number;
  type?: string;
}

function isHttpClientError(error: unknown): error is HttpClientError {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500 &&
    'expose' in error &&
    error.expose === true
  );
}

function clientErrorProblem(error: HttpClientError): Problem {
  if (error.type === 'entity.parse.failed') {
    return {
      type: PROBLEM_TYPES.malformedJson,
      title: 'Malformed JSON',
      status: 400,
      detail: 'The request body is not valid JSON',
    };
  }
  if (error.type === 'entity.too.large') {
    return {
      type: PROBLEM_TYPES.payloadTooLarge,
      title: 'Payload too large',
      status: 413,
      detail: 'The request body exceeds 16 kB',
    };
  }
  return { type: PROBLEM_TYPES.badRequest, title: 'Bad request', status: error.status, detail: error.message };
}

/** The single place where errors become RFC 9457 problem details. */
export function toProblem(error: unknown): Problem {
  if (error instanceof RequestValidationError) {
    return {
      type: PROBLEM_TYPES.validation,
      title: 'Validation failed',
      status: 400,
      detail: 'The request contains invalid fields',
      errors: error.errors,
    };
  }
  if (error instanceof TodoNotFoundError) {
    return { type: PROBLEM_TYPES.notFound, title: 'Not found', status: 404, detail: error.message };
  }
  if (error instanceof VersionConflictError) {
    return {
      type: PROBLEM_TYPES.versionConflict,
      title: 'Version conflict',
      status: 412,
      detail: `${error.message}; fetch the latest version and retry`,
    };
  }
  if (error instanceof IdempotencyKeyReuseError) {
    return {
      type: PROBLEM_TYPES.idempotencyKeyReuse,
      title: 'Idempotency key reused',
      status: 422,
      detail: error.message,
    };
  }
  if (error instanceof PreconditionRequiredError) {
    return {
      type: PROBLEM_TYPES.preconditionRequired,
      title: 'Precondition required',
      status: 428,
      detail: 'Send If-Match with the ETag you last received',
    };
  }
  if (isHttpClientError(error)) return clientErrorProblem(error);
  return {
    type: PROBLEM_TYPES.internal,
    title: 'Internal server error',
    status: 500,
    detail: 'An unexpected error occurred',
  };
}
```

`apps/api/src/http/errorHandler.ts`:
```ts
import { PROBLEM_TYPES, type Problem } from '@foci/shared';
import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { toProblem } from './problems.js';

function sendProblem(res: Response, problem: Problem): void {
  res.status(problem.status).type('application/problem+json').json(problem);
}

export const notFoundHandler: RequestHandler = (req, res) => {
  sendProblem(res, {
    type: PROBLEM_TYPES.notFound,
    title: 'Not found',
    status: 404,
    detail: `No route for ${req.method} ${req.path}`,
    instance: req.originalUrl,
  });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const problem: Problem = { ...toProblem(error), instance: req.originalUrl };
  if (problem.status >= 500) req.log.error({ err: error }, 'Unhandled error');
  sendProblem(res, problem);
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: same as Step 2. Expected: PASS.

- [ ] **Step 5: Format, gate, commit**

Run: `dev npx prettier --write apps/api` then `docker compose --profile test run --rm --build test`.
```bash
git add apps/api
git commit -F - <<'EOF'
feat(api): map errors to RFC 9457 problem details

Validation, not-found, conflict, precondition and idempotency errors get
specific problem types; body-parser client errors keep their status;
everything else becomes a generic 500 that is logged but never leaks.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Routers, HTTP app and composition root

**Files:**
- Create: `apps/api/src/http/todoRoutes.ts`, `apps/api/src/http/healthRoutes.ts`, `apps/api/src/http/createHttpApp.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`
- Test: `apps/api/tests/http/todoRoutes.int.test.ts`, `apps/api/tests/http/healthRoutes.int.test.ts`, `apps/api/tests/app.test.ts`

**Interfaces:**
- Consumes: everything above; `createPostgresStorage`, `PgDatabaseProbe` (PR 3); `TodoService`, `HealthService` (PR 4).
- Produces:
  - `createTodoRouter(service: TodoService): Router`, `createHealthRouter(health: HealthService): Router`
  - `JSON_BODY_LIMIT = '16kb'`, `interface HttpDependencies { todoService: TodoService; healthService: HealthService; logger: Logger }`, `createHttpApp(deps: HttpDependencies): Express`
  - `interface RuntimeOverrides { clock?: Clock; ids?: IdGenerator; logger?: Logger }`, `interface Runtime { app: Express; logger: Logger; pool: Pool; close(): Promise<void> }`, `createRuntime(config: Config, overrides?: RuntimeOverrides): Runtime`

- [ ] **Step 1: Write the failing integration tests**

`apps/api/tests/http/todoRoutes.int.test.ts`:
```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRuntime, type Runtime } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { FixedClock, SequentialIds, todoId } from '../support/fakes.js';
import { resetDatabase, testDatabaseUrl } from '../support/testDatabase.js';

let runtime: Runtime;
let clock: FixedClock;
const api = () => request(runtime.app);
const PROBLEM_JSON = /^application\/problem\+json/;

const createTodo = (body: object = { title: 'Buy milk' }) => api().post('/api/todos').send(body);

beforeAll(() => {
  clock = new FixedClock('2026-09-30T12:00:00.000Z');
  runtime = createRuntime(loadConfig({ DATABASE_URL: testDatabaseUrl(), LOG_LEVEL: 'silent' }), {
    clock,
    ids: new SequentialIds(),
  });
});
beforeEach(async () => {
  await resetDatabase(runtime.pool);
  clock.set('2026-09-30T12:00:00.000Z');
});
afterAll(() => runtime.close());

describe('POST /api/todos', () => {
  it('creates a todo with Location and ETag', async () => {
    const response = await createTodo({ title: '  Buy milk ', dueDate: '2026-10-01' });
    expect(response.status).toBe(201);
    expect(response.headers.location).toBe(`/api/todos/${response.body.id}`);
    expect(response.headers.etag).toBe('"1"');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.body).toEqual({
      id: expect.any(String),
      title: 'Buy milk',
      description: null,
      dueDate: '2026-10-01',
      isCompleted: false,
      createdAt: '2026-09-30T12:00:00.000Z',
      version: 1,
      isOverdue: false,
    });
  });

  it('returns field errors as problem details', async () => {
    const response = await createTodo({ dueDat: '2026-10-01' });
    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(response.body).toMatchObject({
      type: '/problems/validation-error',
      status: 400,
      instance: '/api/todos',
      errors: expect.arrayContaining([
        { field: 'title', message: 'Title is required' },
        { field: 'dueDat', message: 'Unknown field' },
      ]),
    });
  });

  it('rejects malformed JSON', async () => {
    const response = await api()
      .post('/api/todos')
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(response.status).toBe(400);
    expect(response.body.type).toBe('/problems/malformed-json');
  });

  it('rejects a body that is not JSON', async () => {
    const response = await api().post('/api/todos').set('Content-Type', 'text/plain').send('x');
    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([
      { field: null, message: 'Request body must be a JSON object' },
    ]);
  });

  it('returns 413 for a body over 16 kB', async () => {
    const response = await createTodo({ title: 'x', description: 'd'.repeat(17_000) });
    expect(response.status).toBe(413);
    expect(response.body.type).toBe('/problems/payload-too-large');
  });

  it('returns 415 for an unsupported charset', async () => {
    const response = await api()
      .post('/api/todos')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{"title":"x"}');
    expect(response.status).toBe(415);
    expect(response.body.type).toBe('/problems/bad-request');
  });

  describe('Idempotency-Key', () => {
    const withKey = (key: string, body: object = { title: 'Once' }) =>
      api().post('/api/todos').set('Idempotency-Key', key).send(body);

    it('replays the original response for a repeated key', async () => {
      const first = await withKey('key-1');
      const second = await withKey('key-1');
      expect(first.status).toBe(201);
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(second.status).toBe(201);
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.headers.location).toBe(first.headers.location);
      expect(second.body).toEqual(first.body);
      expect((await api().get('/api/todos')).body).toHaveLength(1);
    });

    it('rejects a key reused with a different body', async () => {
      await withKey('key-1');
      const response = await withKey('key-1', { title: 'Different' });
      expect(response.status).toBe(422);
      expect(response.body.type).toBe('/problems/idempotency-key-reuse');
    });

    it('validates the key', async () => {
      const response = await withKey('has space');
      expect(response.status).toBe(400);
      expect(response.body.errors[0].field).toBe('Idempotency-Key');
    });
  });
});

describe('GET /api/todos', () => {
  beforeEach(async () => {
    await createTodo({ title: 'banana', dueDate: '2026-09-29' });
    clock.advance(1000);
    await createTodo({ title: 'Apple' });
    clock.advance(1000);
    await createTodo({ title: 'cherry', dueDate: '2026-10-05' });
  });

  it('lists newest first by default', async () => {
    const response = await api().get('/api/todos');
    expect(response.status).toBe(200);
    expect(response.body.map((todo: { title: string }) => todo.title)).toEqual([
      'cherry',
      'Apple',
      'banana',
    ]);
  });

  it('filters and sorts', async () => {
    const overdue = await api().get('/api/todos?status=overdue');
    expect(overdue.body.map((todo: { title: string }) => todo.title)).toEqual(['banana']);
    const byTitle = await api().get('/api/todos?sort=title&order=asc');
    expect(byTitle.body.map((todo: { title: string }) => todo.title)).toEqual([
      'Apple',
      'banana',
      'cherry',
    ]);
  });

  it.each([
    ['status=done', 'status'],
    ['sort=priority', 'sort'],
    ['page=2', 'page'],
  ])('rejects ?%s', async (query, field) => {
    const response = await api().get(`/api/todos?${query}`);
    expect(response.status).toBe(400);
    expect(response.body.errors[0].field).toBe(field);
  });

  it('rejects repeated query parameters', async () => {
    const response = await api().get('/api/todos?status=all&status=completed');
    expect(response.status).toBe(400);
    expect(response.body.errors[0].field).toBe('status');
  });
});

describe('GET /api/todos/:id', () => {
  it('returns the todo with its ETag', async () => {
    const created = await createTodo();
    const response = await api().get(`/api/todos/${created.body.id}`);
    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"1"');
    expect(response.body).toEqual(created.body);
  });

  it('returns 404 for an unknown id', async () => {
    const response = await api().get(`/api/todos/${todoId(999)}`);
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
  });

  it('returns 400 for a malformed id', async () => {
    const response = await api().get('/api/todos/42');
    expect(response.status).toBe(400);
    expect(response.body.errors[0].field).toBe('id');
  });
});

describe('PATCH /api/todos/:id', () => {
  let id: string;
  beforeEach(async () => {
    id = (await createTodo({ title: 'Old', description: 'Keep' })).body.id;
  });
  const patch = (body: object, ifMatch?: string, target = id) => {
    const call = api().patch(`/api/todos/${target}`).send(body);
    return ifMatch === undefined ? call : call.set('If-Match', ifMatch);
  };

  it('updates and returns the new ETag', async () => {
    const response = await patch({ title: 'New', dueDate: null }, '"1"');
    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"2"');
    expect(response.body).toMatchObject({ title: 'New', description: 'Keep', version: 2 });
  });

  it('returns 428 without If-Match', async () => {
    const response = await patch({ title: 'New' });
    expect(response.status).toBe(428);
    expect(response.body.type).toBe('/problems/precondition-required');
  });

  it('returns 412 for a stale ETag', async () => {
    await patch({ title: 'First' }, '"1"');
    const response = await patch({ title: 'Second' }, '"1"');
    expect(response.status).toBe(412);
    expect(response.body.type).toBe('/problems/version-conflict');
  });

  it('returns 404 for an unknown id', async () => {
    expect((await patch({ title: 'x' }, '"1"', todoId(999))).status).toBe(404);
  });

  it.each(['*', 'W/"1"', '"9999999999"', '"1", "2"'])(
    'rejects the If-Match value %s with 400',
    async (ifMatch) => {
      const response = await patch({ title: 'x' }, ifMatch);
      expect(response.status).toBe(400);
      expect(response.body.errors[0].field).toBe('If-Match');
    },
  );

  it('applies error precedence 400 → 428 → 404', async () => {
    expect((await patch({}, undefined)).status).toBe(400);
    expect((await patch({ title: 'x' }, undefined, todoId(999))).status).toBe(428);
    expect((await patch({ title: 'x' }, '"5"', todoId(999))).status).toBe(404);
  });

  it('requires at least one field', async () => {
    const response = await patch({}, '"1"');
    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([
      { field: null, message: 'At least one of title, description or dueDate is required' },
    ]);
  });
});

describe('POST /api/todos/:id/complete and /incomplete', () => {
  it('is idempotent and bumps the version only on change', async () => {
    const id = (await createTodo()).body.id;
    const first = await api().post(`/api/todos/${id}/complete`);
    expect(first.status).toBe(200);
    expect(first.headers.etag).toBe('"2"');
    expect(first.body.isCompleted).toBe(true);
    const again = await api().post(`/api/todos/${id}/complete`).set('If-Match', '"9"');
    expect(again.status).toBe(200);
    expect(again.headers.etag).toBe('"2"');
    const undone = await api().post(`/api/todos/${id}/incomplete`);
    expect(undone.body).toMatchObject({ isCompleted: false, version: 3 });
  });

  it('returns 404 for an unknown id', async () => {
    expect((await api().post(`/api/todos/${todoId(999)}/complete`)).status).toBe(404);
    expect((await api().post(`/api/todos/${todoId(999)}/incomplete`)).status).toBe(404);
  });
});

describe('DELETE /api/todos/:id', () => {
  it('deletes with the current ETag', async () => {
    const id = (await createTodo()).body.id;
    const response = await api().delete(`/api/todos/${id}`).set('If-Match', '"1"');
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect((await api().get(`/api/todos/${id}`)).status).toBe(404);
  });

  it('returns 428, 412 and 404 as appropriate', async () => {
    const id = (await createTodo()).body.id;
    expect((await api().delete(`/api/todos/${id}`)).status).toBe(428);
    expect((await api().delete(`/api/todos/${id}`).set('If-Match', '"2"')).status).toBe(412);
    expect((await api().delete(`/api/todos/${todoId(999)}`).set('If-Match', '"1"')).status).toBe(
      404,
    );
  });
});

describe('unknown routes', () => {
  it('returns problem details', async () => {
    const response = await api().put(`/api/todos/${todoId(1)}`).send({});
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
  });
});
```

`apps/api/tests/http/healthRoutes.int.test.ts`:
```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createRuntime } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { testDatabaseUrl } from '../support/testDatabase.js';

describe('GET /api/health', () => {
  it('reports ok with the schema version', async () => {
    const runtime = createRuntime(loadConfig({ DATABASE_URL: testDatabaseUrl(), LOG_LEVEL: 'silent' }));
    const response = await request(runtime.app).get('/api/health');
    await runtime.close();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      db: 'up',
      schemaVersion: '1759190400001_create-idempotency-keys',
    });
  });

  it('returns 503 when the database is unreachable', async () => {
    const runtime = createRuntime(
      loadConfig({ DATABASE_URL: 'postgres://todo:todo@127.0.0.1:1/none_test', LOG_LEVEL: 'silent' }),
    );
    const response = await request(runtime.app).get('/api/health');
    await runtime.close();
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'degraded', db: 'down', schemaVersion: null });
  });
});
```

`apps/api/tests/app.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createRuntime } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { captureLogger } from './support/logCapture.js';

// No query is issued, so no database is needed: pg connects lazily.
const config = loadConfig({ DATABASE_URL: 'postgres://todo:todo@127.0.0.1:1/x_test', LOG_LEVEL: 'silent' });

describe('createRuntime', () => {
  it('builds a logger from config by default', async () => {
    const runtime = createRuntime(config);
    expect(runtime.logger.level).toBe('silent');
    expect(typeof runtime.app).toBe('function');
    await runtime.close();
  });

  it('logs idle-client pool errors instead of crashing', async () => {
    const { logger, entries } = captureLogger();
    const runtime = createRuntime(config, { logger });
    runtime.pool.emit('error', new Error('connection reset'));
    expect(entries).toContainEqual(
      expect.objectContaining({ level: 50, msg: 'Idle database client error' }),
    );
    await runtime.close();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dev npx vitest run apps/api/tests/http apps/api/tests/app.test.ts`
Expected: FAIL — `../../src/app.js` not found.

- [ ] **Step 3: Implement the routers**

`apps/api/src/http/todoRoutes.ts`:
```ts
import {
  CreateTodoSchema,
  IdempotencyKeySchema,
  IfMatchSchema,
  ListTodosQuerySchema,
  TodoIdSchema,
  UpdateTodoSchema,
  toEtag,
  type TodoView,
} from '@foci/shared';
import { Router, type Response } from 'express';
import type { TodoService } from '../service/TodoService.js';
import { parseOptionalHeader, parseRequest } from './validation.js';

const parseId = (value: string): string => parseRequest(TodoIdSchema, value, 'id');

const parseIfMatch = (value: string | undefined): number | undefined =>
  parseOptionalHeader(IfMatchSchema, value, 'If-Match');

function sendTodo(res: Response, status: number, todo: TodoView): void {
  res.status(status).set('ETag', toEtag(todo.version)).json(todo);
}

/**
 * Parsing happens before the service call, so malformed input is always a 400 — ahead of
 * 428 (missing If-Match), 404 and 412, which the service decides.
 */
export function createTodoRouter(service: TodoService): Router {
  const router = Router();

  router.post('/todos', async (req, res) => {
    const input = parseRequest(CreateTodoSchema, req.body);
    const key = parseOptionalHeader(IdempotencyKeySchema, req.get('Idempotency-Key'), 'Idempotency-Key');
    const { todo, replayed } = await service.create(input, key);
    res.location(`/api/todos/${todo.id}`);
    if (replayed) res.set('Idempotent-Replayed', 'true');
    sendTodo(res, 201, todo);
  });

  router.get('/todos', async (req, res) => {
    const query = parseRequest(ListTodosQuerySchema, req.query);
    res.json(await service.list(query));
  });

  router.get('/todos/:id', async (req, res) => {
    sendTodo(res, 200, await service.get(parseId(req.params.id)));
  });

  router.patch('/todos/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const patch = parseRequest(UpdateTodoSchema, req.body);
    const expectedVersion = parseIfMatch(req.get('If-Match'));
    sendTodo(res, 200, await service.update(id, expectedVersion, patch));
  });

  router.post('/todos/:id/complete', async (req, res) => {
    sendTodo(res, 200, await service.complete(parseId(req.params.id)));
  });

  router.post('/todos/:id/incomplete', async (req, res) => {
    sendTodo(res, 200, await service.uncomplete(parseId(req.params.id)));
  });

  router.delete('/todos/:id', async (req, res) => {
    const id = parseId(req.params.id);
    await service.delete(id, parseIfMatch(req.get('If-Match')));
    res.status(204).end();
  });

  return router;
}
```

`apps/api/src/http/healthRoutes.ts`:
```ts
import { Router } from 'express';
import type { HealthService } from '../service/HealthService.js';

export function createHealthRouter(health: HealthService): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    const report = await health.check();
    res.status(report.status === 'ok' ? 200 : 503).json(report);
  });
  return router;
}
```

`apps/api/src/http/createHttpApp.ts`:
```ts
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
```

`apps/api/src/app.ts`:
```ts
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
```

`apps/api/src/server.ts` (bootstrap only; excluded from coverage):
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dev npx vitest run apps/api/tests`
Expected: PASS (unit + integration).

- [ ] **Step 5: Format, gate, commit**

Run: `dev npx prettier --write apps/api` then `docker compose --profile test run --rm --build test` (100%).
```bash
git add apps/api
git commit -F - <<'EOF'
feat(api): add todo and health routes with the composition root

All routes under /api with ETag/Location headers, idempotent replays,
strict parsing before service calls (400 → 428 → 404 → 412), a 16 kB
body limit, request logging and a Postgres-backed runtime.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: API and migrate images, default Compose stack

**Files:**
- Modify: `Dockerfile` (full replacement below), `compose.yaml` (add `db`, `migrate`, `api`, volume `pgdata`)

**Interfaces:**
- Produces: Docker targets `test`, `api`, `migrate`; Compose services `db`, `migrate`, `api` (no published ports).

- [ ] **Step 1: Replace the Dockerfile**

`Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1

FROM node:24.21-alpine AS base
WORKDIR /repo

# Every workspace manifest + the lockfile: the cache key for dependency installs.
FROM base AS manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# One full install (dev dependencies included) for building and testing.
FROM manifests AS deps
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS source
COPY . .

# Lint, typecheck and every test layer with the coverage gate.
FROM source AS test
ENV COVERAGE_DIR=/reports/coverage
CMD ["npm", "run", "test:ci"]

FROM source AS build-api
RUN npm run build -w @foci/shared -w @foci/api

# Production dependencies of the API (and the shared package it links to) only.
FROM manifests AS api-prod-deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund -w @foci/api -w @foci/shared

# Runtime: non-root, compiled JavaScript + production dependencies + migrations.
FROM node:24.21-alpine AS api
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=api-prod-deps --chown=node:node /repo/node_modules ./node_modules
COPY --chown=node:node packages/shared/package.json packages/shared/
COPY --from=build-api --chown=node:node /repo/packages/shared/dist packages/shared/dist
COPY --chown=node:node apps/api/package.json apps/api/
COPY --from=build-api --chown=node:node /repo/apps/api/dist apps/api/dist
COPY --chown=node:node apps/api/migrations apps/api/migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=10 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "apps/api/dist/server.js"]

# Same image, one-shot command: apply pending SQL migrations and exit.
FROM api AS migrate
HEALTHCHECK NONE
CMD ["node_modules/.bin/node-pg-migrate", "up", "-m", "apps/api/migrations"]
```

- [ ] **Step 2: Add the default services to `compose.yaml`**

Add under `services:` (above `db-test`):
```yaml
  db:
    image: postgres:17.11-alpine
    environment:
      <<: *postgres-env
      POSTGRES_DB: todo
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U todo -d todo']
      interval: 2s
      timeout: 3s
      retries: 30

  migrate:
    build:
      context: .
      target: migrate
    environment:
      DATABASE_URL: postgres://todo:todo@db:5432/todo
    depends_on:
      db:
        condition: service_healthy

  api:
    build:
      context: .
      target: api
    environment:
      DATABASE_URL: postgres://todo:todo@db:5432/todo
      PORT: '3000'
      LOG_LEVEL: info
    depends_on:
      migrate:
        condition: service_completed_successfully
    read_only: true
    tmpfs:
      - /tmp
    restart: unless-stopped
```

And under `volumes:` add:
```yaml
  pgdata:
```

- [ ] **Step 3: Verify the stack end to end**

Run:
```bash
docker compose up --build -d api
until docker compose exec -T api wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; do sleep 1; done
docker compose ps
docker compose exec api wget -qO- http://127.0.0.1:3000/api/health
docker compose exec api wget -qO- --header 'Content-Type: application/json' \
  --post-data '{"title":"Smoke test"}' http://127.0.0.1:3000/api/todos
docker compose exec api sh -c 'ls node_modules | grep -c -E "^(vitest|typescript|eslint)$" || true'
docker compose logs migrate
docker compose down
```
Expected: `migrate` exited 0 after applying both migrations; `api` is `healthy`; health prints `{"status":"ok","db":"up","schemaVersion":"1759190400001_create-idempotency-keys"}`; the POST prints the created todo; the dev-tool count prints `0`.

If `npm ci` rejects the `-w` flags in the `api-prod-deps` stage, use `npm ci --omit=dev --no-audit --no-fund` there instead (other workspaces' production dependencies are then included) and note it in the commit body. The dev-tool count must still be `0`.

- [ ] **Step 4: Gate and commit**

Run: `docker compose --profile test run --rm --build test`.
```bash
git add Dockerfile compose.yaml
git commit -F - <<'EOF'
build(docker): add api and one-shot migrate images and the default stack

Multi-stage build with one cached install, production-only dependencies
in a non-root runtime with a health check, and Compose ordering
db healthy → migrate completed → api.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Then follow the per-PR procedure. PR title: `feat(api): HTTP API, runtime and container images`.
