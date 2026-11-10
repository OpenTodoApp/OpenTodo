package auth

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// Signed-in apps (OpenSpec change native-app-foundation, design D5). The
// OpenTodo app's grants live in app_sign_in_grant (internal/mcpoauth); their
// access tokens are API tokens of the `app` scope. Ending every session of an
// account ends them too.

// CreateAppToken mints an access token of the app for userID that stops
// working at expiresAt.
func (s *Service) CreateAppToken(ctx context.Context, userID, name string, expiresAt time.Time) (*Token, string, error) {
	if expiresAt.IsZero() {
		return nil, "", fmt.Errorf("auth: an app token needs an expiry")
	}
	return s.createToken(ctx, userID, name, ScopeApp, expiresAt)
}

// endAppSessionsTx revokes every signed-in app of userID in tx: the grants,
// so no refresh token works, and their access tokens, so the next request is
// refused.
func endAppSessionsTx(ctx context.Context, tx *sql.Tx, userID string) error {
	for _, q := range []string{
		"DELETE FROM api_tokens WHERE user_id = ? AND id IN (SELECT token_id FROM api_token_app)",
		"DELETE FROM app_sign_in_grant WHERE user_id = ?",
	} {
		if _, err := tx.ExecContext(ctx, q, userID); err != nil {
			return fmt.Errorf("end app sessions: %w", err)
		}
	}
	return nil
}
