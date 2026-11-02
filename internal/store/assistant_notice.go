package store

import (
	"context"
	"database/sql"
	"fmt"
)

// migrateAssistantNotice adds assistant_consent.seen_version (OpenSpec change
// assistant-disclosure-notice D1): the disclosure version whose notice the
// person dismissed, 0 = none. Server state, never synced or exported. ALTER
// TABLE ADD COLUMN cannot be repeated (see 0037), so this is a Go step.
func migrateAssistantNotice(ctx context.Context, db *sql.DB) error {
	var exists int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('assistant_consent') WHERE name = 'seen_version'`).Scan(&exists); err != nil {
		return err
	}
	if exists > 0 {
		return nil
	}
	if _, err := db.ExecContext(ctx, `ALTER TABLE assistant_consent ADD COLUMN seen_version INTEGER NOT NULL DEFAULT 0`); err != nil {
		return fmt.Errorf("add assistant_consent.seen_version: %w", err)
	}
	return nil
}
