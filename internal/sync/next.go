package sync

import (
	"context"
	"database/sql"
	"time"
)

// NextRetention is when the oldest item in the Trash (a tombstoned task,
// project or attachment) outlives a retention of days; ok is false when the
// Trash is empty or days <= 0 (a host's "next due" index, OpenSpec
// `multi-tenant-host`).
func (s *Service) NextRetention(ctx context.Context, days int) (time.Time, bool, error) {
	if days <= 0 {
		return time.Time{}, false, nil
	}
	var at sql.NullFloat64
	err := s.db.QueryRowContext(ctx, `SELECT MIN(CAST(value AS REAL)) FROM scope_fields
		WHERE field = 'deleted_at' AND entity IN ('project','task','attachment') AND value != 'null'`).Scan(&at)
	if err != nil || !at.Valid {
		return time.Time{}, false, err
	}
	return time.UnixMilli(int64(at.Float64)).Add(time.Duration(days) * 24 * time.Hour), true, nil
}
