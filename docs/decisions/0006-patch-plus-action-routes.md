# 0006 PATCH plus action routes

Status: Accepted · 2026-09-30

## Context

The brief separates "update title/description/due date" from "complete" and "incomplete".

## Decision

`PATCH /todos/{id}` for partial edits (`null` clears optional fields; If-Match required) and `POST /todos/{id}/complete|incomplete` for status (idempotent, no If-Match).

## Consequences

- Each operation maps one-to-one to the brief; versioning rules stay simple per route.
  − Two extra routes instead of a generic PATCH of `isCompleted`.

## Alternatives considered

PUT full replacement (clients must resend everything), PATCH-only status changes (mixes idempotent and versioned semantics).
