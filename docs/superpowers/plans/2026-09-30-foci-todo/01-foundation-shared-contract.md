# PR 1 — Foundation & Shared Contract

> Read `00-index.md` first (Global Constraints, developer loop, per-PR procedure). Branch: `feat/foundation-shared-contract`.

**Delivers:** npm-workspaces monorepo tooling (TypeScript, ESLint with layer rules, Prettier, Vitest with a 100% coverage gate), the Docker `test`/`dev` harness, the CI test job, AI-agent docs, and the complete `@foci/shared` contract package.

**Spec sections:** §2.2, §4.2–4.4, §5.5 (validation), §8.1–8.4 (harness parts), §9.2–9.3, §12.

---

### Task 1: Workspace tooling, Docker harness and `problem` module

**Files:**
- Create: `.gitignore`, `.gitattributes`, `.dockerignore`, `.nvmrc`, `.prettierrc.json`, `.prettierignore`
- Create: `package.json`, `tsconfig.base.json`, `eslint.config.js`, `vitest.config.ts`
- Create: `Dockerfile`, `compose.yaml`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/tsconfig.build.json`
- Create: `packages/shared/src/problem.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/tests/problem.test.ts`, `packages/shared/tests/index.test.ts`

**Interfaces:**
- Produces: `PROBLEM_TYPES` (record of problem `type` URIs), `ProblemType`, `FieldErrorSchema`, `FieldError = { field: string | null; message: string }`, `ProblemSchema`, `Problem`, `toFieldErrors(error: z.ZodError, prefix?: string): FieldError[]`.
- Produces (tooling): `npm run test:ci`, `npm run lint`, `npm run typecheck`, `npm run build`, Compose services `db-test`, `test`, `dev`; the `dev()` shell helper from the index works after this task.

- [ ] **Step 1: Create repository hygiene files**

`.gitignore`:
```gitignore
node_modules/
dist/
reports/
coverage/
test-results/
playwright-report/
*.tsbuildinfo
.env
.DS_Store
```

`.gitattributes`:
```gitattributes
* text=auto eol=lf
*.png binary
```

`.dockerignore`:
```gitignore
**/node_modules
**/dist
reports
coverage
test-results
playwright-report
.git
.env
```

`.nvmrc`:
```
24
```

`.prettierrc.json`:
```json
{
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

`.prettierignore`:
```gitignore
package-lock.json
reports
dist
docs/superpowers
apps/api/openapi.json
```

- [ ] **Step 2: Create the root manifest and TypeScript base config**

`package.json`:
```json
{
  "name": "foci-todo",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:ci": "npm run format:check && npm run lint && npm run typecheck && vitest run --coverage"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: Create the shared package skeleton**

`packages/shared/package.json`:
```json
{
  "name": "@foci/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "@foci/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json"
  }
}
```

The `@foci/source` condition lets type-checking and tooling read the TypeScript sources directly; Node at runtime (no custom condition) loads the compiled `dist`.

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

`packages/shared/tsconfig.build.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "noEmit": false
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Bootstrap dependencies and the lockfile (one-off, Docker only)**

Run:
```bash
docker run --rm -v "$PWD":/repo -w /repo node:24.21-alpine sh -c '
  npm install --no-audit --no-fund -D \
    typescript@~6.0.3 @types/node@^24.19.0 \
    eslint@^10.11.0 @eslint/js@^10.0.1 typescript-eslint@^8.71.0 globals@^17.12.0 \
    eslint-plugin-import-x@^4.17.1 eslint-import-resolver-typescript@^4.4.5 \
    prettier@^3.9.9 vitest@^5.0.3 @vitest/coverage-v8@^5.0.3 &&
  npm install --no-audit --no-fund -w @foci/shared zod@^4.6.5'
rm -rf node_modules
```
Expected: `package.json` gains `devDependencies`, `packages/shared/package.json` gains `"dependencies": { "zod": "^4.6.5" }`, and `package-lock.json` exists. (`node_modules` is removed from the host; the `dev` container keeps its own copy in a named volume.)

- [ ] **Step 5: Create the Dockerfile (base, deps, source, test)**

`Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1

FROM node:24.21-alpine AS base
WORKDIR /repo

# One install for the whole monorepo; re-runs only when a manifest or the lockfile changes.
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS source
COPY . .

# Lint, typecheck and every test layer with the coverage gate.
FROM source AS test
ENV COVERAGE_DIR=/reports/coverage
CMD ["npm", "run", "test:ci"]
```

Every later PR that adds a workspace adds its `COPY <workspace>/package.json <workspace>/` line to the `deps` stage.

- [ ] **Step 6: Create `compose.yaml` with the test and dev profiles**

`compose.yaml`:
```yaml
name: foci-todo

x-postgres-env: &postgres-env
  POSTGRES_USER: todo
  POSTGRES_PASSWORD: todo
  POSTGRES_INITDB_ARGS: --locale-provider=builtin --builtin-locale=C.UTF-8

services:
  # Throwaway database for integration and concurrency tests (RAM-backed, fresh every run).
  db-test:
    image: postgres:17.11-alpine
    profiles: [test, dev]
    environment:
      <<: *postgres-env
      POSTGRES_DB: todo_test
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U todo -d todo_test']
      interval: 1s
      timeout: 3s
      retries: 30

  # Full quality gate: format, lint, typecheck, all tests, 100% coverage.
  test:
    build:
      context: .
      target: test
    profiles: [test]
    environment:
      DATABASE_URL: postgres://todo:todo@db-test:5432/todo_test
    depends_on:
      db-test:
        condition: service_healthy
    volumes:
      - ./reports:/reports

  # Developer loop: bind-mounted repo, dependencies in a named volume.
  dev:
    build:
      context: .
      target: deps
    profiles: [dev]
    working_dir: /repo
    environment:
      DATABASE_URL: postgres://todo:todo@db-test:5432/todo_test
    depends_on:
      db-test:
        condition: service_healthy
    volumes:
      - .:/repo
      - dev_node_modules:/repo/node_modules

volumes:
  dev_node_modules:
```

The coverage report is written to `/reports/coverage` (a sub-folder of the mount), because Vitest deletes and recreates its report directory and cannot delete a mount point.

- [ ] **Step 7: Create the Vitest config with the 100% gate**

`vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@foci/shared': fromRoot('./packages/shared/src/index.ts') },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      exclude: ['apps/api/src/server.ts', 'apps/web/src/main.tsx', '**/*.d.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: process.env.COVERAGE_DIR ?? 'reports/coverage',
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'shared',
          environment: 'node',
          include: ['packages/shared/tests/**/*.test.ts'],
        },
      },
    ],
  },
});
```

- [ ] **Step 8: Create the ESLint config with layer-boundary rules**

`eslint.config.js`:
```js
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const api = (layer) => `./apps/api/src/${layer}`;

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'reports/**', 'test-results/**', 'playwright-report/**'],
  },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    plugins: { 'import-x': importX },
    languageOptions: {
      globals: { ...globals.node },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['packages/*/tsconfig.json', 'apps/*/tsconfig.json', 'e2e/tsconfig.json'],
          conditionNames: ['@foci/source', 'types', 'import', 'default'],
        }),
      ],
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      // Express recognises error handlers by their 4-argument signature (`_next` stays unused).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Architecture: dependencies point inward (spec §4.4).
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: api('domain'),
              from: [api('service'), api('repository'), api('http')],
              message: 'domain must not depend on outer layers',
            },
            {
              target: api('service'),
              from: [api('repository/postgres'), api('repository/in-memory'), api('http')],
              message: 'service may depend on repository ports only',
            },
            {
              target: api('repository'),
              from: [api('service'), api('http')],
              message: 'repository adapters must not depend on service or http',
            },
            {
              target: api('http'),
              from: [api('repository/postgres'), api('repository/in-memory')],
              message: 'http must not depend on repository adapters',
            },
            {
              target: './apps/web/src/todos',
              from: ['./apps/web/src/dev'],
              message: 'todo feature must not depend on the dev portal',
            },
            {
              target: './apps/web/src/dev',
              from: ['./apps/web/src/todos'],
              message: 'dev portal must not depend on todo feature internals',
            },
            {
              target: './apps/web/src',
              from: ['./apps/api'],
              message: 'web must not import the api package',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/domain/**', 'apps/api/src/service/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: ['pg', 'express'], patterns: ['pino', 'pino-http'] },
      ],
    },
  },
  {
    files: ['apps/api/src/http/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['pg'] }],
    },
  },
);
```

- [ ] **Step 9: Write the failing test for the problem module**

`packages/shared/tests/problem.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PROBLEM_TYPES, ProblemSchema, toFieldErrors } from '../src/problem.js';

function zodError(schema: z.ZodType, value: unknown): z.ZodError {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected a validation failure');
  return result.error;
}

describe('PROBLEM_TYPES', () => {
  it('uses distinct /problems/ URIs', () => {
    const values = Object.values(PROBLEM_TYPES);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) expect(value).toMatch(/^\/problems\/[a-z-]+$/);
  });
});

describe('ProblemSchema', () => {
  it('accepts a minimal problem', () => {
    expect(
      ProblemSchema.parse({ type: PROBLEM_TYPES.notFound, title: 'Not found', status: 404 }),
    ).toEqual({ type: '/problems/not-found', title: 'Not found', status: 404 });
  });

  it('accepts a problem with field errors', () => {
    const problem = {
      type: PROBLEM_TYPES.validation,
      title: 'Validation failed',
      status: 400,
      detail: 'Request is invalid',
      instance: '/api/todos',
      errors: [{ field: 'title', message: 'Title is required' }],
    };
    expect(ProblemSchema.parse(problem)).toEqual(problem);
  });

  it('rejects non-error statuses', () => {
    expect(ProblemSchema.safeParse({ type: 'x', title: 'x', status: 200 }).success).toBe(false);
  });
});

describe('toFieldErrors', () => {
  it('joins nested paths with dots', () => {
    const error = zodError(z.object({ a: z.object({ b: z.string() }) }), { a: { b: 1 } });
    expect(toFieldErrors(error)).toEqual([{ field: 'a.b', message: expect.any(String) }]);
  });

  it('uses null for a root-level issue without prefix', () => {
    const error = zodError(z.string(), 1);
    expect(toFieldErrors(error)).toEqual([{ field: null, message: expect.any(String) }]);
  });

  it('uses the prefix for a root-level issue', () => {
    const error = zodError(z.string(), 1);
    expect(toFieldErrors(error, 'If-Match')).toEqual([
      { field: 'If-Match', message: expect.any(String) },
    ]);
  });

  it('prefixes nested paths', () => {
    const error = zodError(z.object({ id: z.string() }), { id: 1 });
    expect(toFieldErrors(error, 'params')).toEqual([
      { field: 'params.id', message: expect.any(String) },
    ]);
  });

  it('reports each unrecognized key as its own field error', () => {
    const error = zodError(z.strictObject({ title: z.string() }), { title: 'x', dueDat: 1, foo: 2 });
    expect(toFieldErrors(error)).toEqual([
      { field: 'dueDat', message: 'Unknown field' },
      { field: 'foo', message: 'Unknown field' },
    ]);
  });
});
```

`packages/shared/tests/index.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import * as shared from '../src/index.js';

describe('@foci/shared public API', () => {
  it('re-exports the problem module', () => {
    expect(shared.PROBLEM_TYPES.validation).toBe('/problems/validation-error');
    expect(typeof shared.toFieldErrors).toBe('function');
  });
});
```

- [ ] **Step 10: Run the tests to verify they fail**

Run: `dev npx vitest run --project shared`
Expected: FAIL — `Cannot find module '../src/problem.js'` / `'../src/index.js'`. (First `dev` run builds the `deps` image and starts `db-test`; this takes a minute.)

- [ ] **Step 11: Implement the problem module and the barrel**

`packages/shared/src/problem.ts`:
```ts
import { z } from 'zod';

/** RFC 9457 problem `type` identifiers used by the API. */
export const PROBLEM_TYPES = {
  validation: '/problems/validation-error',
  malformedJson: '/problems/malformed-json',
  badRequest: '/problems/bad-request',
  notFound: '/problems/not-found',
  versionConflict: '/problems/version-conflict',
  payloadTooLarge: '/problems/payload-too-large',
  idempotencyKeyReuse: '/problems/idempotency-key-reuse',
  preconditionRequired: '/problems/precondition-required',
  internal: '/problems/internal',
} as const;

export type ProblemType = (typeof PROBLEM_TYPES)[keyof typeof PROBLEM_TYPES];

export const FieldErrorSchema = z.object({
  field: z.string().nullable(),
  message: z.string(),
});

export type FieldError = z.infer<typeof FieldErrorSchema>;

export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z.array(FieldErrorSchema).optional(),
});

export type Problem = z.infer<typeof ProblemSchema>;

/** Flattens a Zod error into field errors that both the API and the web form can display. */
export function toFieldErrors(error: z.ZodError, prefix?: string): FieldError[] {
  return error.issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        field: joinPath(prefix, [...issue.path, key]),
        message: 'Unknown field',
      }));
    }
    return [{ field: joinPath(prefix, issue.path), message: issue.message }];
  });
}

function joinPath(prefix: string | undefined, path: readonly PropertyKey[]): string | null {
  const parts = prefix === undefined ? path.map(String) : [prefix, ...path.map(String)];
  return parts.length === 0 ? null : parts.join('.');
}
```

`packages/shared/src/index.ts`:
```ts
export * from './problem.js';
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `dev npx vitest run --project shared`
Expected: PASS (8 tests).

- [ ] **Step 13: Verify the layer-rule wiring actually fires**

Create a throwaway file `apps/api/src/domain/_probe.ts` containing `import '../http/x.js';`, run `dev npx eslint apps/api/src/domain/_probe.ts`.
Expected: an `import-x/no-restricted-paths` error ("domain must not depend on outer layers") — an "unable to resolve" error alone means the resolver is misconfigured and must be fixed before continuing. Then delete `apps/api/src/domain/_probe.ts` (and the empty `apps/` folders).

- [ ] **Step 14: Format and run the full gate**

Run: `dev npx prettier --write .` then `docker compose --profile test run --rm --build test`
Expected: format check, lint, typecheck pass; Vitest reports 100% for statements, branches, functions and lines; exit code 0. Coverage HTML is at `reports/coverage/index.html`.

- [ ] **Step 15: Commit**

```bash
git add .gitignore .gitattributes .dockerignore .nvmrc .prettierrc.json .prettierignore \
  package.json package-lock.json tsconfig.base.json eslint.config.js vitest.config.ts \
  Dockerfile compose.yaml packages/shared
git commit -F - <<'EOF'
build: scaffold monorepo tooling, Docker test harness and problem contract

npm workspaces, strict TypeScript 6, ESLint with layer-boundary rules,
Prettier, Vitest with a 100% coverage gate, and a Compose test/dev
harness so everything runs with Docker only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Todo schemas

**Files:**
- Create: `packages/shared/src/todo.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/todo.test.ts`, `packages/shared/tests/index.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `TITLE_MAX_LENGTH = 200`, `DESCRIPTION_MAX_LENGTH = 2000`, `TodoIdSchema`, `CreateTodoSchema`, `CreateTodoInput` (input type), `CreateTodo` (output: `{ title: string; description?: string | null; dueDate?: string | null }`), `UpdateTodoSchema`, `UpdateTodoInput`, `UpdateTodo` (output: `{ title?: string; description?: string | null; dueDate?: string | null }`), `TodoViewSchema`, `TodoView = { id; title; description: string | null; dueDate: string | null; isCompleted; createdAt: string; version: number; isOverdue: boolean }`, `TodoViewListSchema`.

- [ ] **Step 1: Write the failing tests**

`packages/shared/tests/todo.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  CreateTodoSchema,
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  TodoIdSchema,
  TodoViewListSchema,
  TodoViewSchema,
  UpdateTodoSchema,
} from '../src/todo.js';

const issues = (result: { success: boolean; error?: { issues: unknown[] } }) =>
  result.success ? [] : (result.error?.issues ?? []);

describe('TodoIdSchema', () => {
  it('accepts a UUID', () => {
    expect(TodoIdSchema.parse('7f3a2c1e-9b4d-4e8a-a1b2-c3d4e5f60718')).toBe(
      '7f3a2c1e-9b4d-4e8a-a1b2-c3d4e5f60718',
    );
  });

  it('rejects anything else', () => {
    expect(TodoIdSchema.safeParse('42').success).toBe(false);
  });
});

describe('CreateTodoSchema', () => {
  it('trims the title and normalises optional fields', () => {
    expect(CreateTodoSchema.parse({ title: '  Buy milk  ', description: '' })).toEqual({
      title: 'Buy milk',
      description: null,
    });
  });

  it('accepts a full payload', () => {
    expect(
      CreateTodoSchema.parse({ title: 'Pay rent', description: 'Before noon', dueDate: '2026-10-01' }),
    ).toEqual({ title: 'Pay rent', description: 'Before noon', dueDate: '2026-10-01' });
  });

  it('accepts explicit nulls for optional fields', () => {
    expect(CreateTodoSchema.parse({ title: 'x', description: null, dueDate: null })).toEqual({
      title: 'x',
      description: null,
      dueDate: null,
    });
  });

  it('requires a title', () => {
    const result = CreateTodoSchema.safeParse({});
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: ['title'], message: 'Title is required' }),
    ]);
  });

  it('rejects a whitespace-only title', () => {
    const result = CreateTodoSchema.safeParse({ title: '   ' });
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: ['title'], message: 'Title is required' }),
    ]);
  });

  it('rejects a non-string title', () => {
    const result = CreateTodoSchema.safeParse({ title: 5 });
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: ['title'], message: 'Title must be a string' }),
    ]);
  });

  it('accepts a title of exactly the maximum length after trimming', () => {
    const title = 'a'.repeat(TITLE_MAX_LENGTH);
    expect(CreateTodoSchema.parse({ title: ` ${title} ` }).title).toBe(title);
  });

  it('rejects a title longer than the maximum', () => {
    const result = CreateTodoSchema.safeParse({ title: 'a'.repeat(TITLE_MAX_LENGTH + 1) });
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: ['title'], message: 'Title must be at most 200 characters' }),
    ]);
  });

  it('accepts a description of exactly the maximum length', () => {
    const description = 'd'.repeat(DESCRIPTION_MAX_LENGTH);
    expect(CreateTodoSchema.parse({ title: 'x', description }).description).toBe(description);
  });

  it('rejects a description longer than the maximum', () => {
    const result = CreateTodoSchema.safeParse({
      title: 'x',
      description: 'd'.repeat(DESCRIPTION_MAX_LENGTH + 1),
    });
    expect(issues(result)).toEqual([
      expect.objectContaining({
        path: ['description'],
        message: 'Description must be at most 2000 characters',
      }),
    ]);
  });

  it('rejects a non-string description', () => {
    const result = CreateTodoSchema.safeParse({ title: 'x', description: 3 });
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: ['description'], message: 'Description must be a string' }),
    ]);
  });

  it.each(['2000-01-01', '2028-02-29', '2026-12-31'])('accepts the real date %s', (dueDate) => {
    expect(CreateTodoSchema.parse({ title: 'x', dueDate }).dueDate).toBe(dueDate);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-1-01', '2026-10-01T00:00:00Z', 'tomorrow'])(
    'rejects the invalid date %s',
    (dueDate) => {
      const result = CreateTodoSchema.safeParse({ title: 'x', dueDate });
      expect(issues(result)).toEqual([
        expect.objectContaining({
          path: ['dueDate'],
          message: 'Due date must be a real date in YYYY-MM-DD format',
        }),
      ]);
    },
  );

  it.each(['id', 'isCompleted', 'createdAt', 'version', 'isOverdue', 'dueDat'])(
    'rejects the client-supplied or unknown field %s',
    (field) => {
      const result = CreateTodoSchema.safeParse({ title: 'x', [field]: 'y' });
      expect(issues(result)).toEqual([
        expect.objectContaining({ code: 'unrecognized_keys', keys: [field] }),
      ]);
    },
  );

  it.each([undefined, null, [], 'text', 42])('rejects the non-object body %j', (body) => {
    const result = CreateTodoSchema.safeParse(body);
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: [], message: 'Request body must be a JSON object' }),
    ]);
  });
});

describe('UpdateTodoSchema', () => {
  it('accepts a single field', () => {
    expect(UpdateTodoSchema.parse({ title: ' New ' })).toEqual({ title: 'New' });
  });

  it('accepts clearing optional fields with null', () => {
    expect(UpdateTodoSchema.parse({ description: null, dueDate: null })).toEqual({
      description: null,
      dueDate: null,
    });
  });

  it('normalises an empty description to null', () => {
    expect(UpdateTodoSchema.parse({ description: '' })).toEqual({ description: null });
  });

  it('requires at least one field', () => {
    const result = UpdateTodoSchema.safeParse({});
    expect(issues(result)).toEqual([
      expect.objectContaining({
        path: [],
        message: 'At least one of title, description or dueDate is required',
      }),
    ]);
  });

  it('does not allow clearing the title', () => {
    const result = UpdateTodoSchema.safeParse({ title: null });
    expect(issues(result)).toEqual([
      expect.objectContaining({ path: ['title'], message: 'Title must be a string' }),
    ]);
  });

  it('rejects unknown fields', () => {
    const result = UpdateTodoSchema.safeParse({ title: 'x', version: 3 });
    expect(issues(result)).toEqual([
      expect.objectContaining({ code: 'unrecognized_keys', keys: ['version'] }),
    ]);
  });
});

describe('TodoViewSchema', () => {
  const view = {
    id: '7f3a2c1e-9b4d-4e8a-a1b2-c3d4e5f60718',
    title: 'Buy milk',
    description: null,
    dueDate: '2026-10-01',
    isCompleted: false,
    createdAt: '2026-09-30T12:00:00.000Z',
    version: 1,
    isOverdue: false,
  };

  it('accepts a valid view', () => {
    expect(TodoViewSchema.parse(view)).toEqual(view);
    expect(TodoViewListSchema.parse([view])).toEqual([view]);
  });

  it('rejects a non-positive version', () => {
    expect(TodoViewSchema.safeParse({ ...view, version: 0 }).success).toBe(false);
  });
});
```

Append to `packages/shared/tests/index.test.ts` inside the `describe` block:
```ts
  it('re-exports the todo module', () => {
    expect(shared.TITLE_MAX_LENGTH).toBe(200);
    expect(typeof shared.CreateTodoSchema.parse).toBe('function');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dev npx vitest run --project shared`
Expected: FAIL — `Cannot find module '../src/todo.js'` and `shared.TITLE_MAX_LENGTH` undefined.

- [ ] **Step 3: Implement the todo schemas**

`packages/shared/src/todo.ts`:
```ts
import { z } from 'zod';

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

export const TodoIdSchema = z.uuid({ error: 'Must be a valid UUID' });

const TitleSchema = z
  .string({
    error: (issue) => (issue.input === undefined ? 'Title is required' : 'Title must be a string'),
  })
  .trim()
  .min(1, { error: 'Title is required' })
  .max(TITLE_MAX_LENGTH, { error: `Title must be at most ${TITLE_MAX_LENGTH} characters` });

const DescriptionSchema = z
  .string({ error: 'Description must be a string' })
  .max(DESCRIPTION_MAX_LENGTH, {
    error: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
  })
  .nullable()
  .transform((value) => (value === '' ? null : value));

const DueDateSchema = z
  .iso.date({ error: 'Due date must be a real date in YYYY-MM-DD format' })
  .nullable();

const OBJECT_BODY = { error: 'Request body must be a JSON object' };

export const CreateTodoSchema = z.strictObject(
  {
    title: TitleSchema,
    description: DescriptionSchema.optional(),
    dueDate: DueDateSchema.optional(),
  },
  OBJECT_BODY,
);

export type CreateTodoInput = z.input<typeof CreateTodoSchema>;
export type CreateTodo = z.output<typeof CreateTodoSchema>;

export const UpdateTodoSchema = z
  .strictObject(
    {
      title: TitleSchema.optional(),
      description: DescriptionSchema.optional(),
      dueDate: DueDateSchema.optional(),
    },
    OBJECT_BODY,
  )
  .refine((patch) => Object.keys(patch).length > 0, {
    error: 'At least one of title, description or dueDate is required',
  });

export type UpdateTodoInput = z.input<typeof UpdateTodoSchema>;
export type UpdateTodo = z.output<typeof UpdateTodoSchema>;

export const TodoViewSchema = z.object({
  id: TodoIdSchema,
  title: z.string(),
  description: z.string().nullable(),
  dueDate: z.iso.date().nullable(),
  isCompleted: z.boolean(),
  createdAt: z.iso.datetime(),
  version: z.int().positive(),
  isOverdue: z.boolean(),
});

export type TodoView = z.infer<typeof TodoViewSchema>;

export const TodoViewListSchema = z.array(TodoViewSchema);
```

Append to `packages/shared/src/index.ts`:
```ts
export * from './todo.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dev npx vitest run --project shared`
Expected: PASS. If a message assertion fails because Zod reports a type issue differently for `null`/arrays, adjust the schema's `error` option (not the test) so the documented message is produced.

- [ ] **Step 5: Format, gate, commit**

Run: `dev npx prettier --write packages/shared` then `docker compose --profile test run --rm --build test` (expect 100%).
```bash
git add packages/shared
git commit -F - <<'EOF'
feat(shared): add todo create, update and view schemas

Strict bodies, trimmed 1-200 char titles, nullable descriptions up to
2000 chars, real YYYY-MM-DD due dates (past allowed) and a read-only
view schema used for API responses and client-side validation.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: List query and HTTP header schemas

**Files:**
- Create: `packages/shared/src/listQuery.ts`, `packages/shared/src/headers.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/listQuery.test.ts`, `packages/shared/tests/headers.test.ts`, `packages/shared/tests/index.test.ts`

**Interfaces:**
- Produces: `TODO_STATUSES`, `TODO_SORT_FIELDS`, `SORT_ORDERS`, `TodoStatus`, `TodoSortField`, `SortOrder`, `ListTodosQuerySchema`, `ListTodosQuery = { status: TodoStatus; sort: TodoSortField; order: SortOrder }`, `DEFAULT_LIST_QUERY`; `MAX_VERSION = 999_999_999`, `IfMatchSchema` (string → number), `IdempotencyKeySchema`, `toEtag(version: number): string`.

- [ ] **Step 1: Write the failing tests**

`packages/shared/tests/listQuery.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIST_QUERY, ListTodosQuerySchema } from '../src/listQuery.js';

describe('ListTodosQuerySchema', () => {
  it('applies defaults', () => {
    expect(ListTodosQuerySchema.parse({})).toEqual({
      status: 'all',
      sort: 'createdAt',
      order: 'desc',
    });
    expect(DEFAULT_LIST_QUERY).toEqual({ status: 'all', sort: 'createdAt', order: 'desc' });
  });

  it('accepts every documented combination', () => {
    expect(
      ListTodosQuerySchema.parse({ status: 'overdue', sort: 'dueDate', order: 'asc' }),
    ).toEqual({ status: 'overdue', sort: 'dueDate', order: 'asc' });
  });

  it.each([
    [{ status: 'done' }, 'status'],
    [{ sort: 'priority' }, 'sort'],
    [{ order: 'up' }, 'order'],
  ])('rejects unknown values %j', (query, field) => {
    const result = ListTodosQuerySchema.safeParse(query);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });

  it('rejects a repeated parameter (array value)', () => {
    expect(ListTodosQuerySchema.safeParse({ status: ['all', 'completed'] }).success).toBe(false);
  });

  it('rejects unknown parameters', () => {
    const result = ListTodosQuerySchema.safeParse({ page: '2' });
    expect(result.error?.issues[0]).toEqual(
      expect.objectContaining({ code: 'unrecognized_keys', keys: ['page'] }),
    );
  });
});
```

`packages/shared/tests/headers.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { IdempotencyKeySchema, IfMatchSchema, MAX_VERSION, toEtag } from '../src/headers.js';

describe('IfMatchSchema', () => {
  it.each([
    ['"1"', 1],
    ['"42"', 42],
    [`"${MAX_VERSION}"`, MAX_VERSION],
  ])('parses %s', (header, version) => {
    expect(IfMatchSchema.parse(header)).toBe(version);
  });

  it.each(['"0"', '"01"', '"-1"', 'W/"3"', '*', '3', '"3", "4"', '"1000000000"', '""'])(
    'rejects %s',
    (header) => {
      const result = IfMatchSchema.safeParse(header);
      expect(result.error?.issues[0]?.message).toBe(
        'If-Match must be a single strong ETag such as "3"',
      );
    },
  );
});

describe('IdempotencyKeySchema', () => {
  it.each(['a', 'b3c1e2f0-0000-4000-8000-000000000001', 'x'.repeat(255)])('accepts %s', (key) => {
    expect(IdempotencyKeySchema.parse(key)).toBe(key);
  });

  it.each(['', 'has space', 'é', 'x'.repeat(256)])('rejects %j', (key) => {
    expect(IdempotencyKeySchema.safeParse(key).error?.issues[0]?.message).toBe(
      'Idempotency-Key must be 1-255 visible ASCII characters',
    );
  });
});

describe('toEtag', () => {
  it('formats a strong ETag', () => {
    expect(toEtag(7)).toBe('"7"');
  });
});
```

Append to `packages/shared/tests/index.test.ts` inside the `describe` block:
```ts
  it('re-exports the list query and header modules', () => {
    expect(shared.DEFAULT_LIST_QUERY.status).toBe('all');
    expect(shared.toEtag(1)).toBe('"1"');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dev npx vitest run --project shared`
Expected: FAIL — modules `listQuery.js` and `headers.js` not found.

- [ ] **Step 3: Implement**

`packages/shared/src/listQuery.ts`:
```ts
import { z } from 'zod';

export const TODO_STATUSES = ['all', 'completed', 'incomplete', 'overdue'] as const;
export const TODO_SORT_FIELDS = ['createdAt', 'dueDate', 'title'] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];
export type TodoSortField = (typeof TODO_SORT_FIELDS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

export const ListTodosQuerySchema = z.strictObject({
  status: z.enum(TODO_STATUSES).default('all'),
  sort: z.enum(TODO_SORT_FIELDS).default('createdAt'),
  order: z.enum(SORT_ORDERS).default('desc'),
});

export type ListTodosQuery = z.output<typeof ListTodosQuerySchema>;

export const DEFAULT_LIST_QUERY: ListTodosQuery = ListTodosQuerySchema.parse({});
```

`packages/shared/src/headers.ts`:
```ts
import { z } from 'zod';

/** Largest version accepted in If-Match; keeps values well inside Postgres `integer`. */
export const MAX_VERSION = 999_999_999;

export const IfMatchSchema = z
  .string()
  .regex(/^"[1-9]\d{0,8}"$/, { error: 'If-Match must be a single strong ETag such as "3"' })
  .transform((value) => Number(value.slice(1, -1)));

export const IdempotencyKeySchema = z
  .string()
  .regex(/^[\x21-\x7E]{1,255}$/, {
    error: 'Idempotency-Key must be 1-255 visible ASCII characters',
  });

export function toEtag(version: number): string {
  return `"${version}"`;
}
```

Append to `packages/shared/src/index.ts`:
```ts
export * from './listQuery.js';
export * from './headers.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dev npx vitest run --project shared`
Expected: PASS.

- [ ] **Step 5: Format, gate, commit**

Run: `dev npx prettier --write packages/shared` then `docker compose --profile test run --rm --build test`.
```bash
git add packages/shared
git commit -F - <<'EOF'
feat(shared): add list query and If-Match/Idempotency-Key schemas

Status/sort/order enums with defaults, strict query keys, strong-ETag
If-Match parsing bounded to 9 digits, and visible-ASCII idempotency keys.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: CI workflow and AI-agent configuration

**Files:**
- Create: `.github/workflows/ci.yml`, `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`

**Interfaces:**
- Produces: GitHub Actions job `test`; repository conventions consumed by every later task.

- [ ] **Step 1: Create the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    name: Lint, typecheck and tests (100% coverage)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run the test profile
        run: docker compose --profile test run --rm --build test
      - name: Upload coverage report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: reports/coverage
          if-no-files-found: ignore
      - name: Tear down
        if: always()
        run: docker compose --profile test down -v
```

- [ ] **Step 2: Create `CLAUDE.md`**

`CLAUDE.md`:
````markdown
# FociToDo — instructions for AI agents

Full-stack to-do app: npm-workspaces monorepo (`packages/shared`, `apps/api`, `apps/web`).
Design: `docs/superpowers/specs/2026-09-30-foci-todo-design.md`. Plan: `docs/superpowers/plans/2026-09-30-foci-todo/`.

## Commands (Docker only — never assume host Node)

```bash
dev() { docker compose --profile dev run --rm dev "$@"; }   # developer shell helper
dev npx vitest run <file>                                  # one test file
dev npx prettier --write .                                 # format
docker compose --profile test run --rm --build test        # full gate: format, lint, typecheck, tests, 100% coverage
docker compose up --build -d                               # run the app on http://localhost:8080
```

## Architecture rules (enforced by ESLint)

- API layers: `http → service → domain`; `service` depends on repository **ports** only.
- `domain/` imports nothing from `service/`, `repository/`, `http/`, `pg`, `express`.
- Only `repository/postgres/` touches SQL; only `apps/web/src/api/todoClient.ts` calls `fetch`.
- `app.ts` is the only composition root; wire dependencies by hand through constructors.
- `@foci/shared` Zod schemas are the single source of truth for validation and the OpenAPI document.

## Testing rules

- TDD: write the failing test first; test and implementation land in the same commit.
- Tests mirror source paths: `src/a/B.ts` → `tests/a/B.test.ts` in the same package.
- Suffixes: `.test.ts(x)` unit, `.int.test.ts` needs Postgres, `.concurrency.test.ts` concurrency invariants.
- Coverage must stay at 100%. Inject clocks, id generators and pools instead of adding `v8 ignore`.
- Concurrency tests assert invariants, never timings.

## Conventions

- Plain TypeScript: classes and interfaces, no DI container, no enums, no decorators.
- API/shared imports use `.js` extensions; web imports are extensionless.
- Conventional Commits with scope; every commit green; end each commit with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- One branch and PR per plan file; curate with `--fixup` + autosquash before opening the PR.
- Never edit generated files by hand (`apps/api/openapi.json`).
````

- [ ] **Step 3: Create `AGENTS.md` and the Claude permission allowlist**

`AGENTS.md`:
```markdown
# Agent instructions

See [CLAUDE.md](./CLAUDE.md) — it applies to every AI coding agent working in this repository.
```

`.claude/settings.json`:
```json
{
  "permissions": {
    "allow": [
      "Bash(docker compose --profile test run --rm --build test)",
      "Bash(docker compose --profile dev run --rm dev:*)",
      "Bash(docker compose ps:*)",
      "Bash(docker compose logs:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)"
    ]
  }
}
```

- [ ] **Step 4: Gate and commit**

Run: `dev npx prettier --write CLAUDE.md AGENTS.md .github .claude` then `docker compose --profile test run --rm --build test`.
```bash
git add .github CLAUDE.md AGENTS.md .claude
git commit -F - <<'EOF'
ci: run the Docker test profile in GitHub Actions and add agent rules

CI executes exactly the reviewer command. CLAUDE.md records commands,
layer rules, test conventions and commit rules for AI agents.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Publish the repository and open PR 1

**Files:** none.

- [ ] **Step 1: Confirm with the user before publishing** — creating a public GitHub repository is outward-facing. Ask: "Create public repo `charlesmalo/FociToDo` and push `main`?" Proceed only on yes.

- [ ] **Step 2: Create the remote and push `main`**

```bash
gh repo create charlesmalo/FociToDo --public --description "Full-stack to-do app: TypeScript, Express, Postgres, React — Docker-only setup" --source . --remote origin
git push -u origin main
```
Expected: `main` (spec + plan commits) visible on GitHub.

- [ ] **Step 3: Curate, review, push and open the PR** — follow the index's per-PR procedure steps 3–6 with title `feat: foundation tooling and shared contract`.

PR body:
```markdown
## What
- npm-workspaces monorepo tooling: strict TypeScript 6, ESLint (with architecture boundary rules), Prettier, Vitest with a 100% coverage gate
- Docker-only harness: `docker compose --profile test run --rm --build test` (RAM-backed Postgres for later DB tests) and a `dev` profile for the TDD loop
- `@foci/shared`: problem details, todo create/update/view schemas, list query, `If-Match` / `Idempotency-Key` schemas
- CI running the same Docker command; CLAUDE.md / AGENTS.md

## Why
Spec §4 (architecture, layer rules), §5.5 (validation), §8 (Docker-only), §9 (testing). The shared package is the single contract for API validation, web forms and OpenAPI.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
