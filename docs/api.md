# API

Base path `/api`. JSON in and out; errors are `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)). The browsable reference is the local file [`docs/api/index.html`](api/index.html) (open it in a browser; it works offline) and the machine-readable contract is [`apps/api/openapi.json`](../apps/api/openapi.json) (generated from the same Zod schemas the API validates with).

## Conventions

| Topic                 | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versions              | Every todo has a `version`; responses carry it as a strong `ETag` (e.g. `"3"`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Updates and deletes   | `If-Match: "<version>"` is required: missing → **428**, stale → **412**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Creates               | Optional `Idempotency-Key`; a repeat replays the original 201 with `Idempotent-Replayed: true`; same key + different body → **422**; keys expire after 24 h                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Complete / incomplete | Idempotent; no `If-Match`; the version changes only if the state changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Validation            | Bodies and queries are strict: unknown fields → **400** with per-field `errors`; `dueAt` is an RFC 3339 date-time with an offset or `Z` (year 0001–9999 of the UTC instant), e.g. `2026-10-03T18:00:00-04:00`; a bare date or a time without an offset → **400**. `dueDate` (`YYYY-MM-DD`, a real date, year 0001–9999) is accepted instead of `dueAt` and means 23:59:59 UTC that day; sending both is a **400**. The deadline is stored as a UTC instant (`2026-10-03T22:00:00.000Z`); responses carry `dueAt` and `dueDate`, the UTC date of `dueAt`; title and description must not contain U+0000 or an unpaired UTF-16 surrogate |
| Caching               | Every API response is `Cache-Control: no-store`; there is no conditional GET (`If-None-Match` is ignored). The ETag is for `If-Match` on PATCH and DELETE.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Error precedence      | **400** (malformed) → **428** (missing If-Match) → **404** → **412**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Endpoints

| Method | Path                           | Success                   | Errors                       |
| ------ | ------------------------------ | ------------------------- | ---------------------------- |
| POST   | `/api/todos`                   | 201 + `Location` + `ETag` | 400, 413, 415, 422           |
| GET    | `/api/todos?status&sort&order` | 200                       | 400                          |
| GET    | `/api/todos/{id}`              | 200 + `ETag`              | 400, 404                     |
| PATCH  | `/api/todos/{id}`              | 200 + `ETag`              | 400, 404, 412, 413, 415, 428 |
| POST   | `/api/todos/{id}/complete`     | 200 + `ETag`              | 400, 404                     |
| POST   | `/api/todos/{id}/incomplete`   | 200 + `ETag`              | 400, 404                     |
| DELETE | `/api/todos/{id}`              | 204                       | 400, 404, 412, 428           |
| GET    | `/api/health`                  | 200                       | 503                          |

List parameters: `status` = `all` (default) · `completed` · `incomplete` · `overdue` · `due-soon`; `sort` = `createdAt` (default) · `dueAt` · `title` (`dueDate` is an alias of `dueAt`); `order` = `desc` (default) · `asc`. `overdue` is incomplete with `dueAt` in the past; `due-soon` is incomplete with `dueAt` from now up to (excluding) 24 hours ahead; both are also returned as `isOverdue` and `isDueSoon` on each todo. Todos without a deadline sort last; ties break by newest, then id.

## Problem types

| `type`                            | Status | When                                                        |
| --------------------------------- | ------ | ----------------------------------------------------------- |
| `/problems/validation-error`      | 400    | Invalid body, query, id or header (`errors[]` lists fields) |
| `/problems/malformed-json`        | 400    | Body is not valid JSON                                      |
| `/problems/bad-request`           | 4xx    | Other client errors from the JSON parser (e.g. 415 charset) |
| `/problems/not-found`             | 404    | Unknown todo or route                                       |
| `/problems/version-conflict`      | 412    | `If-Match` is stale                                         |
| `/problems/payload-too-large`     | 413    | Body over 16 kB                                             |
| `/problems/idempotency-key-reuse` | 422    | Key reused with a different body                            |
| `/problems/precondition-required` | 428    | `If-Match` missing                                          |
| `/problems/internal`              | 500    | Unexpected error (details logged, never returned)           |

## Sequences

### Create — `POST /api/todos`

```bash
curl -i -X POST localhost:8080/api/todos -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 7d1c2b9e-4a3f-4e8b-9c1d-2f6a8b0e5c41' -d '{"title":"Buy milk","dueAt":"2026-10-01T17:00:00-04:00"}'
```

![Create — POST /api/todos (sequence diagram)](diagrams/api/create-post-api-todos.svg)

<details><summary>Mermaid source</summary>

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  participant DB as Postgres
  C->>A: POST /api/todos (Idempotency-Key?)
  alt invalid body or key
    A-->>C: 400 validation-error
  else no key
    A->>DB: INSERT todo
    A-->>C: 201 + Location + ETag "1"
  else key
    A->>DB: BEGIN · claim key (INSERT … ON CONFLICT)
    alt claimed
      A->>DB: INSERT todo · COMMIT
      A-->>C: 201
    else key live, same body
      A-->>C: 201 replay (Idempotent-Replayed)
    else key live, different body
      A-->>C: 422 idempotency-key-reuse
    end
  end
```

</details>

### List — `GET /api/todos`

![List — GET /api/todos (sequence diagram)](diagrams/api/list-get-api-todos.svg)

<details><summary>Mermaid source</summary>

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  participant DB as Postgres
  C->>A: GET /api/todos?status=due-soon&sort=dueAt&order=asc
  alt unknown or repeated parameter
    A-->>C: 400 validation-error
  else valid
    A->>DB: SELECT … WHERE filter ORDER BY sort, created_at DESC, id
    A-->>C: 200 no-store [todos with isOverdue / isDueSoon]
  end
```

</details>

### View — `GET /api/todos/{id}`

![View — GET /api/todos/{id} (sequence diagram)](diagrams/api/view-get-api-todos-id.svg)

<details><summary>Mermaid source</summary>

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  participant DB as Postgres
  C->>A: GET /api/todos/{id}
  alt id is not a UUID
    A-->>C: 400 validation-error
  else
    A->>DB: SELECT … WHERE id
    alt found
      A-->>C: 200 + ETag
    else missing
      A-->>C: 404 not-found
    end
  end
```

</details>

### Update — `PATCH /api/todos/{id}`

```bash
curl -i -X PATCH localhost:8080/api/todos/<id> -H 'If-Match: "1"' \
  -H 'Content-Type: application/json' -d '{"title":"Buy oat milk"}'
```

![Update — PATCH /api/todos/{id} (sequence diagram)](diagrams/api/update-patch-api-todos-id.svg)

<details><summary>Mermaid source</summary>

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  participant DB as Postgres
  C->>A: PATCH /api/todos/{id} If-Match "3"
  alt malformed id, body or If-Match
    A-->>C: 400
  else If-Match missing
    A-->>C: 428 precondition-required
  else
    A->>DB: UPDATE … WHERE id AND version = 3
    alt 1 row
      A-->>C: 200 + ETag "4"
    else 0 rows, todo missing
      A-->>C: 404
    else 0 rows, version moved on
      A-->>C: 412 version-conflict
    end
  end
```

</details>

### Complete — `POST /api/todos/{id}/complete`

![Complete — POST /api/todos/{id}/complete (sequence diagram)](diagrams/api/complete-post-api-todos-id-complete.svg)

<details><summary>Mermaid source</summary>

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  participant DB as Postgres
  C->>A: POST /api/todos/{id}/complete
  A->>DB: UPDATE … SET is_completed = true, version + 1 WHERE id AND NOT is_completed
  alt state changed
    A-->>C: 200 + new ETag
  else already completed
    A->>DB: SELECT … WHERE id
    A-->>C: 200 + same ETag
  else missing
    A-->>C: 404
  end
```

</details>

### Incomplete — `POST /api/todos/{id}/incomplete`

![Incomplete — POST /api/todos/{id}/incomplete (sequence diagram)](diagrams/api/incomplete-post-api-todos-id-incomplete.svg)

<details><summary>Mermaid source</summary>

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  participant DB as Postgres
  C->>A: POST /api/todos/{id}/incomplete
  A->>DB: UPDATE … SET is_completed = false, version + 1 WHERE id AND is_completed
  alt state changed
    A-->>C: 200 + new ETag
  else already incomplete
    A-->>C: 200 + same ETag
  else missing
    A-->>C: 404
  end
```

</details>

### Delete — `DELETE /api/todos/{id}`

![Delete — DELETE /api/todos/{id} (sequence diagram)](diagrams/api/delete-delete-api-todos-id.svg)

<details><summary>Mermaid source</summary>

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  participant DB as Postgres
  C->>A: DELETE /api/todos/{id} If-Match "2"
  alt malformed id or If-Match
    A-->>C: 400
  else If-Match missing
    A-->>C: 428
  else
    A->>DB: DELETE … WHERE id AND version = 2
    alt deleted
      A-->>C: 204
    else missing
      A-->>C: 404
    else version moved on
      A-->>C: 412
    end
  end
```

</details>
