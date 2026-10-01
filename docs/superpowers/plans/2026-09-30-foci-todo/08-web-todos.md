# PR 8 — Web App (Todos)

> Read `00-index.md` first. Branch: `feat/web-todos`.

**Delivers:** the `@foci/web` React app — a typed API client (the only `fetch` caller), TanStack Query hooks, the single-page todo UI with a Radix dialog (create / view / edit / delete), conflict and idempotency handling, the `web` nginx image and the Compose `web` service. After this PR, `docker compose up --build` serves the full app on http://localhost:8080.

**Spec sections:** §7.1–7.3, §8.1–8.3, Review Focus items 4–5.

**Testing approach:** components get a fake `TodoClient` through `TodoClientProvider` (dependency injection — no module mocking); the client itself is tested with a stubbed `fetch`.

---

### Task 1: Web workspace and API client layer

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`
- Create: `apps/web/src/api/ApiError.ts`, `todoClient.ts`, `TodoClientContext.tsx`, `describeError.ts`, `idempotencyKey.ts` (under `apps/web/src/api/`), `apps/web/src/queryClient.ts`
- Create: `apps/web/tests/setup.ts`, `apps/web/tests/support/fixtures.tsx`
- Modify: `vitest.config.ts`, `eslint.config.js`, `Dockerfile` (manifests stage)
- Test: `apps/web/tests/api/ApiError.test.ts`, `todoClient.test.ts`, `TodoClientContext.test.tsx`, `describeError.test.ts`, `idempotencyKey.test.ts` (under `apps/web/tests/api/`), `apps/web/tests/queryClient.test.ts`

**Interfaces:**
- Consumes: `@foci/shared` schemas and types.
- Produces:
  - `class ApiError extends Error { status: number; type: string; errors: FieldError[] }` (`constructor(problem: Problem)`; message = `detail ?? title`)
  - `interface TodoClient { list(query: ListTodosQuery): Promise<TodoView[]>; get(id: string): Promise<TodoView>; create(input: CreateTodoInput, idempotencyKey: string): Promise<TodoView>; update(id: string, version: number, patch: UpdateTodoInput): Promise<TodoView>; complete(id: string): Promise<TodoView>; uncomplete(id: string): Promise<TodoView>; remove(id: string, version: number): Promise<void> }`
  - `type Fetch = (input: string, init?: RequestInit) => Promise<Response>`, `createTodoClient(fetchFn?: Fetch, baseUrl?: string): TodoClient`
  - `TodoClientProvider({ client, children })`, `useTodoClient(): TodoClient`
  - `describeError(error: unknown): string`
  - `newIdempotencyKey(random?: (bytes: Uint8Array) => Uint8Array): string`
  - `shouldRetry(failureCount: number, error: unknown): boolean`, `createQueryClient(): QueryClient`
  - Test support: `makeView(overrides?: Partial<TodoView>): TodoView`, `fakeClient(overrides?: Partial<TodoClient>): TodoClient`, `renderWithProviders(ui: ReactElement, client: TodoClient): RenderResult & { queryClient: QueryClient }`

- [ ] **Step 1: Create the workspace and install dependencies**

`apps/web/package.json`:
```json
{
  "name": "@foci/web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@foci/shared": "*"
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "noEmit": true,
    "types": ["vite/client", "node"],
    "customConditions": ["@foci/source"]
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

`apps/web/vite.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@foci/shared': fromHere('../../packages/shared/src/index.ts') },
  },
});
```

In `Dockerfile`, `manifests` stage, add:
```dockerfile
COPY apps/web/package.json apps/web/
```

Run:
```bash
dev npm install
dev npm install -w @foci/web react@^19.3.0 react-dom@^19.3.0 @tanstack/react-query@^5.104.0 @radix-ui/react-dialog@^1.1.23 zod@^4.6.5
dev npm install -D vite@^8.3.1 @vitejs/plugin-react@^6.1.1 jsdom@^30.1.1 \
  @testing-library/react@^16.3.3 @testing-library/dom@^10.0.0 @testing-library/user-event@^14.6.7 \
  @testing-library/jest-dom@^7.0.1 @types/react@^19.3.0 @types/react-dom@^19.3.0 \
  eslint-plugin-react-hooks@^7.1.1
```

- [ ] **Step 2: Wire Vitest and ESLint for the web project**

In `vitest.config.ts`, add `import react from '@vitejs/plugin-react';` at the top and add to `projects`:
```ts
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/tests/**/*.test.{ts,tsx}'],
          setupFiles: ['apps/web/tests/setup.ts'],
        },
      },
```

In `eslint.config.js`, add `import reactHooks from 'eslint-plugin-react-hooks';` and append this block to the config list:
```js
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
```

`apps/web/tests/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 3: Write the failing tests**

`apps/web/tests/support/fixtures.tsx`:
```tsx
import type { TodoView } from '@foci/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { TodoClientProvider } from '../../src/api/TodoClientContext';
import type { TodoClient } from '../../src/api/todoClient';

let sequence = 0;

export function makeView(overrides: Partial<TodoView> = {}): TodoView {
  sequence += 1;
  return {
    id: `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`,
    title: `Task ${sequence}`,
    description: null,
    dueDate: null,
    isCompleted: false,
    createdAt: '2026-09-30T12:00:00.000Z',
    version: 1,
    isOverdue: false,
    ...overrides,
  };
}

/** A TodoClient whose methods fail loudly unless a test provides them. */
export function fakeClient(overrides: Partial<TodoClient> = {}): TodoClient {
  const unexpected = (name: string) =>
    vi.fn(() => Promise.reject(new Error(`unexpected TodoClient.${name} call`)));
  return {
    list: unexpected('list'),
    get: unexpected('get'),
    create: unexpected('create'),
    update: unexpected('update'),
    complete: unexpected('complete'),
    uncomplete: unexpected('uncomplete'),
    remove: unexpected('remove'),
    ...overrides,
  };
}

export function renderWithProviders(ui: ReactElement, client: TodoClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider client={client}>{ui}</TodoClientProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}
```

`apps/web/tests/api/ApiError.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/ApiError';

describe('ApiError', () => {
  it('uses the problem detail as message and keeps field errors', () => {
    const errors = [{ field: 'title', message: 'Title is required' }];
    const error = new ApiError({
      type: '/problems/validation-error',
      title: 'Validation failed',
      status: 400,
      detail: 'The request contains invalid fields',
      errors,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.message).toBe('The request contains invalid fields');
    expect(error.status).toBe(400);
    expect(error.type).toBe('/problems/validation-error');
    expect(error.errors).toEqual(errors);
  });

  it('falls back to the title and an empty error list', () => {
    const error = new ApiError({ type: 'about:blank', title: 'Bad Gateway', status: 502 });
    expect(error.message).toBe('Bad Gateway');
    expect(error.errors).toEqual([]);
  });
});
```

`apps/web/tests/api/todoClient.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { ApiError } from '../../src/api/ApiError';
import { createTodoClient, type Fetch } from '../../src/api/todoClient';
import { makeView } from '../support/fixtures';

const json = (body: unknown, status = 200, type = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } });

function recordingFetch(response: Response) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchFn: Fetch = async (url, init) => {
    calls.push({ url, init });
    return response;
  };
  return { fetchFn, calls };
}

const headersOf = (init: RequestInit | undefined) => init?.headers as Record<string, string>;

describe('createTodoClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists with the query string and validates the response', async () => {
    const todo = makeView();
    const { fetchFn, calls } = recordingFetch(json([todo]));
    const client = createTodoClient(fetchFn);
    await expect(
      client.list({ status: 'overdue', sort: 'dueDate', order: 'asc' }),
    ).resolves.toEqual([todo]);
    expect(calls[0]?.url).toBe('/api/todos?status=overdue&sort=dueDate&order=asc');
    expect(headersOf(calls[0]?.init).Accept).toBe('application/json, application/problem+json');
  });

  it('gets one todo', async () => {
    const todo = makeView();
    const { fetchFn, calls } = recordingFetch(json(todo));
    await expect(createTodoClient(fetchFn).get(todo.id)).resolves.toEqual(todo);
    expect(calls[0]?.url).toBe(`/api/todos/${todo.id}`);
  });

  it('creates with a JSON body and the Idempotency-Key', async () => {
    const todo = makeView();
    const { fetchFn, calls } = recordingFetch(json(todo, 201));
    await createTodoClient(fetchFn).create({ title: 'Buy milk' }, 'key-1');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.body).toBe('{"title":"Buy milk"}');
    expect(headersOf(calls[0]?.init)).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': 'key-1',
    });
  });

  it('updates with If-Match built from the version', async () => {
    const todo = makeView({ version: 4 });
    const { fetchFn, calls } = recordingFetch(json(todo));
    await createTodoClient(fetchFn).update(todo.id, 3, { title: 'New' });
    expect(calls[0]?.init?.method).toBe('PATCH');
    expect(headersOf(calls[0]?.init)['If-Match']).toBe('"3"');
  });

  it('completes and uncompletes through the action routes', async () => {
    const todo = makeView();
    const first = recordingFetch(json(todo));
    await createTodoClient(first.fetchFn).complete(todo.id);
    expect(first.calls[0]?.url).toBe(`/api/todos/${todo.id}/complete`);
    expect(first.calls[0]?.init?.method).toBe('POST');
    const second = recordingFetch(json(todo));
    await createTodoClient(second.fetchFn).uncomplete(todo.id);
    expect(second.calls[0]?.url).toBe(`/api/todos/${todo.id}/incomplete`);
  });

  it('deletes with If-Match and resolves on 204', async () => {
    const { fetchFn, calls } = recordingFetch(new Response(null, { status: 204 }));
    await expect(createTodoClient(fetchFn).remove('abc', 2)).resolves.toBeUndefined();
    expect(calls[0]?.init?.method).toBe('DELETE');
    expect(headersOf(calls[0]?.init)['If-Match']).toBe('"2"');
  });

  it('turns problem details into an ApiError with field errors', async () => {
    const problem = {
      type: '/problems/validation-error',
      title: 'Validation failed',
      status: 400,
      errors: [{ field: 'title', message: 'Title is required' }],
    };
    const { fetchFn } = recordingFetch(json(problem, 400, 'application/problem+json'));
    const failure = createTodoClient(fetchFn).create({ title: '' }, 'k');
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 400, errors: problem.errors });
  });

  const errorResponse = (body: string | null, status: number, statusText: string, type?: string) =>
    new Response(body, {
      status,
      statusText,
      headers: type === undefined ? {} : { 'Content-Type': type },
    });

  it.each([
    ['a non-problem error body', errorResponse('<h1>502</h1>', 502, 'Bad Gateway', 'text/html'), 'Bad Gateway'],
    ['an unparsable problem body', errorResponse('{', 500, 'Server Error', 'application/problem+json'), 'Server Error'],
    ['a problem body of the wrong shape', errorResponse('{"nope":1}', 409, '', 'application/problem+json'), 'Request failed'],
    ['no content type and no status text', errorResponse(null, 500, ''), 'Request failed'],
  ])('falls back to a generic ApiError for %s', async (_label, response, message) => {
    const { fetchFn } = recordingFetch(response);
    await expect(createTodoClient(fetchFn).get('x')).rejects.toMatchObject({
      type: 'about:blank',
      message,
    });
  });

  it('rejects responses that do not match the contract', async () => {
    const { fetchFn } = recordingFetch(json({ id: 'not-a-todo' }));
    await expect(createTodoClient(fetchFn).get('x')).rejects.toBeInstanceOf(ZodError);
  });

  it('uses the global fetch and the /api base by default', async () => {
    const todo = makeView();
    const fetchSpy = vi.fn(async () => json(todo));
    vi.stubGlobal('fetch', fetchSpy);
    await createTodoClient().get(todo.id);
    expect(fetchSpy).toHaveBeenCalledWith(`/api/todos/${todo.id}`, expect.any(Object));
  });

  it('honours a custom base URL', async () => {
    const { fetchFn, calls } = recordingFetch(json(makeView()));
    await createTodoClient(fetchFn, 'http://api.test').get('x');
    expect(calls[0]?.url).toBe('http://api.test/todos/x');
  });
});
```

`apps/web/tests/api/TodoClientContext.test.tsx`:
```tsx
import { render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TodoClientProvider, useTodoClient } from '../../src/api/TodoClientContext';
import { fakeClient } from '../support/fixtures';

describe('useTodoClient', () => {
  it('returns the provided client', () => {
    const client = fakeClient();
    const { result } = renderHook(() => useTodoClient(), {
      wrapper: ({ children }) => <TodoClientProvider client={client}>{children}</TodoClientProvider>,
    });
    expect(result.current).toBe(client);
  });

  it('fails clearly without a provider', () => {
    function Consumer() {
      useTodoClient();
      return null;
    }
    expect(() => render(<Consumer />)).toThrow('useTodoClient must be used inside a TodoClientProvider');
  });
});
```

`apps/web/tests/api/describeError.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/ApiError';
import { describeError } from '../../src/api/describeError';

describe('describeError', () => {
  it('uses the API error message', () => {
    expect(
      describeError(new ApiError({ type: 'x', title: 'Not found', status: 404, detail: 'Gone' })),
    ).toBe('Gone');
  });

  it('describes anything else as a connectivity problem', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toBe(
      'Could not reach the server. Check your connection and try again.',
    );
  });
});
```

`apps/web/tests/api/idempotencyKey.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { newIdempotencyKey } from '../../src/api/idempotencyKey';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newIdempotencyKey', () => {
  it('produces distinct v4 UUIDs', () => {
    const first = newIdempotencyKey();
    expect(first).toMatch(UUID_V4);
    expect(newIdempotencyKey()).not.toBe(first);
  });

  it('needs only getRandomValues, so it works where crypto.randomUUID is unavailable (http://<LAN-IP>)', () => {
    const key = newIdempotencyKey((bytes) => bytes.fill(0xff));
    expect(key).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
```

`apps/web/tests/queryClient.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/api/ApiError';
import { createQueryClient, shouldRetry } from '../src/queryClient';

const apiError = (status: number) => new ApiError({ type: 'x', title: 'x', status });

describe('shouldRetry', () => {
  it('never retries client errors', () => {
    expect(shouldRetry(0, apiError(404))).toBe(false);
  });

  it('retries server and network errors twice', () => {
    expect(shouldRetry(0, apiError(503))).toBe(true);
    expect(shouldRetry(1, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(2, new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('applies the retry policy to queries and disables mutation retries', () => {
    const options = createQueryClient().getDefaultOptions();
    expect(options.queries?.retry).toBe(shouldRetry);
    expect(options.mutations?.retry).toBe(false);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `dev npx vitest run --project web`
Expected: FAIL — modules under `src/api` and `src/queryClient` not found.

- [ ] **Step 5: Implement**

`apps/web/src/api/ApiError.ts`:
```ts
import type { FieldError, Problem } from '@foci/shared';

/** An HTTP error response from the API, carrying its RFC 9457 problem details. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly type: string;
  readonly errors: FieldError[];

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.status = problem.status;
    this.type = problem.type;
    this.errors = problem.errors ?? [];
  }
}
```

`apps/web/src/api/todoClient.ts`:
```ts
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
      sendFor(TodoViewSchema, '/todos', jsonBody('POST', input, { 'Idempotency-Key': idempotencyKey })),
    update: (id, version, patch) =>
      sendFor(TodoViewSchema, todoPath(id), jsonBody('PATCH', patch, { 'If-Match': toEtag(version) })),
    complete: (id) => sendFor(TodoViewSchema, todoPath(id, '/complete'), { method: 'POST' }),
    uncomplete: (id) => sendFor(TodoViewSchema, todoPath(id, '/incomplete'), { method: 'POST' }),
    remove: async (id, version) => {
      await send(todoPath(id), { method: 'DELETE', headers: { 'If-Match': toEtag(version) } });
    },
  };
}
```

`apps/web/src/api/TodoClientContext.tsx`:
```tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { TodoClient } from './todoClient';

const TodoClientContext = createContext<TodoClient | null>(null);

export function TodoClientProvider({ client, children }: { client: TodoClient; children: ReactNode }) {
  return <TodoClientContext.Provider value={client}>{children}</TodoClientContext.Provider>;
}

export function useTodoClient(): TodoClient {
  const client = useContext(TodoClientContext);
  if (client === null) throw new Error('useTodoClient must be used inside a TodoClientProvider');
  return client;
}
```

`apps/web/src/api/describeError.ts`:
```ts
import { ApiError } from './ApiError';

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Could not reach the server. Check your connection and try again.';
}
```

`apps/web/src/api/idempotencyKey.ts`:
```ts
type RandomFill = (bytes: Uint8Array) => Uint8Array;

/**
 * RFC 4122 version-4 UUID built from `crypto.getRandomValues`, which (unlike `crypto.randomUUID`)
 * is also available on insecure origins such as http://192.168.x.x:8080.
 */
export function newIdempotencyKey(
  random: RandomFill = (bytes) => crypto.getRandomValues(bytes),
): string {
  const bytes = random(new Uint8Array(16));
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
```

`apps/web/src/queryClient.ts`:
```ts
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/ApiError';

/** Client errors (4xx) are answers, not glitches: retry only network/server failures, twice. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 5_000 },
      mutations: { retry: false },
    },
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dev npx vitest run --project web`
Expected: PASS.

- [ ] **Step 7: Format, gate, commit**

Run: `dev npx prettier --write apps/web vitest.config.ts eslint.config.js` then `docker compose --profile test run --rm --build test` (100%).
```bash
git add apps/web vitest.config.ts eslint.config.js Dockerfile package.json package-lock.json
git commit -F - <<'EOF'
feat(web): add the typed API client and query configuration

The client is the only fetch caller: it sends If-Match and
Idempotency-Key headers, turns problem details into ApiError, and
validates responses against the shared contract. Idempotency keys use
getRandomValues so they also work on insecure origins.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Hooks, form and shared UI pieces

**Files:**
- Create: `apps/web/src/todos/useTodos.ts`, `apps/web/src/todos/format.ts`
- Create: `apps/web/src/todos/components/ErrorBanner.tsx`, `ErrorBanner.module.css`, `TodoForm.tsx`, `TodoForm.module.css` (under `apps/web/src/todos/components/`)
- Test: `apps/web/tests/todos/format.test.ts`, `apps/web/tests/todos/components/ErrorBanner.test.tsx`, `apps/web/tests/todos/components/TodoForm.test.tsx`

**Interfaces:**
- Consumes: Task 1 client layer.
- Produces:
  - `todoKeys = { all: ['todos'], list(query), detail(id) }`; hooks `useTodoList(query)`, `useTodo(id)`, `useCreateTodo()` (`mutate({ input, idempotencyKey })`), `useUpdateTodo()` (`{ id, version, patch }`), `useSetCompleted()` (`{ id, completed }`), `useDeleteTodo()` (`{ id, version }`) — every mutation invalidates `['todos']` when settled.
  - `formatTimestamp(iso: string, locale?: string): string`
  - `ErrorBanner({ message, onRetry? })` (`role="alert"`)
  - `interface TodoFormValues { title: string; description: string; dueDate: string }`, `EMPTY_FORM`, `toInput(values): CreateTodoInput`, `toFormValues(todo: TodoView): TodoFormValues`, `TodoForm({ initialValues?, submitLabel, onSubmit: (input: CreateTodoInput) => Promise<void>, onCancel? })`

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/todos/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatTimestamp } from '../../src/todos/format';

describe('formatTimestamp', () => {
  it('formats an ISO timestamp for display in the given locale', () => {
    expect(formatTimestamp('2026-09-30T12:00:00.000Z', 'en-US')).toMatch(/Sep 30, 2026/);
  });
});
```

`apps/web/tests/todos/components/ErrorBanner.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBanner } from '../../../src/todos/components/ErrorBanner';

describe('ErrorBanner', () => {
  it('announces the message without a retry button by default', () => {
    render(<ErrorBanner message="Something broke" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something broke');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('offers a retry action', async () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="Offline" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
```

`apps/web/tests/todos/components/TodoForm.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/api/ApiError';
import {
  TodoForm,
  toFormValues,
  toInput,
} from '../../../src/todos/components/TodoForm';
import { makeView } from '../../support/fixtures';

const validationError = (errors: Array<{ field: string | null; message: string }>) =>
  new ApiError({ type: '/problems/validation-error', title: 'Validation failed', status: 400, errors });

describe('toInput / toFormValues', () => {
  it('maps empty optional fields to null and back to empty strings', () => {
    expect(toInput({ title: 'x', description: '', dueDate: '' })).toEqual({
      title: 'x',
      description: null,
      dueDate: null,
    });
    expect(toInput({ title: 'x', description: 'd', dueDate: '2026-10-01' })).toEqual({
      title: 'x',
      description: 'd',
      dueDate: '2026-10-01',
    });
    expect(toFormValues(makeView({ title: 't', description: null, dueDate: null }))).toEqual({
      title: 't',
      description: '',
      dueDate: '',
    });
    expect(toFormValues(makeView({ title: 't', description: 'd', dueDate: '2026-10-01' }))).toEqual({
      title: 't',
      description: 'd',
      dueDate: '2026-10-01',
    });
  });
});

describe('TodoForm', () => {
  it('validates on the client with the shared schema before submitting', async () => {
    const onSubmit = vi.fn();
    render(<TodoForm submitLabel="Add task" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(onSubmit).not.toHaveBeenCalled();
    const title = screen.getByLabelText('Title');
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('Title is required');
  });

  it('submits normalised input and shows a pending label', async () => {
    let finish: () => void = () => undefined;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<TodoForm submitLabel="Add task" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Buy milk');
    await userEvent.type(screen.getByLabelText('Description'), 'Oat');
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Buy milk', description: 'Oat', dueDate: '2026-10-01' });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    finish();
    expect(await screen.findByRole('button', { name: 'Add task' })).toBeEnabled();
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'false');
  });

  it('maps server field errors onto fields (first message wins) and body errors to a banner', async () => {
    const onSubmit = vi.fn(async () => {
      throw validationError([
        { field: 'title', message: 'Title is taken' },
        { field: 'title', message: 'Second message' },
        { field: null, message: 'Body problem' },
        { field: null, message: 'Another body problem' },
      ]);
    });
    render(<TodoForm submitLabel="Save" onSubmit={onSubmit} initialValues={{ title: 'x', description: '', dueDate: '' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByLabelText('Title')).toHaveAccessibleDescription('Title is taken');
    expect(screen.getByRole('alert')).toHaveTextContent('Body problem');
  });

  it('shows a general error for non-validation failures and clears it on resubmit', async () => {
    const onSubmit = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(undefined);
    render(<TodoForm submitLabel="Save" onSubmit={onSubmit} initialValues={{ title: 'x', description: '', dueDate: '' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an API error without field errors as a general error', async () => {
    const onSubmit = vi.fn(async () => {
      throw new ApiError({ type: 'x', title: 'Conflict', status: 409, detail: 'Try again' });
    });
    render(<TodoForm submitLabel="Save" onSubmit={onSubmit} initialValues={{ title: 'x', description: '', dueDate: '' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again');
  });

  it('renders a cancel button only when cancellable', async () => {
    const onCancel = vi.fn();
    const { rerender } = render(<TodoForm submitLabel="Save" onSubmit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    rerender(<TodoForm submitLabel="Save" onSubmit={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dev npx vitest run apps/web/tests/todos`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`apps/web/src/todos/useTodos.ts`:
```ts
import type { CreateTodoInput, ListTodosQuery, UpdateTodoInput } from '@foci/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTodoClient } from '../api/TodoClientContext';

export const todoKeys = {
  all: ['todos'] as const,
  list: (query: ListTodosQuery) => ['todos', 'list', query] as const,
  detail: (id: string) => ['todos', 'detail', id] as const,
};

export function useTodoList(query: ListTodosQuery) {
  const client = useTodoClient();
  return useQuery({ queryKey: todoKeys.list(query), queryFn: () => client.list(query) });
}

export function useTodo(id: string) {
  const client = useTodoClient();
  return useQuery({ queryKey: todoKeys.detail(id), queryFn: () => client.get(id) });
}

/** Every mutation refreshes all todo queries once it settles (success or failure). */
function useInvalidateTodos() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: todoKeys.all });
}

export function useCreateTodo() {
  const client = useTodoClient();
  const onSettled = useInvalidateTodos();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateTodoInput; idempotencyKey: string }) =>
      client.create(input, idempotencyKey),
    onSettled,
  });
}

export function useUpdateTodo() {
  const client = useTodoClient();
  const onSettled = useInvalidateTodos();
  return useMutation({
    mutationFn: ({ id, version, patch }: { id: string; version: number; patch: UpdateTodoInput }) =>
      client.update(id, version, patch),
    onSettled,
  });
}

export function useSetCompleted() {
  const client = useTodoClient();
  const onSettled = useInvalidateTodos();
  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      completed ? client.complete(id) : client.uncomplete(id),
    onSettled,
  });
}

export function useDeleteTodo() {
  const client = useTodoClient();
  const onSettled = useInvalidateTodos();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => client.remove(id, version),
    onSettled,
  });
}
```

`apps/web/src/todos/format.ts`:
```ts
/** Creation timestamps are instants: show them in the viewer's locale and timezone. */
export function formatTimestamp(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}
```

`apps/web/src/todos/components/ErrorBanner.module.css`:
```css
.banner {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius);
  color: var(--color-danger);
  background: var(--color-danger-bg);
}
```

`apps/web/src/todos/components/ErrorBanner.tsx`:
```tsx
import styles from './ErrorBanner.module.css';

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className={styles.banner}>
      <span>{message}</span>
      {onRetry !== undefined && (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
```

`apps/web/src/todos/components/TodoForm.module.css`:
```css
.form {
  display: grid;
  gap: var(--space-3);
}

.field {
  display: grid;
  gap: var(--space-1);
}

.error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.875rem;
}

.buttons {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
```

`apps/web/src/todos/components/TodoForm.tsx`:
```tsx
import {
  CreateTodoSchema,
  toFieldErrors,
  type CreateTodoInput,
  type FieldError,
  type TodoView,
} from '@foci/shared';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../../api/ApiError';
import { describeError } from '../../api/describeError';
import { ErrorBanner } from './ErrorBanner';
import styles from './TodoForm.module.css';

export interface TodoFormValues {
  title: string;
  description: string;
  dueDate: string;
}

export const EMPTY_FORM: TodoFormValues = { title: '', description: '', dueDate: '' };

export function toInput(values: TodoFormValues): CreateTodoInput {
  return {
    title: values.title,
    description: values.description === '' ? null : values.description,
    dueDate: values.dueDate === '' ? null : values.dueDate,
  };
}

export function toFormValues(todo: TodoView): TodoFormValues {
  return { title: todo.title, description: todo.description ?? '', dueDate: todo.dueDate ?? '' };
}

interface SplitErrors {
  fields: Record<string, string>;
  general: string | null;
}

/** First message per field; body-level errors (field null) become one general message. */
function splitErrors(errors: FieldError[]): SplitErrors {
  const fields: Record<string, string> = {};
  let general: string | null = null;
  for (const error of errors) {
    if (error.field === null) general ??= error.message;
    else fields[error.field] ??= error.message;
  }
  return { fields, general };
}

interface FieldProps {
  id: string;
  label: string;
  error: string | undefined;
  children: ReactNode;
}

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error !== undefined && (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

interface TodoFormProps {
  initialValues?: TodoFormValues;
  submitLabel: string;
  onSubmit: (input: CreateTodoInput) => Promise<void>;
  onCancel?: () => void;
}

export function TodoForm({ initialValues = EMPTY_FORM, submitLabel, onSubmit, onCancel }: TodoFormProps) {
  const id = useId();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<SplitErrors>({ fields: {}, general: null });
  const [submitting, setSubmitting] = useState(false);

  const fieldProps = (name: keyof TodoFormValues) => {
    const error = errors.fields[name];
    return {
      id: `${id}-${name}`,
      value: values[name],
      'aria-invalid': error !== undefined,
      'aria-describedby': error === undefined ? undefined : `${id}-${name}-error`,
      onChange: (event: { target: { value: string } }) =>
        setValues((current) => ({ ...current, [name]: event.target.value })),
    };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = toInput(values);
    const parsed = CreateTodoSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(splitErrors(toFieldErrors(parsed.error)));
      return;
    }
    setErrors({ fields: {}, general: null });
    setSubmitting(true);
    try {
      await onSubmit(input);
    } catch (error) {
      setErrors(
        error instanceof ApiError && error.errors.length > 0
          ? splitErrors(error.errors)
          : { fields: {}, general: describeError(error) },
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {errors.general !== null && <ErrorBanner message={errors.general} />}
      <Field id={`${id}-title`} label="Title" error={errors.fields.title}>
        <input type="text" autoComplete="off" {...fieldProps('title')} />
      </Field>
      <Field id={`${id}-description`} label="Description" error={errors.fields.description}>
        <textarea rows={3} {...fieldProps('description')} />
      </Field>
      <Field id={`${id}-dueDate`} label="Due date" error={errors.fields.dueDate}>
        <input type="date" {...fieldProps('dueDate')} />
      </Field>
      <div className={styles.buttons}>
        {onCancel !== undefined && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dev npx vitest run apps/web/tests/todos`
Expected: PASS. (`useTodos.ts` is exercised through the component tests in Tasks 3–4; the gate is run at the end of Task 3.)

- [ ] **Step 5: Format and commit (gate runs after Task 3, which covers the hooks)**

Run: `dev npx prettier --write apps/web` and `dev npm run lint`.
```bash
git add apps/web
git commit -F - <<'EOF'
feat(web): add todo query hooks, the todo form and error banner

The form validates with the shared schema before submitting and maps
server field errors back onto fields; every mutation refreshes the
todo queries when it settles.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

If the curation step later requires every commit to pass the full gate, squash this commit into Task 3's commit with `--fixup` (it is the hooks' coverage that lands in Task 3).

---

### Task 3: List, filters and items

**Files:**
- Create: `apps/web/src/todos/components/TodoFilters.tsx`, `TodoList.tsx`, `TodoList.module.css`, `TodoItem.tsx`, `TodoItem.module.css` (under `apps/web/src/todos/components/`)
- Test: `apps/web/tests/todos/components/TodoFilters.test.tsx`, `TodoList.test.tsx`, `TodoItem.test.tsx`

**Interfaces:**
- Consumes: hooks (Task 2), `ErrorBanner`, `describeError`.
- Produces: `TodoFilters({ query, onChange })`, `TodoList({ query, onOpen: (id: string) => void })`, `TodoItem({ todo, onOpen })`.

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/todos/components/TodoFilters.test.tsx`:
```tsx
import { DEFAULT_LIST_QUERY } from '@foci/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TodoFilters } from '../../../src/todos/components/TodoFilters';

describe('TodoFilters', () => {
  it('reports each control change as a new query', async () => {
    const onChange = vi.fn();
    render(<TodoFilters query={DEFAULT_LIST_QUERY} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'Overdue');
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, status: 'overdue' });
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'Due date');
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, sort: 'dueDate' });
    await userEvent.selectOptions(screen.getByLabelText('Order'), 'Ascending');
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, order: 'asc' });
  });

  it('reflects the current query', () => {
    render(
      <TodoFilters query={{ status: 'completed', sort: 'title', order: 'asc' }} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Show')).toHaveValue('completed');
    expect(screen.getByLabelText('Sort by')).toHaveValue('title');
    expect(screen.getByLabelText('Order')).toHaveValue('asc');
  });
});
```

`apps/web/tests/todos/components/TodoList.test.tsx`:
```tsx
import { DEFAULT_LIST_QUERY } from '@foci/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TodoList } from '../../../src/todos/components/TodoList';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

describe('TodoList', () => {
  it('shows a loading state, then the todos', async () => {
    const todos = [makeView({ title: 'First' }), makeView({ title: 'Second' })];
    const client = fakeClient({ list: vi.fn(async () => todos) });
    renderWithProviders(<TodoList query={DEFAULT_LIST_QUERY} onOpen={vi.fn()} />, client);
    expect(screen.getByRole('status')).toHaveTextContent('Loading tasks…');
    const list = await screen.findByRole('list', { name: 'Tasks' });
    expect(list).toHaveTextContent('First');
    expect(list).toHaveTextContent('Second');
    expect(client.list).toHaveBeenCalledWith(DEFAULT_LIST_QUERY);
  });

  it('distinguishes an empty list from an empty filter', async () => {
    const client = fakeClient({ list: vi.fn(async () => []) });
    const { unmount } = renderWithProviders(
      <TodoList query={DEFAULT_LIST_QUERY} onOpen={vi.fn()} />,
      client,
    );
    expect(await screen.findByText('No tasks yet. Add your first one.')).toBeInTheDocument();
    unmount();
    renderWithProviders(
      <TodoList query={{ ...DEFAULT_LIST_QUERY, status: 'overdue' }} onOpen={vi.fn()} />,
      client,
    );
    expect(await screen.findByText('No tasks match this filter.')).toBeInTheDocument();
  });

  it('shows an error with a working retry', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce([makeView({ title: 'Recovered' })]);
    renderWithProviders(<TodoList query={DEFAULT_LIST_QUERY} onOpen={vi.fn()} />, fakeClient({ list }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Recovered')).toBeInTheDocument();
  });
});
```

`apps/web/tests/todos/components/TodoItem.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/api/ApiError';
import { TodoItem } from '../../../src/todos/components/TodoItem';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

describe('TodoItem', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders title, due date and overdue badge', () => {
    const todo = makeView({ title: 'File taxes', dueDate: '2026-09-01', isOverdue: true });
    renderWithProviders(<TodoItem todo={todo} onOpen={vi.fn()} />, fakeClient());
    expect(screen.getByRole('button', { name: 'File taxes' })).toBeInTheDocument();
    expect(screen.getByText('Due 2026-09-01')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('renders the due date exactly as stored, even west of UTC', () => {
    vi.stubEnv('TZ', 'Pacific/Honolulu');
    renderWithProviders(
      <TodoItem todo={makeView({ dueDate: '2026-10-01' })} onOpen={vi.fn()} />,
      fakeClient(),
    );
    expect(screen.getByText('Due 2026-10-01')).toBeInTheDocument();
  });

  it('omits due date and badge when not applicable', () => {
    renderWithProviders(<TodoItem todo={makeView()} onOpen={vi.fn()} />, fakeClient());
    expect(screen.queryByText(/^Due /)).not.toBeInTheDocument();
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });

  it('opens the todo', async () => {
    const onOpen = vi.fn();
    const todo = makeView({ title: 'Open me' });
    renderWithProviders(<TodoItem todo={todo} onOpen={onOpen} />, fakeClient());
    await userEvent.click(screen.getByRole('button', { name: 'Open me' }));
    expect(onOpen).toHaveBeenCalledWith(todo.id);
  });

  it('completes an incomplete todo, disabling the checkbox while pending', async () => {
    let resolve: (value: ReturnType<typeof makeView>) => void = () => undefined;
    const complete = vi.fn(() => new Promise<ReturnType<typeof makeView>>((r) => (resolve = r)));
    const todo = makeView({ title: 'Buy milk' });
    renderWithProviders(<TodoItem todo={todo} onOpen={vi.fn()} />, fakeClient({ complete, list: vi.fn(async () => []) }));
    const checkbox = screen.getByRole('checkbox', { name: 'Mark "Buy milk" complete' });
    await userEvent.click(checkbox);
    expect(complete).toHaveBeenCalledWith(todo.id);
    expect(checkbox).toBeDisabled();
    resolve(makeView({ ...todo, isCompleted: true, version: 2 }));
    await vi.waitFor(() => expect(checkbox).toBeEnabled());
  });

  it('reopens a completed todo', async () => {
    const uncomplete = vi.fn(async () => makeView());
    const todo = makeView({ title: 'Done', isCompleted: true });
    renderWithProviders(<TodoItem todo={todo} onOpen={vi.fn()} />, fakeClient({ uncomplete }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark "Done" incomplete' }));
    expect(uncomplete).toHaveBeenCalledWith(todo.id);
  });

  it('shows a failed toggle', async () => {
    const complete = vi.fn(async () => {
      throw new ApiError({ type: '/problems/not-found', title: 'Not found', status: 404, detail: 'Todo was not found' });
    });
    renderWithProviders(<TodoItem todo={makeView({ title: 'Gone' })} onOpen={vi.fn()} />, fakeClient({ complete }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark "Gone" complete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Todo was not found');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dev npx vitest run apps/web/tests/todos/components`
Expected: FAIL — `TodoFilters`, `TodoList`, `TodoItem` not found.

- [ ] **Step 3: Implement**

`apps/web/src/todos/components/TodoFilters.tsx`:
```tsx
import {
  SORT_ORDERS,
  TODO_SORT_FIELDS,
  TODO_STATUSES,
  type ListTodosQuery,
  type SortOrder,
  type TodoSortField,
  type TodoStatus,
} from '@foci/shared';
import styles from './TodoList.module.css';

const STATUS_LABELS: Record<TodoStatus, string> = {
  all: 'All',
  completed: 'Completed',
  incomplete: 'Incomplete',
  overdue: 'Overdue',
};
const SORT_LABELS: Record<TodoSortField, string> = {
  createdAt: 'Created',
  dueDate: 'Due date',
  title: 'Title',
};
const ORDER_LABELS: Record<SortOrder, string> = { desc: 'Descending', asc: 'Ascending' };

interface TodoFiltersProps {
  query: ListTodosQuery;
  onChange: (query: ListTodosQuery) => void;
}

export function TodoFilters({ query, onChange }: TodoFiltersProps) {
  return (
    <div role="group" aria-label="Filter and sort" className={styles.filters}>
      <label>
        Show
        <select
          value={query.status}
          onChange={(event) => onChange({ ...query, status: event.target.value as TodoStatus })}
        >
          {TODO_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sort by
        <select
          value={query.sort}
          onChange={(event) => onChange({ ...query, sort: event.target.value as TodoSortField })}
        >
          {TODO_SORT_FIELDS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Order
        <select
          value={query.order}
          onChange={(event) => onChange({ ...query, order: event.target.value as SortOrder })}
        >
          {SORT_ORDERS.map((order) => (
            <option key={order} value={order}>
              {ORDER_LABELS[order]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
```

`apps/web/src/todos/components/TodoList.module.css`:
```css
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-block: var(--space-3);
}

.filters label {
  display: flex;
  gap: var(--space-1);
  align-items: center;
}

.list {
  display: grid;
  gap: var(--space-1);
  padding: 0;
  list-style: none;
}

.empty {
  color: var(--color-muted);
}
```

`apps/web/src/todos/components/TodoList.tsx`:
```tsx
import type { ListTodosQuery } from '@foci/shared';
import { describeError } from '../../api/describeError';
import { useTodoList } from '../useTodos';
import { ErrorBanner } from './ErrorBanner';
import { TodoItem } from './TodoItem';
import styles from './TodoList.module.css';

interface TodoListProps {
  query: ListTodosQuery;
  onOpen: (id: string) => void;
}

export function TodoList({ query, onOpen }: TodoListProps) {
  const { data, isPending, isError, error, refetch } = useTodoList(query);

  if (isPending) return <p role="status">Loading tasks…</p>;
  if (isError) return <ErrorBanner message={describeError(error)} onRetry={() => void refetch()} />;
  if (data.length === 0) {
    return (
      <p className={styles.empty}>
        {query.status === 'all' ? 'No tasks yet. Add your first one.' : 'No tasks match this filter.'}
      </p>
    );
  }
  return (
    <ul className={styles.list} aria-label="Tasks">
      {data.map((todo) => (
        <TodoItem key={todo.id} todo={todo} onOpen={onOpen} />
      ))}
    </ul>
  );
}
```

`apps/web/src/todos/components/TodoItem.module.css`:
```css
.item {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}

.done .title {
  color: var(--color-muted);
  text-decoration: line-through;
}

.title {
  flex: 1;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}

.overdue {
  padding: 0 var(--space-1);
  border-radius: var(--radius);
  color: var(--color-danger);
  background: var(--color-danger-bg);
  font-size: 0.75rem;
  text-transform: uppercase;
}

.due {
  color: var(--color-muted);
  font-size: 0.875rem;
}

.error {
  color: var(--color-danger);
  font-size: 0.875rem;
}
```

`apps/web/src/todos/components/TodoItem.tsx`:
```tsx
import type { TodoView } from '@foci/shared';
import { describeError } from '../../api/describeError';
import { useSetCompleted } from '../useTodos';
import styles from './TodoItem.module.css';

interface TodoItemProps {
  todo: TodoView;
  onOpen: (id: string) => void;
}

export function TodoItem({ todo, onOpen }: TodoItemProps) {
  const setCompleted = useSetCompleted();
  const nextState = todo.isCompleted ? 'incomplete' : 'complete';

  return (
    <li className={todo.isCompleted ? `${styles.item} ${styles.done}` : styles.item}>
      <input
        type="checkbox"
        checked={todo.isCompleted}
        disabled={setCompleted.isPending}
        aria-label={`Mark "${todo.title}" ${nextState}`}
        onChange={() => setCompleted.mutate({ id: todo.id, completed: !todo.isCompleted })}
      />
      <button type="button" className={styles.title} onClick={() => onOpen(todo.id)}>
        {todo.title}
      </button>
      {todo.isOverdue && <span className={styles.overdue}>Overdue</span>}
      {/* dueDate is a calendar date: render the stored string, never via Date (no timezone shift). */}
      {todo.dueDate !== null && <span className={styles.due}>Due {todo.dueDate}</span>}
      {setCompleted.isError && (
        <span role="alert" className={styles.error}>
          {describeError(setCompleted.error)}
        </span>
      )}
    </li>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dev npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Format, gate, commit**

Run: `dev npx prettier --write apps/web` then `docker compose --profile test run --rm --build test` (100%; if `useTodos.ts` still has uncovered mutation hooks, they are covered in Task 4 — in that case run the gate after Task 4 and fold this commit into Task 4's with `--fixup`).
```bash
git add apps/web
git commit -F - <<'EOF'
feat(web): add the todo list with filters and completion toggles

Loading, error-with-retry and empty states; overdue badges from the
server's isOverdue; due dates rendered as stored strings so they never
shift across timezones.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Dialog, create panel and details panel

**Files:**
- Create: `apps/web/src/todos/components/TodoDialog.tsx`, `TodoDialog.module.css`, `CreateTodoPanel.tsx`, `TodoDetailsPanel.tsx`, `TodoDetailsPanel.module.css` (under `apps/web/src/todos/components/`)
- Test: `apps/web/tests/todos/components/TodoDialog.test.tsx`, `CreateTodoPanel.test.tsx`, `TodoDetailsPanel.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `type DialogState = { mode: 'closed' } | { mode: 'create' } | { mode: 'view'; id: string } | { mode: 'edit'; id: string }`
  - `TodoDialog({ state, onChange: (state: DialogState) => void })` — renders nothing when closed
  - `CreateTodoPanel({ onDone: () => void, newKey?: () => string })`
  - `TodoDetailsPanel({ id, editing, onEditingChange: (editing: boolean) => void, onClose: () => void })`

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/todos/components/CreateTodoPanel.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreateTodoPanel } from '../../../src/todos/components/CreateTodoPanel';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

describe('CreateTodoPanel', () => {
  it('creates the todo with an idempotency key and finishes', async () => {
    const create = vi.fn(async () => makeView());
    const onDone = vi.fn();
    renderWithProviders(<CreateTodoPanel onDone={onDone} newKey={() => 'key-1'} />, fakeClient({ create }));
    await userEvent.type(screen.getByLabelText('Title'), 'Buy milk');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledWith({ title: 'Buy milk', description: null, dueDate: null }, 'key-1');
  });

  it('reuses the key when retrying the same submission and renews it when the input changes', async () => {
    const keys = ['key-1', 'key-2'];
    const create = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(makeView());
    renderWithProviders(
      <CreateTodoPanel onDone={vi.fn()} newKey={() => keys.shift() as string} />,
      fakeClient({ create }),
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Retry me');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(3));
    expect(create.mock.calls.map((call) => call[1])).toEqual(['key-1', 'key-1', 'key-2']);
  });

  it('generates real keys by default', async () => {
    const create = vi.fn(async () => makeView());
    renderWithProviders(<CreateTodoPanel onDone={vi.fn()} />, fakeClient({ create }));
    await userEvent.type(screen.getByLabelText('Title'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0]?.[1]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
```

`apps/web/tests/todos/components/TodoDetailsPanel.test.tsx`:
```tsx
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/api/ApiError';
import { TodoDetailsPanel } from '../../../src/todos/components/TodoDetailsPanel';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

const problem = (status: number, detail = 'Problem') =>
  new ApiError({ type: '/problems/x', title: 'x', status, detail });

function setup(clientOverrides: Parameters<typeof fakeClient>[0], editing = false) {
  const props = { onEditingChange: vi.fn(), onClose: vi.fn() };
  const client = fakeClient(clientOverrides);
  const result = renderWithProviders(
    <TodoDetailsPanel id="todo-1" editing={editing} {...props} />,
    client,
  );
  return { ...props, client, ...result };
}

describe('TodoDetailsPanel — viewing', () => {
  it('shows loading, then every field', async () => {
    const todo = makeView({
      title: 'File taxes',
      description: 'Blue folder',
      dueDate: '2026-09-01',
      isOverdue: true,
      isCompleted: false,
    });
    setup({ get: vi.fn(async () => todo) });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(await screen.findByText('File taxes')).toBeInTheDocument();
    expect(screen.getByText('Blue folder')).toBeInTheDocument();
    expect(screen.getByText(/2026-09-01/)).toHaveTextContent('Overdue');
    expect(screen.getByText('Not completed')).toBeInTheDocument();
  });

  it('shows placeholders for empty optional fields and completed status', async () => {
    setup({ get: vi.fn(async () => makeView({ isCompleted: true })) });
    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('explains a todo that no longer exists', async () => {
    setup({ get: vi.fn(async () => Promise.reject(problem(404))) });
    expect(await screen.findByRole('alert')).toHaveTextContent('This task no longer exists.');
  });

  it('shows other load errors', async () => {
    setup({ get: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });

  it('switches to edit mode', async () => {
    const { onEditingChange } = setup({ get: vi.fn(async () => makeView()) });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(onEditingChange).toHaveBeenCalledWith(true);
  });
});

describe('TodoDetailsPanel — editing', () => {
  it('saves with the current version and leaves edit mode', async () => {
    const todo = makeView({ title: 'Old', version: 3 });
    const update = vi.fn(async () => makeView({ ...todo, title: 'New', version: 4 }));
    const { onEditingChange } = setup({ get: vi.fn(async () => todo), update }, true);
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onEditingChange).toHaveBeenCalledWith(false));
    expect(update).toHaveBeenCalledWith(todo.id, 3, { title: 'New', description: null, dueDate: null });
  });

  it('on 412 shows a conflict notice, reloads, keeps the edits and saves against the new version', async () => {
    const stale = makeView({ title: 'Old', version: 1 });
    const fresh = makeView({ ...stale, title: 'Changed elsewhere', version: 2 });
    const get = vi.fn().mockResolvedValueOnce(stale).mockResolvedValue(fresh);
    const update = vi
      .fn()
      .mockRejectedValueOnce(problem(412))
      .mockResolvedValueOnce(makeView({ ...fresh, title: 'Mine', version: 3 }));
    const { onEditingChange } = setup({ get, update }, true);
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Mine');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere');
    expect(screen.getByLabelText('Title')).toHaveValue('Mine');
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onEditingChange).toHaveBeenCalledWith(false));
    expect(update.mock.calls.map((call) => call[1])).toEqual([1, 2]);
  });

  it('lets the form show other save errors', async () => {
    const update = vi.fn(async () => Promise.reject(problem(500, 'Server exploded')));
    setup({ get: vi.fn(async () => makeView()), update }, true);
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded');
  });

  it('cancels editing', async () => {
    const { onEditingChange } = setup({ get: vi.fn(async () => makeView()) }, true);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });
});

describe('TodoDetailsPanel — deleting', () => {
  it('asks for confirmation and can be cancelled', async () => {
    const remove = vi.fn();
    setup({ get: vi.fn(async () => makeView()), remove });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('group', { name: 'Confirm delete' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes with the current version and closes', async () => {
    const todo = makeView({ version: 5 });
    const remove = vi.fn(async () => undefined);
    const { onClose } = setup({ get: vi.fn(async () => todo), remove });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(remove).toHaveBeenCalledWith(todo.id, 5);
  });

  it('reloads after a 404 so the panel explains the task is gone', async () => {
    const get = vi.fn().mockResolvedValueOnce(makeView()).mockRejectedValue(problem(404));
    const remove = vi.fn(async () => Promise.reject(problem(404)));
    setup({ get, remove });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('This task no longer exists.')).toBeInTheDocument();
  });

  it('shows a conflict notice after a 412 and reloads', async () => {
    const get = vi.fn().mockResolvedValue(makeView());
    const remove = vi.fn(async () => Promise.reject(problem(412)));
    setup({ get, remove });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check it before deleting');
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('shows other delete errors', async () => {
    const remove = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
    setup({ get: vi.fn(async () => makeView()), remove });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });
});
```

`apps/web/tests/todos/components/TodoDialog.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TodoDialog, type DialogState } from '../../../src/todos/components/TodoDialog';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

function Harness({ next }: { next: DialogState }) {
  const [state, setState] = useState<DialogState>({ mode: 'closed' });
  return (
    <>
      <button type="button" onClick={() => setState(next)}>
        Open
      </button>
      <TodoDialog state={state} onChange={setState} />
    </>
  );
}

describe('TodoDialog', () => {
  it('renders nothing while closed', () => {
    renderWithProviders(<TodoDialog state={{ mode: 'closed' }} onChange={vi.fn()} />, fakeClient());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens as a labelled modal, closes on Escape and returns focus', async () => {
    renderWithProviders(<Harness next={{ mode: 'create' }} />, fakeClient());
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes with the close button', async () => {
    renderWithProviders(<Harness next={{ mode: 'create' }} />, fakeClient());
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves between view and edit modes', async () => {
    const todo = makeView({ title: 'Switch me' });
    renderWithProviders(<Harness next={{ mode: 'view', id: todo.id }} />, fakeClient({ get: vi.fn(async () => todo) }));
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'Task details' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Task details' })).toBeInTheDocument();
  });

  it('closes after creating', async () => {
    const create = vi.fn(async () => makeView());
    renderWithProviders(<Harness next={{ mode: 'create' }} />, fakeClient({ create, list: vi.fn(async () => []) }));
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.type(screen.getByLabelText('Title'), 'New one');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dev npx vitest run apps/web/tests/todos/components`
Expected: FAIL — `TodoDialog`, `CreateTodoPanel`, `TodoDetailsPanel` not found.

- [ ] **Step 3: Implement**

`apps/web/src/todos/components/CreateTodoPanel.tsx`:
```tsx
import type { CreateTodoInput } from '@foci/shared';
import { useRef } from 'react';
import { newIdempotencyKey } from '../../api/idempotencyKey';
import { useCreateTodo } from '../useTodos';
import { TodoForm } from './TodoForm';

interface CreateTodoPanelProps {
  onDone: () => void;
  newKey?: () => string;
}

export function CreateTodoPanel({ onDone, newKey = newIdempotencyKey }: CreateTodoPanelProps) {
  const create = useCreateTodo();
  const lastAttempt = useRef<{ payload: string; key: string } | null>(null);

  /** Same payload → same key, so a retry or double submit can never create a duplicate. */
  const keyFor = (input: CreateTodoInput): string => {
    const payload = JSON.stringify(input);
    const previous = lastAttempt.current;
    if (previous !== null && previous.payload === payload) return previous.key;
    const attempt = { payload, key: newKey() };
    lastAttempt.current = attempt;
    return attempt.key;
  };

  return (
    <TodoForm
      submitLabel="Add task"
      onSubmit={async (input) => {
        await create.mutateAsync({ input, idempotencyKey: keyFor(input) });
        onDone();
      }}
    />
  );
}
```

`apps/web/src/todos/components/TodoDetailsPanel.module.css`:
```css
.details {
  display: grid;
  gap: var(--space-3);
}

.fields {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-1) var(--space-3);
  margin: 0;
}

.fields dt {
  color: var(--color-muted);
}

.fields dd {
  margin: 0;
}

.overdue {
  color: var(--color-danger);
}

.buttons {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
```

`apps/web/src/todos/components/TodoDetailsPanel.tsx`:
```tsx
import type { CreateTodoInput } from '@foci/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../api/ApiError';
import { describeError } from '../../api/describeError';
import { formatTimestamp } from '../format';
import { todoKeys, useDeleteTodo, useTodo, useUpdateTodo } from '../useTodos';
import { ErrorBanner } from './ErrorBanner';
import styles from './TodoDetailsPanel.module.css';
import { TodoForm, toFormValues } from './TodoForm';

const isStatus = (error: unknown, status: number) =>
  error instanceof ApiError && error.status === status;

interface TodoDetailsPanelProps {
  id: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onClose: () => void;
}

export function TodoDetailsPanel({ id, editing, onEditingChange, onClose }: TodoDetailsPanelProps) {
  const todo = useTodo(id);
  const update = useUpdateTodo();
  const remove = useDeleteTodo();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (todo.isPending) return <p role="status">Loading…</p>;
  if (todo.isError) {
    return (
      <ErrorBanner
        message={isStatus(todo.error, 404) ? 'This task no longer exists.' : describeError(todo.error)}
      />
    );
  }

  const current = todo.data;
  const reload = () => queryClient.invalidateQueries({ queryKey: todoKeys.all });

  const save = async (input: CreateTodoInput) => {
    try {
      await update.mutateAsync({ id, version: current.version, patch: input });
      setNotice(null);
      onEditingChange(false);
    } catch (error) {
      if (!isStatus(error, 412)) throw error;
      setNotice('This task was changed elsewhere and has been reloaded. Your edits are kept — review and save again.');
      await reload();
    }
  };

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync({ id, version: current.version });
      onClose();
    } catch (error) {
      setConfirmingDelete(false);
      if (isStatus(error, 404)) {
        await reload();
      } else if (isStatus(error, 412)) {
        setNotice('This task was changed elsewhere and has been reloaded. Check it before deleting.');
        await reload();
      } else {
        setNotice(describeError(error));
      }
    }
  };

  return (
    <div className={styles.details}>
      {notice !== null && <ErrorBanner message={notice} />}
      {editing ? (
        <TodoForm
          initialValues={toFormValues(current)}
          submitLabel="Save"
          onSubmit={save}
          onCancel={() => {
            setNotice(null);
            onEditingChange(false);
          }}
        />
      ) : (
        <>
          <dl className={styles.fields}>
            <dt>Title</dt>
            <dd>{current.title}</dd>
            <dt>Description</dt>
            <dd>{current.description ?? '—'}</dd>
            <dt>Due date</dt>
            <dd>
              {current.dueDate ?? '—'}
              {current.isOverdue && <span className={styles.overdue}> Overdue</span>}
            </dd>
            <dt>Status</dt>
            <dd>{current.isCompleted ? 'Completed' : 'Not completed'}</dd>
            <dt>Created</dt>
            <dd>{formatTimestamp(current.createdAt)}</dd>
          </dl>
          {confirmingDelete ? (
            <div role="group" aria-label="Confirm delete" className={styles.buttons}>
              <span>Delete this task?</span>
              <button type="button" disabled={remove.isPending} onClick={() => void confirmDelete()}>
                Yes, delete
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.buttons}>
              <button type="button" onClick={() => onEditingChange(true)}>
                Edit
              </button>
              <button type="button" onClick={() => setConfirmingDelete(true)}>
                Delete
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

`apps/web/src/todos/components/TodoDialog.module.css`:
```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 40%);
}

.content {
  position: fixed;
  top: 50%;
  left: 50%;
  width: min(32rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: var(--space-4);
  border-radius: var(--radius);
  background: var(--color-surface);
  transform: translate(-50%, -50%);
}

.close {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  border: 0;
  background: none;
  font-size: 1.25rem;
  cursor: pointer;
}
```

`apps/web/src/todos/components/TodoDialog.tsx`:
```tsx
import * as Dialog from '@radix-ui/react-dialog';
import { CreateTodoPanel } from './CreateTodoPanel';
import { TodoDetailsPanel } from './TodoDetailsPanel';
import styles from './TodoDialog.module.css';

export type DialogState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'view'; id: string }
  | { mode: 'edit'; id: string };

const TITLES = { create: 'New task', view: 'Task details', edit: 'Edit task' } as const;

interface TodoDialogProps {
  state: DialogState;
  onChange: (state: DialogState) => void;
}

/**
 * Radix handles focus trapping, Escape, focus return and aria-modal. The panels inside know
 * nothing about the dialog, so replacing it with an inline panel would not touch them.
 */
export function TodoDialog({ state, onChange }: TodoDialogProps) {
  if (state.mode === 'closed') return null;
  const close = () => onChange({ mode: 'closed' });

  return (
    <Dialog.Root open onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-describedby={undefined}>
          <Dialog.Title>{TITLES[state.mode]}</Dialog.Title>
          {state.mode === 'create' ? (
            <CreateTodoPanel onDone={close} />
          ) : (
            <TodoDetailsPanel
              id={state.id}
              editing={state.mode === 'edit'}
              onEditingChange={(editing) =>
                onChange({ mode: editing ? 'edit' : 'view', id: state.id })
              }
              onClose={close}
            />
          )}
          <Dialog.Close className={styles.close} aria-label="Close">
            ×
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dev npx vitest run --project web`
Expected: PASS. If Radix logs a jsdom warning about `hasPointerCapture` or `scrollIntoView`, add the minimal stub to `apps/web/tests/setup.ts` (e.g. `Element.prototype.hasPointerCapture ??= () => false;`) with a comment naming the Radix component that needs it.

**Pivot check (spec decision):** if the dialog's accessibility tests (Escape, focus return) cannot be made to pass reliably, stop and report — the agreed fallback is replacing `TodoDialog` with an inline panel without touching the panels.

- [ ] **Step 5: Format, gate, commit**

Run: `dev npx prettier --write apps/web` then `docker compose --profile test run --rm --build test` (100%).
```bash
git add apps/web
git commit -F - <<'EOF'
feat(web): add the task dialog with create, view, edit and delete

Radix dialog for focus management; create reuses its idempotency key for
identical retries; edits and deletes send the current version, and a 412
shows a conflict notice, reloads and keeps the user's edits.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Page, app shell, styles and the web image

**Files:**
- Create: `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/todos/components/TodoPage.tsx`, `apps/web/src/todos/components/TodoPage.module.css`, `apps/web/src/styles/tokens.css`, `apps/web/src/styles/global.css`, `apps/web/nginx.conf`, `.env.example`
- Modify: `Dockerfile` (build-web, web), `compose.yaml` (web service)
- Test: `apps/web/tests/App.test.tsx`, `apps/web/tests/todos/components/TodoPage.test.tsx`

**Interfaces:**
- Produces: `App({ client: TodoClient, queryClient: QueryClient })`, `TodoPage()`; Docker target `web`; Compose service `web` on `${WEB_PORT:-8080}`.

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/todos/components/TodoPage.test.tsx`:
```tsx
import { DEFAULT_LIST_QUERY } from '@foci/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TodoPage } from '../../../src/todos/components/TodoPage';
import { fakeClient, makeView, renderWithProviders } from '../../support/fixtures';

describe('TodoPage', () => {
  it('lists todos, refetches when filters change and opens details', async () => {
    const todo = makeView({ title: 'Read me' });
    const list = vi.fn(async () => [todo]);
    const get = vi.fn(async () => todo);
    renderWithProviders(<TodoPage />, fakeClient({ list, get }));
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'Completed');
    await vi.waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({ ...DEFAULT_LIST_QUERY, status: 'completed' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Read me' }));
    expect(await screen.findByRole('dialog', { name: 'Task details' })).toBeInTheDocument();
  });

  it('creates a task and shows it after the list refreshes', async () => {
    const created = makeView({ title: 'Brand new' });
    const list = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([created]);
    const create = vi.fn(async () => created);
    renderWithProviders(<TodoPage />, fakeClient({ list, create }));
    await userEvent.click(screen.getByRole('button', { name: '+ New task' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Brand new');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(await screen.findByRole('button', { name: 'Brand new' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

`apps/web/tests/App.test.tsx`:
```tsx
import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { fakeClient } from './support/fixtures';

describe('App', () => {
  it('provides the client and query cache to the todo page', async () => {
    const client = fakeClient({ list: vi.fn(async () => []) });
    render(<App client={client} queryClient={new QueryClient()} />);
    expect(screen.getByRole('heading', { name: 'FociToDo' })).toBeInTheDocument();
    expect(await screen.findByText('No tasks yet. Add your first one.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dev npx vitest run apps/web/tests/App.test.tsx apps/web/tests/todos/components/TodoPage.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the page and the shell**

`apps/web/src/todos/components/TodoPage.module.css`:
```css
.page {
  max-width: 48rem;
  margin: 0 auto;
  padding: var(--space-4);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.header h1 {
  margin: 0;
  font-size: 1.5rem;
}
```

`apps/web/src/todos/components/TodoPage.tsx`:
```tsx
import { DEFAULT_LIST_QUERY, type ListTodosQuery } from '@foci/shared';
import { useState } from 'react';
import { TodoDialog, type DialogState } from './TodoDialog';
import { TodoFilters } from './TodoFilters';
import { TodoList } from './TodoList';
import styles from './TodoPage.module.css';

export function TodoPage() {
  const [query, setQuery] = useState<ListTodosQuery>(DEFAULT_LIST_QUERY);
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>FociToDo</h1>
        <button type="button" onClick={() => setDialog({ mode: 'create' })}>
          + New task
        </button>
      </header>
      <main>
        <TodoFilters query={query} onChange={setQuery} />
        <TodoList query={query} onOpen={(id) => setDialog({ mode: 'view', id })} />
      </main>
      <TodoDialog state={dialog} onChange={setDialog} />
    </div>
  );
}
```

`apps/web/src/App.tsx`:
```tsx
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { TodoClientProvider } from './api/TodoClientContext';
import type { TodoClient } from './api/todoClient';
import { TodoPage } from './todos/components/TodoPage';

interface AppProps {
  client: TodoClient;
  queryClient: QueryClient;
}

export function App({ client, queryClient }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <TodoClientProvider client={client}>
        <TodoPage />
      </TodoClientProvider>
    </QueryClientProvider>
  );
}
```

`apps/web/src/main.tsx` (mount only; excluded from coverage):
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createTodoClient } from './api/todoClient';
import { createQueryClient } from './queryClient';
import './styles/tokens.css';
import './styles/global.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App client={createTodoClient()} queryClient={createQueryClient()} />
  </StrictMode>,
);
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FociToDo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/src/styles/tokens.css`:
```css
:root {
  --color-text: #1f2328;
  --color-muted: #59636e;
  --color-border: #d1d9e0;
  --color-surface: #ffffff;
  --color-background: #f6f8fa;
  --color-danger: #b42318;
  --color-danger-bg: #fef3f2;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 1rem;
  --space-4: 1.5rem;
  --radius: 0.375rem;
}
```

`apps/web/src/styles/global.css`:
```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  color: var(--color-text);
  background: var(--color-background);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  line-height: 1.5;
}

button,
input,
select,
textarea {
  font: inherit;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dev npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Add nginx, the web image and the Compose service**

`apps/web/nginx.conf`:
```nginx
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  client_max_body_size 64k;

  # Same origin for the SPA and the API: no CORS. Path, If-Match, ETag and
  # Idempotency-Key headers pass through unchanged.
  location /api/ {
    proxy_pass http://api:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  # SPA fallback: any non-file path serves index.html.
  location / {
    try_files $uri /index.html;
    add_header Cache-Control "no-cache";
  }
}
```

In `Dockerfile`, add after the `build-api` stage:
```dockerfile
FROM source AS build-web
RUN npm run build -w @foci/web
```
and at the end of the file:
```dockerfile
# Static SPA behind unprivileged nginx (no Node in the final image).
FROM nginxinc/nginx-unprivileged:1.31-alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-web /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
```

In `compose.yaml`, add under `services:` after `api`:
```yaml
  web:
    build:
      context: .
      target: web
    ports:
      - '${WEB_PORT:-8080}:8080'
    depends_on:
      api:
        condition: service_healthy
    read_only: true
    tmpfs:
      - /tmp
    restart: unless-stopped
```

`.env.example`:
```dotenv
# Host port for the web app (http://localhost:8080 by default).
WEB_PORT=8080
```

- [ ] **Step 6: Verify the running app**

Run:
```bash
docker compose up --build -d
until curl -sf http://localhost:8080/api/health >/dev/null; do sleep 1; done
docker compose ps
curl -s http://localhost:8080/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/some/deep/link
curl -s -X POST http://localhost:8080/api/todos -H 'Content-Type: application/json' -d '{"title":"Through nginx"}' -D - | grep -iE '^(HTTP|etag|location)'
```
Expected: all four services healthy/exited-0; health JSON `"status":"ok"`; deep link `200` (SPA fallback); POST returns `HTTP/1.1 201`, `ETag: "1"`, `Location: /api/todos/<id>`. Open http://localhost:8080 and walk through create → complete → edit → filter → delete (or rely on PR 9's e2e). Then `docker compose down`.

- [ ] **Step 7: Format, gate, commit**

Run: `dev npx prettier --write apps/web .env.example` then `docker compose --profile test run --rm --build test` (100%).
```bash
git add apps/web Dockerfile compose.yaml .env.example
git commit -F - <<'EOF'
feat(web): add the todo page, app shell and nginx web image

Single page with filters, list and dialog; plain CSS tokens; nginx
serves the SPA with a deep-link fallback and proxies /api to the API on
the same origin. `docker compose up` now runs the full stack.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Then follow the per-PR procedure. PR title: `feat(web): todo web app`.
