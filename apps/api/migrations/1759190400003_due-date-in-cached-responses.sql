-- Cached idempotent responses are replayed verbatim and parsed with the current response
-- schema, so they gain the derived `dueDate` field: the UTC calendar date of `dueAt`.

-- Up Migration
UPDATE idempotency_keys
SET response_body = response_body || jsonb_build_object(
  'dueDate',
  CASE
    WHEN response_body->>'dueAt' IS NULL THEN NULL
    ELSE to_jsonb(left(response_body->>'dueAt', 10))
  END
)
WHERE response_body ? 'dueAt';

-- Down Migration
UPDATE idempotency_keys SET response_body = response_body - 'dueDate' WHERE response_body ? 'dueDate';
