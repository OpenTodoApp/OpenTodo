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

// migrateEmailVerified adds users.email_verified_at (sso-email-verified D1):
// when the account's address was last shown to belong to its holder (a
// confirmed email change or sign-up, or a provider identity with a verified
// address). Single sign-on links to an existing account by email only while it
// is set. When the column is added, accounts whose provider identity carries
// the same address count as verified; the others link from Settings while
// signed in. A Go step rather than a numbered file because ALTER TABLE ADD
// COLUMN cannot be repeated (see 0037).
func migrateEmailVerified(ctx context.Context, db *sql.DB) error {
	var has int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'email_verified_at'`).Scan(&has); err != nil {
		return err
	}
	if has > 0 {
		return nil
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `ALTER TABLE users ADD COLUMN email_verified_at INTEGER`); err != nil {
		return fmt.Errorf("add users.email_verified_at: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET email_verified_at = created_at
		WHERE id IN (SELECT user_id FROM identities WHERE identities.email = users.email)`); err != nil {
		return fmt.Errorf("backfill users.email_verified_at: %w", err)
	}
	return tx.Commit()
}
