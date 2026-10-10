CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',
  created_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE api_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX api_tokens_user ON api_tokens(user_id);

-- Append-only log of field-level operations. This is the source of truth for sync.
CREATE TABLE ops (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  op_id       TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  field       TEXT NOT NULL,
  value       TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  device      TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  UNIQUE (user_id, op_id)
);
CREATE INDEX ops_user_seq ON ops(user_id, seq);

-- Current winning value per field (last-writer-wins by (ts, device)).
CREATE TABLE fields (
  user_id   TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field     TEXT NOT NULL,
  value     TEXT NOT NULL,
  ts        INTEGER NOT NULL,
  device    TEXT NOT NULL,
  PRIMARY KEY (user_id, entity, entity_id, field)
);
