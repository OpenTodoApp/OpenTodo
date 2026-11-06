package audit

import (
	"context"
	"database/sql"
	"time"
)

// pruneBatch keeps each delete short so the single write connection stays
// responsive while a large backlog is pruned (design D5).
const pruneBatch = 1000

// Prune deletes events older than the configured retention, in batches, and
// returns how many were removed. Pruning by retention and address scrubbing are
// the only removals the log knows.
//
// It removes the oldest events in id order and stops at the first one still
// within the retention, so the log keeps a contiguous run of the hash chain;
// each batch moves the chain's checkpoint to the last event it removed, in the
// same transaction, so the events kept still verify (`audit-hash-chain`).
func (r *Recorder) Prune(ctx context.Context) (int64, error) {
	if r == nil {
		return 0, nil
	}
	set, err := loadSettings(ctx, r.db)
	if err != nil {
		return 0, err
	}
	cutoff := r.now().Add(-time.Duration(set.RetentionDays) * 24 * time.Hour).UnixMilli()
	var total int64
	for {
		n, err := r.pruneBatch(ctx, cutoff)
		total += n
		if err != nil || n < pruneBatch {
			return total, err
		}
		if err := ctx.Err(); err != nil {
			return total, err
		}
	}
}

func (r *Recorder) pruneBatch(ctx context.Context, cutoff int64) (int64, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	// The last event of the batch: at most pruneBatch events from the start of
	// the log, all before the first event still within the retention.
	var last ChainHead
	var hash sql.NullString
	var n int64
	err = tx.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(MAX(id), 0) FROM (SELECT id FROM audit_events
			WHERE id < COALESCE((SELECT MIN(id) FROM audit_events WHERE ts >= ?), 9223372036854775807)
			ORDER BY id LIMIT ?)`, cutoff, pruneBatch).Scan(&n, &last.ID)
	if err != nil || n == 0 {
		return 0, err
	}
	if err := tx.QueryRowContext(ctx, "SELECT hash FROM audit_events WHERE id = ?", last.ID).Scan(&hash); err != nil {
		return 0, err
	}
	last.Hash = hash.String
	if _, err := tx.ExecContext(ctx, "DELETE FROM audit_events WHERE id <= ?", last.ID); err != nil {
		return 0, err
	}
	c, err := checkpoint(ctx, tx)
	if err != nil {
		return 0, err
	}
	if last.ID > c.ID {
		// The batch reached chained events: the next kept event chains from the
		// last one removed.
		if _, err := tx.ExecContext(ctx, `INSERT INTO audit_chain(id, after_id, hash) VALUES(1, ?, ?)
			ON CONFLICT(id) DO UPDATE SET after_id = excluded.after_id, hash = excluded.hash`, last.ID, last.Hash); err != nil {
			return 0, err
		}
	}
	return n, tx.Commit()
}
