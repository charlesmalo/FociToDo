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
            415: problem('Unsupported body charset'),
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
      '/api/todos/{id}/complete': {
        parameters: [parameterRef('TodoId')],
        ...statusAction('complete'),
      },
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
        ETag: {
          description: 'Strong ETag of the todo version, e.g. "3"',
          schema: { type: 'string' },
        },
        Location: { description: 'URL of the created todo', schema: { type: 'string' } },
        IdempotentReplayed: {
          description: 'Present when the response is a replay',
          schema: { type: 'string', enum: ['true'] },
        },
      },
    },
  };
}
