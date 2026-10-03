-- Deadlines become UTC instants (`due_at timestamptz`) instead of calendar dates.
-- Rolling back is lossy: it keeps only the UTC calendar date, so the time of day is lost.
-- Idempotency keys created before this migration hashed `dueDate`; a retry that spans the deploy
-- hashes `dueAt` instead, so it gets 422 (key reused with a different request) rather than a replay.

-- Up Migration
ALTER TABLE todos ADD COLUMN due_at timestamptz;

-- A date-only deadline becomes the last second of that day in UTC.
UPDATE todos SET due_at = (due_date + time '23:59:59') AT TIME ZONE 'UTC' WHERE due_date IS NOT NULL;

ALTER TABLE todos DROP COLUMN due_date;

-- Cached idempotent responses are replayed verbatim, so give them the new shape too.
UPDATE idempotency_keys
SET response_body = (response_body - 'dueDate') || jsonb_build_object(
  'dueAt',
  CASE
    WHEN response_body->>'dueDate' IS NULL THEN NULL
    ELSE to_jsonb(to_char(((response_body->>'dueDate')::date + time '23:59:59'), 'YYYY-MM-DD"T"HH24:MI:SS".000Z"'))
  END,
  'isDueSoon', false
)
WHERE response_body ? 'dueDate';

-- Down Migration
ALTER TABLE todos ADD COLUMN due_date date;

UPDATE todos SET due_date = (due_at AT TIME ZONE 'UTC')::date WHERE due_at IS NOT NULL;

ALTER TABLE todos DROP COLUMN due_at;

UPDATE idempotency_keys
SET response_body = ((response_body - 'dueAt') - 'isDueSoon') || jsonb_build_object(
  'dueDate',
  CASE
    WHEN response_body->>'dueAt' IS NULL THEN NULL
    ELSE to_jsonb(to_char((response_body->>'dueAt')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
  END
)
WHERE response_body ? 'dueAt';
