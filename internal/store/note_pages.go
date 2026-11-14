package store

import (
	"context"
	"database/sql"
	"fmt"
)

// migrateNotePages gives task_pages the kind and note_id columns of note pages
// (note-public-links D1, migration 0073) and the one-active-page indexes per
// kind. Pages written before are task pages. A Go step because ALTER TABLE ADD
// COLUMN cannot be repeated (see 0037); a database whose task_pages table is
// missing (not migrated that far) is left alone.
func migrateNotePages(ctx context.Context, db *sql.DB) error {
	var table, has int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'task_pages'`).Scan(&table); err != nil || table == 0 {
		return err
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('task_pages') WHERE name = 'note_id'`).Scan(&has); err != nil {
		return err
	}
	if has > 0 {
		return nil
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, q := range []string{
		`ALTER TABLE task_pages ADD COLUMN kind TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task','note'))`,
		`ALTER TABLE task_pages ADD COLUMN note_id TEXT`,
		`DROP INDEX IF EXISTS task_pages_active`,
		`CREATE UNIQUE INDEX IF NOT EXISTS task_pages_active ON task_pages(task_id) WHERE revoked_at IS NULL AND kind = 'task'`,
		`CREATE UNIQUE INDEX IF NOT EXISTS task_pages_note_active ON task_pages(note_id) WHERE revoked_at IS NULL AND kind = 'note'`,
	} {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return fmt.Errorf("note pages: %w", err)
		}
	}
	return tx.Commit()
}
