-- Up Migration
CREATE TABLE idempotency_keys (
  key              varchar(255)  PRIMARY KEY,
  request_hash     varchar(64)   NOT NULL,
  response_status  smallint      NOT NULL,
  response_body    jsonb         NOT NULL,
  created_at       timestamptz   NOT NULL
);

-- Down Migration
DROP TABLE idempotency_keys;
