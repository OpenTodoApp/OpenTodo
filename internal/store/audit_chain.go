package store

import (
	"context"
	"database/sql"
)

// migrateAuditChain adds audit_events.hash, each event's link in the audit log's
// hash chain (OpenSpec change audit-hash-chain, migration 0060), when missing:
// ALTER TABLE ADD COLUMN cannot be repeated (see 0037), so this is a Go step.
// Events from before it keep a NULL hash and are not covered by the chain.
func migrateAuditChain(ctx context.Context, db *sql.DB) error {
	var exists int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('audit_events') WHERE name = 'hash'`).Scan(&exists); err != nil || exists > 0 {
		return err
	}
	_, err := db.ExecContext(ctx, `ALTER TABLE audit_events ADD COLUMN hash TEXT`)
	return err
}
