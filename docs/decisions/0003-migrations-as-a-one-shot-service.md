# 0003 `node-pg-migrate` SQL migrations in a one-shot service

Status: Accepted · 2026-09-30

## Context

The schema must exist before the API serves requests, and scaling the API must not race on migrations.

## Decision

Plain `.sql` migrations applied by `node-pg-migrate` (advisory-locked) from a dedicated `migrate` Compose service; the API starts only after it completes successfully. Tests apply the same migrations to the test database.

## Consequences

- **Positive:** Migrations run exactly once; a failed migration stops startup cleanly; the API needs no DDL rights at runtime.
- **Negative:** One more service in Compose.

## Alternatives considered

Migrate on API boot (races when scaled, crash loops), a home-made runner (custom concurrency-sensitive code).
