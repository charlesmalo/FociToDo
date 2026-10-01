# 0005 Idempotent status actions and Idempotency-Key on create

Status: Accepted · 2026-09-30

## Context

Double-clicks and network retries repeat requests. Repeating "complete" is harmless; repeating "create" makes duplicates.

## Decision

Complete/incomplete set a target state and bump the version only when it changes. POST accepts an optional `Idempotency-Key`: the key is claimed first in the same transaction as the insert; repeats replay the stored 201; a different body with the same key is 422; keys expire after 24 h.

## Consequences

- Retries are always safe; concurrent duplicates serialise on the key's primary key.
  − An extra table and a replay-snapshot semantic to document.

## Alternatives considered

No protection on create (duplicates), client-generated ids (pushes the problem to clients).
