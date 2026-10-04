# 0017 Deadlines are UTC instants

Status: Accepted · 2026-10-03 · Supersedes [0008](./0008-server-side-utc-overdue.md) · Amended by [0018](0018-deadlines-accept-the-briefs-duedate.md).

## Context

Deadlines were date-only (`dueDate`) and "overdue" was compared with today's UTC date. A date has no timezone, so the same task read as overdue for one viewer and not for another near midnight, and a task could not be due at a time of day.

## Decision

A deadline is an instant: `dueAt`, stored as `timestamptz` and exchanged as an RFC 3339 date-time with an offset or `Z`, normalised to `toISOString()` in responses. A bare date or a time without an offset is rejected rather than guessed. The server derives `isOverdue` (incomplete, `dueAt < now`) and `isDueSoon` (incomplete, `now <= dueAt < now + 24 h`) from its injected clock and returns both; `status=due-soon` and `sort=dueAt` are added to the list query. The web app combines **Due date** and **Due time** inputs (17:00 prefilled) in the viewer's timezone into an instant and formats deadlines with `Intl.DateTimeFormat` in the viewer's locale and timezone. The migration turns each existing date into 23:59:59 UTC that day, which keeps every existing status.

## Consequences

- **Positive:** Status is exact and the same for every viewer in every timezone; deadlines can be scheduled at a time of day; the filter and the badges still come from one server-side computation.
- **Negative:** Every deadline carries a time (the form prefills 17:00), and API clients must send an offset.
- **Migrated data:** each migrated deadline shows at 23:59:59 UTC, which is a different local time and possibly a different local date for each viewer.
- **Daylight saving:** a local time inside a spring-forward gap does not exist; it shifts forward by the skipped hour (02:30 becomes 03:30).
- **Down migration is lossy:** it keeps only the UTC calendar date, so the time of day is lost.
- **Idempotency keys:** a retry that spans the deploy replays if it sends no deadline; one still sending `dueDate` got a 400 at validation, before hashing.

## Alternatives considered

- **Date-only with UTC midnight (the old behaviour):** simple, but status near midnight differs from the viewer's local date.
- **Date-only with a stored per-task timezone:** extra field and input, and still no time of day.
- **Client-computed status:** disagrees with the server-side filter and varies between clients.
