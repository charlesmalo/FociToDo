# Architecture decision records

| #                                                     | Decision                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| [0001](./0001-typescript-monorepo.md)                 | TypeScript monorepo with npm workspaces                               |
| [0002](./0002-postgres-with-plain-sql.md)             | Postgres with `pg` and plain SQL                                      |
| [0003](./0003-migrations-as-a-one-shot-service.md)    | `node-pg-migrate` SQL migrations in a one-shot service                |
| [0004](./0004-optimistic-locking-with-etags.md)       | Optimistic locking with ETag / If-Match                               |
| [0005](./0005-idempotent-status-and-create.md)        | Idempotent status actions and Idempotency-Key on create               |
| [0006](./0006-patch-plus-action-routes.md)            | PATCH plus action routes                                              |
| [0007](./0007-problem-details.md)                     | RFC 9457 problem details                                              |
| [0008](./0008-server-side-utc-overdue.md)             | Overdue computed server-side in UTC                                   |
| [0009](./0009-openapi-from-zod.md)                    | OpenAPI generated from Zod (partly superseded by 0016)                |
| [0010](./0010-single-page-ui-with-dialog.md)          | Single-page UI with a Radix dialog and TanStack Query                 |
| [0011](./0011-in-app-developer-portal.md)             | In-app `/dev` portal single-sourced from `docs/` (superseded by 0015) |
| [0012](./0012-docker-only-setup.md)                   | One multi-stage Dockerfile, Compose profiles, Docker-only setup       |
| [0013](./0013-test-strategy-and-coverage-gate.md)     | Test strategy and 100% coverage gate                                  |
| [0014](./0014-curated-prs-and-ai-attribution.md)      | Curated PR workflow and AI attribution                                |
| [0015](./0015-docs-and-diagrams-in-the-repository.md) | Docs and diagrams live in the repository                              |
| [0016](./0016-api-docs-as-a-repository-artifact.md)   | API docs as a generated repository artifact, not an endpoint          |
