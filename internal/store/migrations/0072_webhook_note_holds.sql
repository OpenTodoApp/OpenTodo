-- Note events wait for quiet (OpenSpec change note-webhooks, design D2): one
-- held event per webhook and note, released as one delivery once the note has
-- been unchanged for 5 minutes (at most 30 after the first held change).
-- Server state only: never synced, never exported, removed with its webhook.
CREATE TABLE IF NOT EXISTS webhook_note_holds (
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  note_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  event      TEXT NOT NULL,             -- note.created or note.updated
  fields     TEXT NOT NULL,             -- JSON: field -> {from, to}, first from and latest to
  origin     TEXT NOT NULL DEFAULT '',  -- the device of the latest change
  first_at   INTEGER NOT NULL,
  last_at    INTEGER NOT NULL,
  release_at INTEGER NOT NULL,
  PRIMARY KEY (webhook_id, note_id)
);
CREATE INDEX IF NOT EXISTS webhook_note_holds_release ON webhook_note_holds(release_at);
