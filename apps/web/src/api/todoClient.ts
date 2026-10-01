import {
  ProblemSchema,
  TodoViewListSchema,
  TodoViewSchema,
  toEtag,
  type CreateTodoInput,
  type ListTodosQuery,
  type TodoView,
  type UpdateTodoInput,
} from '@foci/shared';
import type { z } from 'zod';
import { ApiError } from './ApiError';

export interface TodoClient {
  list(query: ListTodosQuery): Promise<TodoView[]>;
  get(id: string): Promise<TodoView>;
  create(input: CreateTodoInput, idempotencyKey: string): Promise<TodoView>;
  update(id: string, version: number, patch: UpdateTodoInput): Promise<TodoView>;
  complete(id: string): Promise<TodoView>;
  uncomplete(id: string): Promise<TodoView>;
  remove(id: string, version: number): Promise<void>;
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

interface RequestOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

async function toApiError(response: Response): Promise<ApiError> {
  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/problem+json')) {
    const parsed = ProblemSchema.safeParse(await response.json().catch(() => null));
    if (parsed.success) return new ApiError(parsed.data);
  }
  return new ApiError({
    type: 'about:blank',
    title: response.statusText || 'Request failed',
    status: response.status,
  });
}

/** The only module that talks HTTP. Responses are validated against the shared contract. */
export function createTodoClient(
  fetchFn: Fetch = (input, init) => fetch(input, init),
  baseUrl = '/api',
): TodoClient {
  async function send(path: string, options: RequestOptions = {}): Promise<Response> {
    const response = await fetchFn(`${baseUrl}${path}`, {
      ...options,
      headers: { Accept: 'application/json, application/problem+json', ...options.headers },
    });
    if (!response.ok) throw await toApiError(response);
    return response;
  }

  async function sendFor<S extends z.ZodType>(
    schema: S,
    path: string,
    options?: RequestOptions,
  ): Promise<z.output<S>> {
    const response = await send(path, options);
    return schema.parse(await response.json());
  }

  const jsonBody = (method: string, body: unknown, headers: Record<string, string>) => ({
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });

  const todoPath = (id: string, suffix = '') => `/todos/${encodeURIComponent(id)}${suffix}`;

  return {
    list: (query) => sendFor(TodoViewListSchema, `/todos?${new URLSearchParams(query).toString()}`),
    get: (id) => sendFor(TodoViewSchema, todoPath(id)),
    create: (input, idempotencyKey) =>
      sendFor(
        TodoViewSchema,
        '/todos',
        jsonBody('POST', input, { 'Idempotency-Key': idempotencyKey }),
      ),
    update: (id, version, patch) =>
      sendFor(
        TodoViewSchema,
        todoPath(id),
        jsonBody('PATCH', patch, { 'If-Match': toEtag(version) }),
      ),
    complete: (id) => sendFor(TodoViewSchema, todoPath(id, '/complete'), { method: 'POST' }),
    uncomplete: (id) => sendFor(TodoViewSchema, todoPath(id, '/incomplete'), { method: 'POST' }),
    remove: async (id, version) => {
      await send(todoPath(id), { method: 'DELETE', headers: { 'If-Match': toEtag(version) } });
    },
  };
}
