# 0019 Pagination deferred

Status: Accepted (deferred) · 2026-10-03

## Context

This is a proof of concept with small lists. `GET /api/todos` returns the whole filtered list: one query, sorted in milliseconds at the expected sizes.

## Decision

No pagination now. The list endpoint keeps returning a plain JSON array of every matching todo.

## Consequences

- Every list response, and every 60 s refresh of an open list, carries the whole list.
- Sorting by due date or title, and the overdue and due-soon filters, have no supporting index, so each request scans and sorts the table.
- Both costs grow with the number of todos; past a few thousand todos per list this decision should be revisited.

## The approach that would be built

- Keyset (cursor) pagination with an optional `limit` (default 50, maximum 100) and an opaque `cursor`.
- A request without them returns the first page, so the first call and the array response stay backward compatible.
- The next page is announced in a `Link: <…>; rel="next"` header.
- One index per sort order, and a partial index on `due_at` for incomplete todos.
- A "Load more" button in the web app.

## Alternatives considered

- **Offset pages:** slow at depth, and they skip or repeat rows when the list changes between requests.
- **A `{ items, nextCursor }` envelope:** breaks the existing array contract.
