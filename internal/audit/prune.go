package audit

import (
	"context"
	"time"
)

// pruneBatch keeps each delete short so the single write connection stays
// responsive while a large backlog is pruned (design D5).
const pruneBatch = 1000

// Prune deletes events older than the configured retention, in batches, and
// returns how many were removed. Pruning by retention and address scrubbing are
// the only removals the log knows.
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
		res, err := r.db.ExecContext(ctx,
			"DELETE FROM audit_events WHERE id IN (SELECT id FROM audit_events WHERE ts < ? ORDER BY id LIMIT ?)", cutoff, pruneBatch)
		if err != nil {
			return total, err
		}
		n, _ := res.RowsAffected()
		total += n
		if n < pruneBatch {
			return total, nil
		}
		if err := ctx.Err(); err != nil {
			return total, err
		}
	}
}
