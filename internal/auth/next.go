package auth

import (
	"context"
	"database/sql"
	"time"
)

// NextSignupExpiry is when the first pending sign-up expires; ok is false when
// none is pending (a host's "next due" index, OpenSpec `multi-tenant-host`).
func (s *Service) NextSignupExpiry(ctx context.Context) (time.Time, bool, error) {
	var at sql.NullInt64
	if err := s.db.QueryRowContext(ctx, "SELECT MIN(expires_at) FROM signup_verifications").Scan(&at); err != nil || !at.Valid {
		return time.Time{}, false, err
	}
	return time.UnixMilli(at.Int64), true, nil
}
