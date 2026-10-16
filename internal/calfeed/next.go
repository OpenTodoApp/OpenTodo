package calfeed

import (
	"context"
	"database/sql"
	"time"
)

// NextFetch is the earliest time a subscription is due for a fetch; ok is
// false when none is (a host's "next due" index, OpenSpec `multi-tenant-host`).
func (s *Store) NextFetch(ctx context.Context) (time.Time, bool, error) {
	var at sql.NullInt64
	err := s.db.QueryRowContext(ctx, `SELECT MIN(next_fetch_at) FROM calendar_subscriptions
		WHERE enabled = 1 AND stopped_reason IS NULL`).Scan(&at)
	if err != nil || !at.Valid {
		return time.Time{}, false, err
	}
	return time.UnixMilli(at.Int64), true, nil
}
