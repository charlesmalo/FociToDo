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
    [
      'a non-problem error body',
      errorResponse('<h1>502</h1>', 502, 'Bad Gateway', 'text/html'),
      'Bad Gateway',
    ],
    [
      'an unparsable problem body',
      errorResponse('{', 500, 'Server Error', 'application/problem+json'),
      'Server Error',
    ],
    [
      'a problem body of the wrong shape',
      errorResponse('{"nope":1}', 409, '', 'application/problem+json'),
      'Request failed',
    ],
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
