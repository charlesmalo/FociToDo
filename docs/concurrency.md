# Concurrency

Every guarantee below is enforced by the database, not by timing, and is proven by tests that fire parallel requests at a real server and Postgres, five rounds each, asserting final-state invariants (`apps/api/tests/http/todoRoutes.concurrency.test.ts`).

| Guarantee                  | Mechanism                                                                          | Proof                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Atomic writes              | Each write is one SQL statement; idempotent create is one transaction              | 50 parallel creates → exactly 50 rows, 50 unique ids                                  |
| No lost updates            | `version` column; `ETag` / required `If-Match`; `UPDATE … WHERE version = $n`      | Two PATCHes from version 1 → exactly one 200 and one 412; final state is the winner's |
| Idempotent status changes  | `UPDATE … WHERE is_completed <> $2`; version bumps only on change                  | 20 parallel completes → all 200, version +1 once                                      |
| Idempotent create          | Claim the key first in a transaction; the primary key serialises concurrent claims | 5 parallel POSTs with one key → 1 row, 5 identical 201 bodies; different body → 422   |
| Deterministic delete races | `DELETE … WHERE version = $n`, then re-check existence                             | 10 parallel deletes → one 204, nine 404                                               |
| Mixed contention           | All of the above                                                                   | 10 PATCHes + 5 completes → final version = 1 + successful mutations                   |

## Lost update, prevented

![Lost update, prevented (sequence diagram)](diagrams/concurrency/lost-update-prevented.svg)

<details><summary>Mermaid source</summary>

```mermaid
sequenceDiagram
  participant A as Client A
  participant B as Client B
  participant API
  participant DB as Postgres
  A->>API: PATCH If-Match "3"
  B->>API: PATCH If-Match "3"
  API->>DB: UPDATE … WHERE version = 3 (A)
  DB-->>API: 1 row → version 4
  API-->>A: 200 ETag "4"
  API->>DB: UPDATE … WHERE version = 3 (B)
  DB-->>API: 0 rows (todo exists)
  API-->>B: 412 version-conflict
```

</details>

The web app sends the version the user started from — the one the edit form opened on, or the one on screen when Delete was clicked — so a background refetch can never turn a stale edit into a silent overwrite. It reacts to a 412 by showing a notice, reloading the todo and keeping the user's edits; saving again then targets the reloaded version.

## Double submit, absorbed

![Double submit, absorbed (sequence diagram)](diagrams/concurrency/double-submit-absorbed.svg)

<details><summary>Mermaid source</summary>

```mermaid
sequenceDiagram
  participant U as Browser (double-click)
  participant API
  participant DB as Postgres
  U->>API: POST Idempotency-Key k1
  U->>API: POST Idempotency-Key k1
  API->>DB: tx 1: claim k1 ✓ · INSERT todo
  API->>DB: tx 2: claim k1 … waits for tx 1
  DB-->>API: tx 1 COMMIT
  DB-->>API: tx 2: k1 is live → nothing written
  API-->>U: 201 (original)
  API-->>U: 201 replay, same body
```

</details>

The web form generates one key per submission attempt and reuses it when the same payload is retried.

## Parallel completes, one change

![Parallel completes, one change (sequence diagram)](diagrams/concurrency/parallel-completes-one-change.svg)

<details><summary>Mermaid source</summary>

```mermaid
sequenceDiagram
  participant C as 20 clients
  participant API
  participant DB as Postgres
  C->>API: 20 × POST /complete
  API->>DB: UPDATE … WHERE NOT is_completed
  DB-->>API: first: 1 row (version 2)
  DB-->>API: others: 0 rows → re-read, unchanged
  API-->>C: 20 × 200, ETag "2"
```

</details>

## What is not guaranteed

- A replayed create returns the **original** response snapshot, even if the todo was edited or deleted since (standard idempotency-key semantics).
- Complete/incomplete do not take `If-Match`: setting a target state cannot lose an update, but it does change the version, so a pending edit based on the old version gets a 412.
- `isOverdue` and `isDueSoon` are derived from the server clock when a response is built, so a replayed create or a list fetched earlier shows them as of that moment.
- Conditional GET: `If-None-Match` is ignored and responses are `no-store`, because `isOverdue`/`isDueSoon` change with the clock without a version bump; the ETag only guards writes.
