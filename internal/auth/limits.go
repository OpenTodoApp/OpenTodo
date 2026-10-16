package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// ErrMemberLimit refuses a new account once a hosted tenant holds as many
// active accounts as its limit allows (OpenSpec `multi-tenant-host`, D5).
var ErrMemberLimit = errors.New("this server reached its limit of members")

// SetMemberLimit caps the active accounts (0 means no limit). Only a host sets
// it; the first account (the owner) is always allowed.
func (s *Service) SetMemberLimit(n int) { s.maxMembers = n }

// MemberLimit is the configured cap; 0 means none.
func (s *Service) MemberLimit() int { return s.maxMembers }

// checkMemberLimit runs inside the transaction that creates an account and
// refuses it with ErrMemberLimit when the cap is reached. Deactivated accounts
// do not count.
func (s *Service) checkMemberLimit(ctx context.Context, tx *sql.Tx) error {
	if s.maxMembers <= 0 {
		return nil
	}
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users u
		WHERE NOT EXISTS (SELECT 1 FROM user_status st WHERE st.user_id = u.id AND st.deactivated_at IS NOT NULL)`).Scan(&n); err != nil {
		return fmt.Errorf("count members: %w", err)
	}
	if n >= s.maxMembers {
		return ErrMemberLimit
	}
	return nil
}
