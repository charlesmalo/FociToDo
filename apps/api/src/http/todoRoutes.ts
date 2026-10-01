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
    const key = parseOptionalHeader(
      IdempotencyKeySchema,
      req.get('Idempotency-Key'),
      'Idempotency-Key',
    );
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
