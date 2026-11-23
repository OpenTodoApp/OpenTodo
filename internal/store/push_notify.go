package store

import (
	"context"
	"database/sql"
	"fmt"
)

// pushNotifyColumns are a device's choices of assignment and status pushes
// (OpenSpec change assignee-notifications, design D2), off until the user turns
// them on. Device state like include_content: never synced, never an op, not in
// the export.
var pushNotifyColumns = []string{"notify_assigned", "notify_status"}

// migratePushNotify adds the columns when missing (ALTER TABLE ADD COLUMN
// cannot be repeated, see 0037).
func migratePushNotify(ctx context.Context, db *sql.DB) error {
	for _, name := range pushNotifyColumns {
		var exists int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('push_subscriptions') WHERE name = ?`, name).Scan(&exists); err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		if _, err := db.ExecContext(ctx, `ALTER TABLE push_subscriptions ADD COLUMN `+name+` INTEGER NOT NULL DEFAULT 0`); err != nil {
			return fmt.Errorf("add push_subscriptions.%s: %w", name, err)
		}
	}
	return nil
}
