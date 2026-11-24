package store

import (
	"context"
	"database/sql"
)

// migrateWorkspaceFeatures adds workspaces.features, the workspace's feature
// switches as a JSON object (OpenSpec change workspace-feature-switches D2,
// migration 0075), when missing: ALTER TABLE ADD COLUMN cannot be repeated (see
// 0037), so this is a Go step. Existing workspaces keep NULL, which reads as
// every feature on. A database without the workspaces table is left alone.
func migrateWorkspaceFeatures(ctx context.Context, db *sql.DB) error {
	var table, has int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'`).Scan(&table); err != nil || table == 0 {
		return err
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('workspaces') WHERE name = 'features'`).Scan(&has); err != nil || has > 0 {
		return err
	}
	_, err := db.ExecContext(ctx, `ALTER TABLE workspaces ADD COLUMN features TEXT`)
	return err
}
