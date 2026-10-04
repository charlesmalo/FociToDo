# 0018 Deadlines accept the brief's dueDate

Status: Accepted · 2026-10-03 · Amends [0017](./0017-deadlines-are-utc-instants.md)

## Context

The brief names the deadline `dueDate` with a `YYYY-MM-DD` value. After 0017 the API only knew `dueAt` and rejected `dueDate` as an unknown field, so a client written to the brief could not set a deadline.

## Decision

Create and update accept either `dueDate` (`YYYY-MM-DD`, a real calendar date, year 0001–9999) or `dueAt` (an exact instant). Sending both is a 400 on `dueDate`, even when one of them is `null`, because the two spellings are one field. Validation turns `dueDate` into the single internal `dueAt`: a date-only deadline is `<date>T23:59:59.000Z`, the same end-of-UTC-day rule migration 1759190400002 used for existing dates. `dueDate: null` clears the deadline. Nothing after validation sees two fields, and the idempotency hash is computed on the normalised `dueAt`, so `dueDate: '2030-01-02'` and `dueAt: '2030-01-02T23:59:59Z'` are the same request.

Responses return both `dueAt` and `dueDate`, where `dueDate` is the UTC calendar date of `dueAt` (or `null`). It is derived in `toView`, never stored. `sort=dueDate` is accepted as an alias of `sort=dueAt`. Migration `1759190400003_due-date-in-cached-responses` adds `dueDate` to cached idempotent response bodies, which are replayed verbatim and parsed with the current response schema; its down migration removes it.

## Consequences

- **Positive:** clients written to the brief work unchanged, and the instant stays the single source of truth.
- **Negative:** the UTC date can differ from the viewer's local date, so a late-evening deadline west of UTC shows the next day's `dueDate`.
- **Two spellings:** the request schema documents both fields; the OpenAPI document shows the input shape.

## Migration path

The two fields are the middle step of an expand/contract (parallel change) migration, the way a live API moves to a richer field without breaking the clients it already has:

1. **Model 1 — the brief's contract:** `dueDate` only, a calendar date.
2. **Model 1 + 2 — expand (current):** both fields are accepted and returned. `dueDate` keeps every client written to the brief working; `dueAt` adds exact time for clients that need it. Sending both is rejected, and the returned `dueDate` is always derived from `dueAt`, so the two can never disagree.
3. **Model 2 — contract (future goal, not implemented):** once clients have moved to `dueAt`, `dueDate` is first marked deprecated in the API reference and responses, then removed in a breaking version.

## Alternatives considered

- **Keep rejecting `dueDate`:** simplest, but brief-conformant clients fail.
- **Store a date column as well:** two sources of truth that can disagree.
- **Interpret `dueDate` in the viewer's timezone:** the server has no viewer timezone, and the same request would mean different instants.
