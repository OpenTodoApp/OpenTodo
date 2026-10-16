package audit

import (
	"context"
	"database/sql"
	"time"
)

// NextPrune is when the oldest event passes the owner's retention; ok is false
// when the log is empty (a host's "next due" index, OpenSpec `multi-tenant-host`).
func (r *Recorder) NextPrune(ctx context.Context) (time.Time, bool, error) {
	if r == nil {
		return time.Time{}, false, nil
	}
	set, err := loadSettings(ctx, r.db)
	if err != nil {
		return time.Time{}, false, err
	}
	var ts sql.NullInt64
	if err := r.db.QueryRowContext(ctx, "SELECT MIN(ts) FROM audit_events").Scan(&ts); err != nil || !ts.Valid {
		return time.Time{}, false, err
	}
	return time.UnixMilli(ts.Int64).Add(time.Duration(set.RetentionDays) * 24 * time.Hour), true, nil
}
