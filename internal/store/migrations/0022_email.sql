-- Email to task (OpenSpec change `email-to-task`, design D4). Additive and
-- idempotent: every statement can run again without error, so the file survives
-- renumbering when sibling changes land first. Nothing here is synced: the inbox
-- address is an account setting like an API token, and receipts are bookkeeping.

-- One row per account that opened the email section. The secret is the
-- sub-address part of todo+<secret>@example.com: stored in plaintext so
-- Settings can show the address again; it only grants task creation.
CREATE TABLE IF NOT EXISTS email_inboxes (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret         TEXT NOT NULL UNIQUE,
  enabled        INTEGER NOT NULL DEFAULT 1,
  allowlist_json TEXT NOT NULL DEFAULT '[]',
  created_at     INTEGER NOT NULL,
  rotated_at     INTEGER
);

-- Message-IDs already turned into tasks, per account: a re-poll, a restart in
-- the middle of a batch or a message delivered twice creates one task. Also the
-- source of the rolling hourly cap. Rows older than 90 days are pruned.
CREATE TABLE IF NOT EXISTS email_receipts (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id  TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS email_receipts_time ON email_receipts(user_id, received_at);
