-- issue-import (design D4): a user's connections to GitHub or GitLab and the
-- issues each one linked to a task. Server data only: nothing here is in the op
-- log or the export; tokens live in <data>/secrets/issues.json, never here.
CREATE TABLE IF NOT EXISTS issue_connections (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,             -- github | gitlab
  host             TEXT NOT NULL,             -- https://github.com, a self-hosted instance
  name             TEXT NOT NULL DEFAULT '',
  project_id       TEXT,                      -- target project; NULL is the Inbox
  filter           TEXT NOT NULL DEFAULT '{"scope":"assigned"}',
  map_labels       INTEGER NOT NULL DEFAULT 0,
  enabled          INTEGER NOT NULL DEFAULT 1,
  interval_seconds INTEGER NOT NULL,          -- the configured interval
  backoff_seconds  INTEGER NOT NULL DEFAULT 0, -- the current wait after failures, 0 when healthy
  next_poll_at     INTEGER NOT NULL,
  last_poll_at     INTEGER,
  last_success_at  INTEGER,
  last_error       TEXT NOT NULL DEFAULT '',
  last_error_at    INTEGER,
  stopped_reason   TEXT,                      -- stops polling until the user acts
  etag             TEXT NOT NULL DEFAULT '{}', -- JSON: ETag of each listing's first page
  since_ms         INTEGER NOT NULL DEFAULT 0, -- updated-since cursor
  repo_index       INTEGER NOT NULL DEFAULT 0, -- listing a partial run continues with
  page             INTEGER NOT NULL DEFAULT 0, -- next page of a partial run, 0 when none
  reconciled_at    INTEGER,                    -- last full listing of the open issues
  account_login    TEXT NOT NULL DEFAULT '',
  can_read_issues  INTEGER,
  last_run         TEXT NOT NULL DEFAULT '{}', -- counts of the last poll
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS issue_connections_user ON issue_connections(user_id);
CREATE INDEX IF NOT EXISTS issue_connections_due ON issue_connections(next_poll_at);

CREATE TABLE IF NOT EXISTS issue_links (
  connection_id    TEXT NOT NULL REFERENCES issue_connections(id) ON DELETE CASCADE,
  issue_key        TEXT NOT NULL,             -- owner/repo#123, group/project#45
  task_id          TEXT NOT NULL,
  title            TEXT NOT NULL DEFAULT '',  -- what the poll last saw
  state            TEXT NOT NULL DEFAULT 'open',
  closed_at        INTEGER,
  labels           TEXT NOT NULL DEFAULT '[]', -- ids of the labels the poll mapped
  issue_updated_ms INTEGER NOT NULL DEFAULT 0,
  matched          INTEGER NOT NULL DEFAULT 1, -- 0 once the issue no longer matches the filter
  created_at       INTEGER NOT NULL,
  PRIMARY KEY (connection_id, issue_key)
);
CREATE INDEX IF NOT EXISTS issue_links_task ON issue_links(task_id);
