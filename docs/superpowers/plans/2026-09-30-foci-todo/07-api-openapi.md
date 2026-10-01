# PR 7 — OpenAPI Contract and API Explorer

> Read `00-index.md` first. Branch: `feat/api-openapi`.

**Delivers:** an OpenAPI 3.1 document generated from the `@foci/shared` Zod schemas with Zod's built-in `z.toJSONSchema` (spec amendment A1), served at `/api/openapi.json`, an interactive Swagger UI at `/api/docs`, a committed `apps/api/openapi.json` kept in sync by a test, and conformance tests (every route documented; every real response matches a documented status and schema).

**Spec sections:** §5.5 (OpenAPI/docs routes), §5.6, NFR-10.

---

### Task 1: Generate the OpenAPI document

**Files:**
- Create: `apps/api/src/http/openapi.ts`, `apps/api/openapi.json` (generated)
- Test: `apps/api/tests/http/openapi.test.ts`

**Interfaces:**
- Consumes: shared schemas (`TodoViewSchema`, `CreateTodoSchema`, `UpdateTodoSchema`, `ProblemSchema`, `TodoIdSchema`, `IfMatchSchema`, `IdempotencyKeySchema`, `ListTodosQuerySchema`); `createTodoRouter`, `createHealthRouter` (PR 5) for the route-coverage test.
- Produces: `type OpenApiDocument = Record<string, unknown>`; `toSchema(schema: z.ZodType, io: 'input' | 'output'): Record<string, unknown>`; `buildOpenApiDocument(): OpenApiDocument`.

- [ ] **Step 1: Write the failing tests**

`apps/api/tests/http/openapi.test.ts`:
```ts
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Router } from 'express';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createHealthRouter } from '../../src/http/healthRoutes.js';
import { buildOpenApiDocument, toSchema } from '../../src/http/openapi.js';
import { createTodoRouter } from '../../src/http/todoRoutes.js';
import type { HealthService } from '../../src/service/HealthService.js';
import type { TodoService } from '../../src/service/TodoService.js';

const document = buildOpenApiDocument() as {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, Record<string, unknown>> };
};

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

function expressRoutes(router: Router): string[] {
  const { stack } = router as unknown as { stack: RouteLayer[] };
  return stack.flatMap((layer) =>
    layer.route === undefined
      ? []
      : Object.keys(layer.route.methods).map(
          (method) =>
            `${method.toUpperCase()} /api${layer.route?.path.replace(/:(\w+)/g, '{$1}')}`,
        ),
  );
}

function documentedOperations(): string[] {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    ['get', 'post', 'patch', 'put', 'delete']
      .filter((method) => method in item)
      .map((method) => `${method.toUpperCase()} ${path}`),
  );
}

describe('toSchema', () => {
  it('drops the JSON Schema dialect marker', () => {
    expect(toSchema(z.string().max(3), 'input')).toEqual({ type: 'string', maxLength: 3 });
  });
});

describe('buildOpenApiDocument', () => {
  it('is an OpenAPI 3.1 document', () => {
    expect(document.openapi).toBe('3.1.0');
  });

  it('documents exactly the routes Express serves', () => {
    const served = [
      ...expressRoutes(createTodoRouter({} as TodoService)),
      ...expressRoutes(createHealthRouter({} as HealthService)),
    ].sort();
    expect(documentedOperations().sort()).toEqual(served);
  });

  it('derives request schemas from the shared Zod schemas', () => {
    const create = document.components.schemas.CreateTodo as {
      required: string[];
      additionalProperties: boolean;
      properties: { title: { maxLength: number } };
    };
    expect(create.required).toEqual(['title']);
    expect(create.additionalProperties).toBe(false);
    expect(create.properties.title.maxLength).toBe(200);
  });

  it('matches the committed openapi.json (regenerate with UPDATE_OPENAPI=1)', async () => {
    const path = fileURLToPath(new URL('../../openapi.json', import.meta.url));
    const generated = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
    if (process.env.UPDATE_OPENAPI === '1') await writeFile(path, generated);
    expect(await readFile(path, 'utf8')).toBe(generated);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dev npx vitest run apps/api/tests/http/openapi.test.ts`
Expected: FAIL — module `openapi.js` not found.

- [ ] **Step 3: Implement**

`apps/api/src/http/openapi.ts`:
```ts
import {
  CreateTodoSchema,
  IdempotencyKeySchema,
  IfMatchSchema,
  ListTodosQuerySchema,
  ProblemSchema,
  TodoIdSchema,
  TodoViewSchema,
  UpdateTodoSchema,
} from '@foci/shared';
import { z } from 'zod';

export type OpenApiDocument = Record<string, unknown>;
type JsonObject = Record<string, unknown>;

/** Zod → JSON Schema 2020-12 (the OpenAPI 3.1 dialect), without the `$schema` marker. */
export function toSchema(schema: z.ZodType, io: 'input' | 'output'): JsonObject {
  const jsonSchema = z.toJSONSchema(schema, { io }) as JsonObject;
  delete jsonSchema.$schema;
  return jsonSchema;
}

const schemaRef = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const parameterRef = (name: string) => ({ $ref: `#/components/parameters/${name}` });
const headerRef = (name: string) => ({ $ref: `#/components/headers/${name}` });
const jsonContent = (schema: JsonObject) => ({ 'application/json': { schema } });

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: schemaRef('Problem') } },
});

const todoResponse = (description: string) => ({
  description,
  headers: { ETag: headerRef('ETag') },
  content: jsonContent(schemaRef('Todo')),
});

const queryParameter = (name: 'status' | 'sort' | 'order') => ({
  name,
  in: 'query',
  required: false,
  schema: toSchema(ListTodosQuerySchema.shape[name], 'input'),
});

const HEALTH_SCHEMA: JsonObject = {
  type: 'object',
  required: ['status', 'db', 'schemaVersion'],
  properties: {
    status: { type: 'string', enum: ['ok', 'degraded'] },
    db: { type: 'string', enum: ['up', 'down'] },
    schemaVersion: { type: ['string', 'null'] },
  },
};

const statusAction = (verb: string) => ({
  post: {
    operationId: `${verb}Todo`,
    summary: `Mark a todo ${verb === 'complete' ? 'completed' : 'not completed'} (idempotent)`,
    responses: {
      200: todoResponse('The todo; the version changes only if the state changed'),
      400: problem('Malformed id'),
      404: problem('Todo not found'),
    },
  },
});

/** The API contract, generated from the same Zod schemas the API validates with. */
export function buildOpenApiDocument(): OpenApiDocument {
  return {
    openapi: '3.1.0',
    info: {
      title: 'FociToDo API',
      version: '1.0.0',
      description:
        'Manage to-do items. Updates and deletes use optimistic concurrency: send the ETag you ' +
        'received as If-Match (412 if stale, 428 if missing). Creates accept an optional ' +
        'Idempotency-Key so retries never create duplicates. Errors are RFC 9457 problem details.',
    },
    paths: {
      '/api/todos': {
        get: {
          operationId: 'listTodos',
          summary: 'List todos (filter and sort)',
          parameters: [parameterRef('Status'), parameterRef('Sort'), parameterRef('Order')],
          responses: {
            200: {
              description: 'Todos',
              content: jsonContent({ type: 'array', items: schemaRef('Todo') }),
            },
            400: problem('Invalid query parameters'),
          },
        },
        post: {
          operationId: 'createTodo',
          summary: 'Create a todo',
          parameters: [parameterRef('IdempotencyKey')],
          requestBody: { required: true, content: jsonContent(schemaRef('CreateTodo')) },
          responses: {
            201: {
              description: 'Created, or replayed for a repeated Idempotency-Key',
              headers: {
                ETag: headerRef('ETag'),
                Location: headerRef('Location'),
                'Idempotent-Replayed': headerRef('IdempotentReplayed'),
              },
              content: jsonContent(schemaRef('Todo')),
            },
            400: problem('Invalid body, malformed JSON or invalid Idempotency-Key'),
            413: problem('Body larger than 16 kB'),
            415: problem('Unsupported body charset'),
            422: problem('Idempotency-Key reused with a different body'),
          },
        },
      },
      '/api/todos/{id}': {
        parameters: [parameterRef('TodoId')],
        get: {
          operationId: 'getTodo',
          summary: 'Get a todo',
          responses: {
            200: todoResponse('The todo'),
            400: problem('Malformed id'),
            404: problem('Todo not found'),
          },
        },
        patch: {
          operationId: 'updateTodo',
          summary: 'Update title, description or due date',
          parameters: [parameterRef('IfMatch')],
          requestBody: { required: true, content: jsonContent(schemaRef('UpdateTodo')) },
          responses: {
            200: todoResponse('The updated todo'),
            400: problem('Invalid id, body or If-Match'),
            404: problem('Todo not found'),
            412: problem('Version conflict: the todo changed since your ETag'),
            413: problem('Body larger than 16 kB'),
            428: problem('If-Match header missing'),
          },
        },
        delete: {
          operationId: 'deleteTodo',
          summary: 'Delete a todo',
          parameters: [parameterRef('IfMatch')],
          responses: {
            204: { description: 'Deleted' },
            400: problem('Invalid id or If-Match'),
            404: problem('Todo not found'),
            412: problem('Version conflict: the todo changed since your ETag'),
            428: problem('If-Match header missing'),
          },
        },
      },
      '/api/todos/{id}/complete': { parameters: [parameterRef('TodoId')], ...statusAction('complete') },
      '/api/todos/{id}/incomplete': {
        parameters: [parameterRef('TodoId')],
        ...statusAction('uncomplete'),
      },
      '/api/health': {
        get: {
          operationId: 'getHealth',
          summary: 'Liveness and database status',
          responses: {
            200: { description: 'Healthy', content: jsonContent(schemaRef('Health')) },
            503: { description: 'Database unreachable', content: jsonContent(schemaRef('Health')) },
          },
        },
      },
    },
    components: {
      schemas: {
        Todo: toSchema(TodoViewSchema, 'output'),
        CreateTodo: toSchema(CreateTodoSchema, 'input'),
        UpdateTodo: toSchema(UpdateTodoSchema, 'input'),
        Problem: toSchema(ProblemSchema, 'output'),
        Health: HEALTH_SCHEMA,
      },
      parameters: {
        TodoId: { name: 'id', in: 'path', required: true, schema: toSchema(TodoIdSchema, 'input') },
        IfMatch: {
          name: 'If-Match',
          in: 'header',
          required: true,
          description: 'The ETag from your last response for this todo, e.g. "3"',
          schema: toSchema(IfMatchSchema, 'input'),
        },
        IdempotencyKey: {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          description: 'Unique per logical create; retries with the same key replay the response',
          schema: toSchema(IdempotencyKeySchema, 'input'),
        },
        Status: queryParameter('status'),
        Sort: queryParameter('sort'),
        Order: queryParameter('order'),
      },
      headers: {
        ETag: { description: 'Strong ETag of the todo version, e.g. "3"', schema: { type: 'string' } },
        Location: { description: 'URL of the created todo', schema: { type: 'string' } },
        IdempotentReplayed: {
          description: 'Present when the response is a replay',
          schema: { type: 'string', enum: ['true'] },
        },
      },
    },
  };
}
```

- [ ] **Step 4: Generate the committed document and run the tests**

Run: `dev sh -c 'UPDATE_OPENAPI=1 npx vitest run apps/api/tests/http/openapi.test.ts'` then `dev npx vitest run apps/api/tests/http/openapi.test.ts`
Expected: first run writes `apps/api/openapi.json`; second run PASS without the variable. Open the file and check `components.schemas.CreateTodo` has `additionalProperties: false`, the title length limits and the due-date `format: date`.

- [ ] **Step 5: Format, gate, commit**

Run: `dev npx prettier --write apps/api` then `docker compose --profile test run --rm --build test`.
```bash
git add apps/api/src/http/openapi.ts apps/api/tests/http/openapi.test.ts apps/api/openapi.json
git commit -F - <<'EOF'
feat(api): generate the OpenAPI 3.1 contract from the shared Zod schemas

Uses Zod's native JSON Schema conversion (input side for requests,
output side for responses). Tests pin that every served route is
documented and that the committed openapi.json is current.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Serve the document and Swagger UI; prove response conformance

**Files:**
- Create: `apps/api/src/http/docsRoutes.ts`
- Modify: `apps/api/src/http/createHttpApp.ts`
- Test: `apps/api/tests/http/docsRoutes.test.ts`, `apps/api/tests/http/openapi.int.test.ts`

**Interfaces:**
- Consumes: `buildOpenApiDocument`, `OpenApiDocument` (Task 1).
- Produces: `createDocsRouter(document: OpenApiDocument): Router` serving `GET /openapi.json` and `/docs` (mounted under `/api`).

- [ ] **Step 1: Add the dependency**

Run: `dev npm install -w @foci/api swagger-ui-express@^5.0.1` and `dev npm install -w @foci/api -D @types/swagger-ui-express@^4.1.8`

- [ ] **Step 2: Write the failing tests**

`apps/api/tests/http/docsRoutes.test.ts`:
```ts
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
```

`apps/api/tests/http/openapi.int.test.ts`:
```ts
import { ProblemSchema, TodoViewListSchema, TodoViewSchema } from '@foci/shared';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRuntime, type Runtime } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { buildOpenApiDocument } from '../../src/http/openapi.js';
import { todoId } from '../support/fakes.js';
import { resetDatabase, testDatabaseUrl } from '../support/testDatabase.js';

const document = buildOpenApiDocument() as {
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
};
let runtime: Runtime;
const api = () => request(runtime.app);

/** Asserts the status is documented for this operation and the body matches its schema. */
function expectConforms(response: Response, path: string, method: string): void {
  const documented = Object.keys(document.paths[path]?.[method]?.responses ?? {});
  expect(documented).toContain(String(response.status));
  if (response.status >= 400) {
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    ProblemSchema.parse(response.body);
  }
}

beforeAll(() => {
  runtime = createRuntime(loadConfig({ DATABASE_URL: testDatabaseUrl(), LOG_LEVEL: 'silent' }));
});
beforeEach(() => resetDatabase(runtime.pool));
afterAll(() => runtime.close());

describe('responses conform to the OpenAPI document', () => {
  it('for the happy path of every operation', async () => {
    const created = await api().post('/api/todos').send({ title: 'Conform' });
    expectConforms(created, '/api/todos', 'post');
    TodoViewSchema.parse(created.body);
    const id = created.body.id as string;

    const list = await api().get('/api/todos');
    expectConforms(list, '/api/todos', 'get');
    TodoViewListSchema.parse(list.body);

    const one = await api().get(`/api/todos/${id}`);
    expectConforms(one, '/api/todos/{id}', 'get');
    TodoViewSchema.parse(one.body);

    const patched = await api().patch(`/api/todos/${id}`).set('If-Match', '"1"').send({ title: 'x' });
    expectConforms(patched, '/api/todos/{id}', 'patch');
    TodoViewSchema.parse(patched.body);

    const completed = await api().post(`/api/todos/${id}/complete`);
    expectConforms(completed, '/api/todos/{id}/complete', 'post');
    const reopened = await api().post(`/api/todos/${id}/incomplete`);
    expectConforms(reopened, '/api/todos/{id}/incomplete', 'post');

    const deleted = await api().delete(`/api/todos/${id}`).set('If-Match', '"4"');
    expectConforms(deleted, '/api/todos/{id}', 'delete');

    expectConforms(await api().get('/api/health'), '/api/health', 'get');
  });

  it('for documented error responses', async () => {
    const missing = todoId(999);
    expectConforms(await api().post('/api/todos').send({}), '/api/todos', 'post');
    expectConforms(await api().get('/api/todos?status=nope'), '/api/todos', 'get');
    expectConforms(await api().get(`/api/todos/${missing}`), '/api/todos/{id}', 'get');
    expectConforms(
      await api().patch(`/api/todos/${missing}`).send({ title: 'x' }),
      '/api/todos/{id}',
      'patch',
    );
    expectConforms(
      await api().delete(`/api/todos/${missing}`).set('If-Match', '"1"'),
      '/api/todos/{id}',
      'delete',
    );
    expectConforms(
      await api().post(`/api/todos/${missing}/complete`),
      '/api/todos/{id}/complete',
      'post',
    );
  });

  it('serves the document and the explorer from the running app', async () => {
    expect((await api().get('/api/openapi.json')).body).toEqual(buildOpenApiDocument());
    expect((await api().get('/api/docs/')).status).toBe(200);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `dev npx vitest run apps/api/tests/http/docsRoutes.test.ts apps/api/tests/http/openapi.int.test.ts`
Expected: FAIL — `docsRoutes.js` not found.

- [ ] **Step 4: Implement and mount**

`apps/api/src/http/docsRoutes.ts`:
```ts
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
```

In `apps/api/src/http/createHttpApp.ts`, add the imports:
```ts
import { createDocsRouter } from './docsRoutes.js';
import { buildOpenApiDocument } from './openapi.js';
```
and mount after the todo router (before `notFoundHandler`):
```ts
  app.use('/api', createDocsRouter(buildOpenApiDocument()));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dev npx vitest run apps/api/tests/http`
Expected: PASS.

- [ ] **Step 6: Format, gate, commit**

Run: `dev npx prettier --write apps/api` then `docker compose --profile test run --rm --build test`.
```bash
git add apps/api package.json package-lock.json
git commit -F - <<'EOF'
feat(api): serve the OpenAPI document and a Swagger UI explorer

GET /api/openapi.json and /api/docs. Integration tests check that every
real response status is documented for its operation and that bodies
match the shared schemas.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Then follow the per-PR procedure. PR title: `feat(api): OpenAPI contract and API explorer`.
