# 0007 RFC 9457 problem details

Status: Accepted · 2026-09-30

## Context

Clients need one predictable error shape, including per-field validation errors.

## Decision

All errors are `application/problem+json` with `type`, `title`, `status`, `detail`, `instance` and, for validation, `errors: [{ field, message }]`. One module maps domain errors to problems; unexpected errors become a generic 500 that is logged but not leaked.

## Consequences

- Self-describing errors; the web form maps `errors` straight onto fields.
  − Problem type URIs to maintain.

## Alternatives considered

A custom `{ error: … }` envelope (non-standard, needs its own documentation).
