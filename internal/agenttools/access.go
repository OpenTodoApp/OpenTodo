package agenttools

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/pixari/opentodo/internal/audit"
)

// AccessSetting names the per-user switch in settings.changed audit events.
const AccessSetting = "agent.writes"

// Access stores each user's "Allow AI assistants to make changes" switch
// (design D3) in user_agent_access. No row means off. It is account state,
// not an op: never synced, exported or changed by an assistant.
type Access struct {
	db  *sql.DB
	now func() time.Time
}

// NewAccess wires the switch over the database.
func NewAccess(db *sql.DB) *Access { return &Access{db: db, now: time.Now} }

// AllowsWrites reports the user's switch. Errors read as off at call sites.
func (a *Access) AllowsWrites(ctx context.Context, userID string) (bool, error) {
	var v int
	err := a.db.QueryRowContext(ctx, `SELECT allow_writes FROM user_agent_access WHERE user_id = ?`, userID).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read agent access: %w", err)
	}
	return v == 1, nil
}

// Set changes the user's own switch and, when it changes, records
// settings.changed (setting agent.writes) in the same transaction.
func (a *Access) Set(ctx context.Context, userID string, on bool, rec *audit.Recorder) error {
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var old int
	if err := tx.QueryRowContext(ctx, `SELECT allow_writes FROM user_agent_access WHERE user_id = ?`, userID).Scan(&old); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("read agent access: %w", err)
	}
	v := 0
	if on {
		v = 1
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO user_agent_access(user_id, allow_writes, updated_at) VALUES(?,?,?)
		ON CONFLICT(user_id) DO UPDATE SET allow_writes = excluded.allow_writes, updated_at = excluded.updated_at`,
		userID, v, a.now().UnixMilli()); err != nil {
		return fmt.Errorf("store agent access: %w", err)
	}
	if old != v && rec != nil {
		if err := rec.RecordTx(ctx, tx, audit.SettingsChanged(userID, AccessSetting, fmt.Sprint(old == 1), fmt.Sprint(on))); err != nil {
			return err
		}
	}
	return tx.Commit()
}
