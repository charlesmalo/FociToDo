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
          (method) => `${method.toUpperCase()} /api${layer.route?.path.replace(/:(\w+)/g, '{$1}')}`,
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
