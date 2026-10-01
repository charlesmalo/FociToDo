# 0013 Test strategy and 100% coverage gate

Status: Accepted · 2026-09-30

## Context

Correctness and concurrency safety are the top priorities; coverage alone does not prove either.

## Decision

Seven layers (schema, service, repository contract on both adapters, HTTP, concurrency invariants, web components, e2e) with a merged 100% coverage gate. Dependencies (clock, ids, pool, HTTP client) are injected so every branch is reachable without coverage-ignore comments.

## Consequences

- Every line runs under test; the contract suite keeps the fast in-memory tests honest; invariants catch races.
  − More test code; logic-free bootstrap files are excluded explicitly.

## Alternatives considered

Tiered thresholds (allows untested branches), report-only coverage (no guarantee).
