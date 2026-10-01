import { PROBLEM_TYPES, type Problem } from '@foci/shared';
import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
// pino-http augments Node's IncomingMessage with `log`; this type-only import
// brings that ambient augmentation into scope for `req.log` below, independent
// of whether some other file in the compilation also imports pino-http.
import type {} from 'pino-http';
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
