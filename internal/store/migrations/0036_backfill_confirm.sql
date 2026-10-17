-- Member backfill pages are confirmed by the device (OpenSpec change
-- sync-convergence): served_seq is the end of the last page of a joined
-- project's history served to a device that confirms pages; the device's
-- member_backfills.done_seq moves there only when the device echoes it. A side
-- table rather than ALTER TABLE ADD COLUMN, which SQLite cannot run
-- idempotently; the trigger drops a row with its member_backfills row.
CREATE TABLE IF NOT EXISTS member_backfill_served (
  project_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  device     TEXT NOT NULL,
  served_seq INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id, device)
);

CREATE TRIGGER IF NOT EXISTS member_backfill_served_cleanup AFTER DELETE ON member_backfills
BEGIN
  DELETE FROM member_backfill_served
  WHERE project_id = OLD.project_id AND user_id = OLD.user_id AND device = OLD.device;
END;
