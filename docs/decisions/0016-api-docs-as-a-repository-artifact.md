# 0016 API docs are a repository artifact, not an endpoint

Status: Accepted · 2026-10-03 · Partly supersedes [0009](./0009-openapi-from-zod.md)

## Context

The API explorer and the OpenAPI document were served by the running app to anyone who could reach it. That is development material, not part of the product.

## Decision

The app serves neither. `apps/api/openapi.json` stays the committed contract. `docs/api/index.html` is a generated, self-contained viewer (spec and Swagger UI inlined, "Try it out" off), and the test gate checks that it is in step with the contract. The generator inlines every `$ref`, because Swagger UI cannot resolve them when the page is opened from `file://`.

## Consequences

- **Positive:** Nothing documentation-related ships or is reachable in the running app; smaller API dependency tree; the reference opens offline from disk.
- **Negative:** No in-browser "Try it out" against a running stack (use `curl` or the README smoke test); a ~1.8 MB generated file in the repository.

## Alternatives considered

An environment flag (still in the production code path), keeping only the JSON endpoint (the contract still leaks).
