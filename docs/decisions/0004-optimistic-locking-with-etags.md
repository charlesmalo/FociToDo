# 0004 Optimistic locking with ETag / If-Match

Status: Accepted · 2026-09-30

## Context

Two clients editing the same todo can silently overwrite each other (lost update).

## Decision

A `version` column, exposed as a strong `ETag` and in the body. PATCH and DELETE require `If-Match`; writes are conditional (`WHERE version = $n`). Missing → 428, stale → 412.

## Consequences

- **Positive:** Lost updates are impossible; standard HTTP semantics; testable as an invariant.
- **Negative:** Clients must track the ETag; the UI handles 412 by reloading and keeping the user's edits.

## Alternatives considered

Version in the body with 409 (non-standard), last-write-wins (loses data), pessimistic locks (hold connections across requests).
