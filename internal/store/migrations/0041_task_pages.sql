-- Task pages (OpenSpec change `task-pages`, design D6): one task published as a
-- page that people without an account can open, reply to and tick. Only a hash
-- of the secret is stored. task_id names an op-log entity, so it has no foreign
-- key. A page is active while revoked_at is null and expires_at is null or in the
-- future; at most one active page per task.
--
-- For a task the server holds as ciphertext, snapshot is the page encrypted by
-- the publisher's device with a share key the server never sees, wrapped_key that
-- share key encrypted with the account key (opaque here), and task_page_replies
-- the guests' encrypted replies waiting for a device to import them.
-- task_page_actions remembers the name a guest typed for each write, so history
-- can say "<name> (guest, task page)".
--
-- Server-side account data: never synced, never written to the op log, not in the
-- user export. Every statement is idempotent so the migration is safe to re-run.
CREATE TABLE IF NOT EXISTS task_pages (
  id               TEXT PRIMARY KEY,
  task_id          TEXT NOT NULL,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_hash      TEXT NOT NULL UNIQUE,
  rights           TEXT NOT NULL CHECK (rights IN ('view','reply','tick')),
  label            TEXT,
  include_map      INTEGER NOT NULL DEFAULT 1,
  expires_at       INTEGER,
  published_at     INTEGER NOT NULL,
  revoked_at       INTEGER,
  last_opened_at   INTEGER,
  snapshot         BLOB,
  snapshot_version INTEGER NOT NULL DEFAULT 0,
  snapshot_at      INTEGER,
  wrapped_key      BLOB,
  replies          INTEGER NOT NULL DEFAULT 0,
  ticks            INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS task_pages_active ON task_pages(task_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS task_pages_user ON task_pages(user_id);

CREATE TABLE IF NOT EXISTS task_page_replies (
  id         TEXT PRIMARY KEY,
  page_id    TEXT NOT NULL REFERENCES task_pages(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS task_page_replies_page ON task_page_replies(page_id);

CREATE TABLE IF NOT EXISTS task_page_actions (
  page_id TEXT NOT NULL REFERENCES task_pages(id) ON DELETE CASCADE,
  ts      INTEGER NOT NULL,
  name    TEXT NOT NULL,
  PRIMARY KEY (page_id, ts)
);
