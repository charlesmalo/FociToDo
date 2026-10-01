# 0008 Overdue computed server-side in UTC

Status: Accepted · 2026-09-30

## Context

"Overdue" is used both for filtering and for a badge; computing it in two places with two clocks would disagree.

## Decision

The API computes `isOverdue = !isCompleted && dueDate < today` with "today" taken from the injected clock in UTC, and returns it on every todo. The UI only displays it.

## Consequences

- **Positive:** The filter and the badge always agree; deterministic tests via a fixed clock.
- **Negative:** Near midnight the UTC date can differ from the user's local date (documented assumption).

## Alternatives considered

Client-supplied `today` (more parameters and edge cases), computing in the browser (disagrees with the server filter).
