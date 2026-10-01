# 0010 Single-page UI with a Radix dialog and TanStack Query

Status: Accepted · 2026-09-30

## Context

The UI is not the focus of the evaluation but must cover every operation and handle the API's concurrency semantics correctly.

## Decision

One page (filters + list) with a Radix Dialog for create/view/edit/delete; server state in TanStack Query; plain CSS Modules. Panels are independent of the dialog so it can be swapped for an inline panel.

## Consequences

- Accessible modal behaviour (focus trap, Escape, focus return) from a well-tested headless library; no hand-written fetch/effect race handling.
  − Two UI dependencies.

## Alternatives considered

Multiple routes with React Router (more surface), a hand-rolled modal (accessibility risk), plain hooks with `useEffect` (stale-response races).
