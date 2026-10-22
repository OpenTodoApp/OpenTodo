package store

import (
	"context"
	"database/sql"
	"fmt"
)

// migrateProfileColumns adds the picture provenance columns of
// oidc-profile-pictures to user_profiles when missing (ALTER TABLE ADD COLUMN
// cannot be repeated, see 0037). Idempotent, one query when nothing to do.
func migrateProfileColumns(ctx context.Context, db *sql.DB) error {
	for _, col := range []string{"avatar_source", "avatar_provider_url"} {
		var has int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('user_profiles') WHERE name = ?`, col).Scan(&has); err != nil {
			return err
		}
		if has == 0 {
			if _, err := db.ExecContext(ctx, `ALTER TABLE user_profiles ADD COLUMN `+col+` TEXT`); err != nil {
				return fmt.Errorf("add user_profiles.%s: %w", col, err)
			}
		}
	}
	return nil
}
