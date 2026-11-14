-- Note pages (OpenSpec change `note-public-links`, design D1): one standalone
-- note published as a read-only page, in the task page table. The table gains
-- kind ('task' | 'note') and note_id; a note page keeps task_id empty, so every
-- task page query (by task_id) never sees it, and at most one active page per
-- task and per note is enforced by two partial unique indexes. The columns and
-- the indexes are the Go step store.migrateNotePages, because ALTER TABLE ADD
-- COLUMN cannot be repeated (see 0037). Server-side account data like the task
-- pages: never synced, never written to the op log, not in the user export.
SELECT 1;
