# 0001 TypeScript monorepo with npm workspaces

Status: Accepted · 2026-09-30

## Context

The API and the web app must agree on validation rules and data shapes; drift between them is a common source of bugs.

## Decision

One repository with three workspaces: `@foci/shared` (Zod schemas and types), `@foci/api`, `@foci/web`. Plain TypeScript style: classes, interfaces, constructor injection, no DI container.

## Consequences

- **Positive:** One contract, enforced by the compiler on both sides; one install, one test command.
- **Negative:** Workspace-aware Docker builds and a little TypeScript configuration (`@foci/source` export condition).

## Alternatives considered

Separate repositories (types duplicated or published), a single package (no enforced boundaries), Python/FastAPI backend (two languages, duplicated rules).
