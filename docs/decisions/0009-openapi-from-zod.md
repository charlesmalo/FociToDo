# 0009 OpenAPI generated from Zod

Status: Accepted · 2026-09-30 · serving the document and explorer superseded by [0016](./0016-api-docs-as-a-repository-artifact.md)

## Context

Reviewers and client teams expect a machine-readable API contract, and hand-written docs drift.

## Decision

Build an OpenAPI 3.1 document from the shared Zod schemas with Zod's built-in `z.toJSONSchema`, serve it at `/api/openapi.json` with Swagger UI at `/api/docs`, and commit a generated `openapi.json` guarded by a test.

## Consequences

- **Positive:** One source of truth; tests prove every route is documented and every response status matches the document; reviewers can try the API in a browser.
- **Negative:** Route metadata (summaries, status lists) is still written by hand next to the routes.

## Alternatives considered

`@asteasolutions/zod-to-openapi` (cannot document schemas created before its Zod extension runs), a hand-written YAML (duplicates the rules), Markdown only (not machine-checkable).
