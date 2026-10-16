package webhook

import (
	"context"
	"database/sql"
	"time"
)

// NextDue is the earliest queued delivery of an enabled webhook; ok is false
// when nothing is queued (a host's "next due" index, OpenSpec
// `multi-tenant-host`).
func (s *Service) NextDue(ctx context.Context) (time.Time, bool, error) {
	var at sql.NullInt64
	err := s.db.QueryRowContext(ctx, `SELECT MIN(d.next_attempt_at) FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id
		WHERE d.status IN ('pending','retry') AND w.enabled = 1`).Scan(&at)
	if err != nil || !at.Valid {
		return time.Time{}, false, err
	}
	return time.UnixMilli(at.Int64), true, nil
}

// NextPrune is when the oldest delivery leaves the log (LogRetention).
func (s *Service) NextPrune(ctx context.Context) (time.Time, bool, error) {
	var at sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `SELECT MIN(created_at) FROM webhook_deliveries`).Scan(&at); err != nil || !at.Valid {
		return time.Time{}, false, err
	}
	return time.UnixMilli(at.Int64).Add(LogRetention), true, nil
}
