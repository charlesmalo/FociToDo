-- Up Migration
CREATE TABLE todos (
  id            uuid          PRIMARY KEY,
  title         varchar(200)  NOT NULL CHECK (length(btrim(title)) > 0),
  description   varchar(2000),
  due_date      date,
  is_completed  boolean       NOT NULL DEFAULT false,
  created_at    timestamptz   NOT NULL,
  version       integer       NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE INDEX todos_created_at_idx ON todos (created_at DESC, id);

-- Down Migration
DROP TABLE todos;
