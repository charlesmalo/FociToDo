# Architecture

FociToDo is an npm-workspaces monorepo with four packages and one rule: **dependencies point inward**.

| Package             | Role                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/shared`   | The contract: Zod schemas and types used by the API (validation, OpenAPI) and the web app (forms, response validation) |
| `packages/diagrams` | Dev-only tool: extracts Mermaid diagrams from Markdown and generates `docs/diagrams/`                                  |
| `apps/api`          | Express API: `http → service → domain`, storage behind ports                                                           |
| `apps/web`          | React single-page app; only `src/api/todoClient.ts` talks HTTP                                                         |

## System context

![System context (flowchart)](diagrams/architecture/system-context.svg)

<details><summary>Mermaid source</summary>

```mermaid
flowchart LR
  B[Browser] -->|:8080| W[web · nginx<br/>static SPA]
  W -->|/api/*| A[api · Express]
  A --> D[(db · Postgres 17<br/>volume pgdata)]
  M[migrate · one-shot] --> D
```

</details>

nginx serves the SPA and proxies `/api/*` unchanged, so the browser sees a single origin (no CORS). Only `web` publishes a port.

## Deployment and startup order

![Deployment and startup order (flowchart)](diagrams/architecture/deployment-and-startup-order.svg)

<details><summary>Mermaid source</summary>

```mermaid
flowchart LR
  db[(db)] -->|healthy| migrate[migrate<br/>node-pg-migrate up]
  migrate -->|completed successfully| api[api<br/>healthcheck /api/health]
  api -->|healthy| web[web<br/>nginx :8080]
```

</details>

- `migrate` runs the SQL migrations once and exits; the API never changes the schema at runtime.
- A failed migration stops startup cleanly instead of crash-looping the API.
- Runtime images are non-root, contain compiled JavaScript and production dependencies only; the API container is read-only.

## Backend layers

![Backend layers (flowchart)](diagrams/architecture/backend-layers.svg)

<details><summary>Mermaid source</summary>

```mermaid
flowchart TB
  http[http<br/>routes · validation · problem details] --> service[service<br/>TodoService · HealthService]
  service --> domain[domain<br/>Todo · errors · Clock · IdGenerator]
  service --> ports[repository ports<br/>TodoRepository · IdempotencyStore · UnitOfWork]
  pg[repository/postgres] -. implements .-> ports
  mem[repository/in-memory] -. implements .-> ports
  app[app.ts<br/>composition root] --> http & service & pg
```

</details>

| Layer          | May import                             | Must not import                            |
| -------------- | -------------------------------------- | ------------------------------------------ |
| `domain`       | itself, `@foci/shared` types           | service, repository, http, `pg`, `express` |
| `service`      | domain, repository **ports**           | adapters, http, `pg`, `express`            |
| `repository/*` | domain, ports, `pg` (postgres only)    | service, http                              |
| `http`         | service, domain errors, `@foci/shared` | adapters, `pg`                             |
| `app.ts`       | everything                             | —                                          |

These rules are ESLint errors (`import-x/no-restricted-paths`), so a violation fails the build.

**Composition root.** `apps/api/src/app.ts` is the only place that picks implementations: it creates the pool, the Postgres adapters, the services and the Express app, passing dependencies through constructors. Tests use the same function with a fixed clock and predictable ids.

## Domain model

![Domain model (state diagram)](diagrams/architecture/domain-model.svg)

<details><summary>Mermaid source</summary>

```mermaid
stateDiagram-v2
  [*] --> Incomplete: create
  Incomplete --> Completed: complete
  Completed --> Incomplete: incomplete
  Incomplete --> [*]: delete
  Completed --> [*]: delete
  note right of Incomplete: isOverdue = due before today (UTC), derived, never stored
```

</details>

Every change increments `version`; completing an already-completed todo changes nothing.

## Data model

![Data model (entity-relationship diagram)](diagrams/architecture/data-model.svg)

<details><summary>Mermaid source</summary>

```mermaid
erDiagram
  todos {
    uuid id PK
    varchar title "1-200, not blank"
    varchar description "nullable, max 2000"
    date due_date "nullable"
    boolean is_completed
    timestamptz created_at
    int version "optimistic lock"
  }
  idempotency_keys {
    varchar key PK
    varchar request_hash "sha256"
    smallint response_status
    jsonb response_body
    timestamptz created_at "24h TTL"
  }
```

</details>

`CHECK` constraints repeat the key validation rules, so bad data cannot enter even if application code is bypassed.

## Frontend

![Frontend (flowchart)](diagrams/architecture/frontend.svg)

<details><summary>Mermaid source</summary>

```mermaid
flowchart TB
  Page[TodoPage] --> Filters[TodoFilters]
  Page --> List[TodoList] --> Item[TodoItem]
  Page --> Dialog[TodoDialog · Radix]
  Dialog --> Create[CreateTodoPanel] --> Form[TodoForm]
  Dialog --> Details[TodoDetailsPanel] --> Form
  List & Item & Create & Details --> Hooks[useTodos · TanStack Query]
  Hooks --> Client[todoClient.ts] -->|fetch /api| API[(API)]
```

</details>

- Server state lives in TanStack Query; every mutation invalidates the todo queries when it settles.
- The panels know nothing about the dialog, so the dialog could be replaced by an inline panel without changing them.
- Due dates are rendered as stored strings (never through `Date`), so they cannot shift across timezones.

## Cross-cutting

- **Configuration:** environment variables validated with Zod at startup; invalid config stops the process with a clear message.
- **Errors:** domain errors are HTTP-agnostic; `http/problems.ts` is the single mapping to RFC 9457 problem details.
- **Logging:** pino JSON logs with a request id; 5xx errors are logged, never leaked to clients.
- **Shutdown:** `SIGTERM` stops accepting connections, drains requests and closes the pool.
