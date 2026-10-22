package store

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/pixari/opentodo/internal/ids"
)

// DefaultWorkspaceName is the name of every account's default workspace until
// it is renamed (OpenSpec change workspaces); clients translate it.
const DefaultWorkspaceName = "Personal"

// DefaultWorkspaceID is the id of userID's default workspace: derived, so it
// needs no lookup (workspaces design D4).
func DefaultWorkspaceID(userID string) string { return ids.NameID("workspace", userID) }

// Execer is the part of *sql.DB and *sql.Tx that EnsureDefaultWorkspace needs.
type Execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// EnsureDefaultWorkspace creates userID's default workspace and its owner row
// when they are missing; account creation calls it in the same transaction as
// the users row. Running it again changes nothing.
func EnsureDefaultWorkspace(ctx context.Context, q Execer, userID string, nowMs int64) error {
	id := DefaultWorkspaceID(userID)
	if _, err := q.ExecContext(ctx, `INSERT OR IGNORE INTO workspaces(id,kind,owner_id,name,created_at) VALUES(?,'default',?,?,?)`,
		id, userID, DefaultWorkspaceName, nowMs); err != nil {
		return fmt.Errorf("create default workspace: %w", err)
	}
	if _, err := q.ExecContext(ctx, `INSERT OR IGNORE INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,'owner',?)`,
		id, userID, nowMs); err != nil {
		return fmt.Errorf("create default workspace member: %w", err)
	}
	return nil
}

// migrateWorkspaces is the part of migration 0045_workspaces that SQL cannot
// do, run on every open once the tables exist: it adds project_members.via
// when missing and gives every account without one its default workspace.
// Both steps are idempotent and cost one query each when there is nothing to do.
func migrateWorkspaces(ctx context.Context, db *sql.DB) error {
	var hasTable int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'`).Scan(&hasTable); err != nil || hasTable == 0 {
		return err
	}
	var hasVia int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('project_members') WHERE name = 'via'`).Scan(&hasVia); err != nil {
		return err
	}
	if hasVia == 0 {
		if _, err := db.ExecContext(ctx, `ALTER TABLE project_members ADD COLUMN via TEXT NOT NULL DEFAULT ''`); err != nil {
			return fmt.Errorf("add project_members.via: %w", err)
		}
	}
	rows, err := db.QueryContext(ctx, `SELECT u.id FROM users u
		WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_id = u.id AND w.kind = 'default') ORDER BY u.id`)
	if err != nil {
		return err
	}
	var missing []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		missing = append(missing, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil || len(missing) == 0 {
		return err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := NowMillis()
	for _, id := range missing {
		if err := EnsureDefaultWorkspace(ctx, tx, id, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}
