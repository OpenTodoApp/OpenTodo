package audit

import (
	"context"
	"time"
)

// pruneBatch keeps each delete short so the single write connection stays
// responsive while a large backlog is pruned (design D5).
const pruneBatch = 1000

// PruneInterval is how often RunPruner prunes after the initial run.
const PruneInterval = time.Hour

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

// AlsoPrune adds a cleanup of other expired server rows (pending sign-ups) to
// the pruner's tick, so the server keeps one hourly background loop. Call it
// before RunPruner.
func (r *Recorder) AlsoPrune(fn func(context.Context) (int64, error)) {
	if r != nil {
		r.alsoPrune = append(r.alsoPrune, fn)
	}
}

// RunPruner prunes once immediately and then every interval until ctx is done.
// Run it in its own goroutine.
func (r *Recorder) RunPruner(ctx context.Context, interval time.Duration) {
	if r == nil {
		return
	}
	run := func() {
		n, err := r.Prune(ctx)
		if err != nil && ctx.Err() == nil {
			r.log.Error("audit: prune failed", "err", err)
		} else if n > 0 {
			r.log.Info("audit: pruned expired events", "count", n)
		}
		for _, fn := range r.alsoPrune {
			if _, err := fn(ctx); err != nil && ctx.Err() == nil {
				r.log.Error("prune failed", "err", err)
			}
		}
	}
	run()
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			run()
		}
	}
}
