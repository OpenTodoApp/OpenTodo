package store

import (
	"context"
	"database/sql"
	"fmt"
)

// assistantUsageCachedColumns are the columns OpenSpec change
// assistant-usage-cache adds (design D2): input read from and written to the
// provider's prompt cache, apart from fresh input_tokens. Rows recorded before
// hold 0 (their cached input is in input_tokens), so their totals don't
// change. Server state, never synced or exported.
var assistantUsageCachedColumns = []struct{ table, name string }{
	{"assistant_usage", "cached_read"},
	{"assistant_usage", "cached_write"},
	{"assistant_usage_own_key", "cached_read"},
	{"assistant_usage_own_key", "cached_write"},
}

// migrateAssistantUsageCached adds the cached usage columns when missing
// (ALTER TABLE ADD COLUMN cannot be repeated, see 0037).
func migrateAssistantUsageCached(ctx context.Context, db *sql.DB) error {
	for _, c := range assistantUsageCachedColumns {
		var exists int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?`, c.table, c.name).Scan(&exists); err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		if _, err := db.ExecContext(ctx, `ALTER TABLE `+c.table+` ADD COLUMN `+c.name+` INTEGER NOT NULL DEFAULT 0`); err != nil {
			return fmt.Errorf("add %s.%s: %w", c.table, c.name, err)
		}
	}
	return nil
}
