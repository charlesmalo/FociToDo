# 0002 Postgres with `pg` and plain SQL

Status: Accepted · 2026-09-30

## Context

Data must persist and concurrent writes must be safe. The brief allows a file store, but files need hand-written locking.

## Decision

Postgres 17 behind repository ports, accessed with the `pg` driver and hand-written parameterised SQL. An in-memory adapter implements the same ports for fast tests.

## Consequences

- **Positive:** Transactions, row-level atomicity and constraints for free; every query is visible and reviewable.
- **Negative:** One more container; row mapping written by hand.

## Alternatives considered

JSON file (custom locking), SQLite (weaker concurrency story, native module), Prisma/Drizzle (hide the SQL that carries the concurrency guarantees).
