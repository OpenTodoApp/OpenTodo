package sync

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"time"
)

// DeleteAccountData removes an account's server data inside the account
// deletion transaction (OpenSpec change `user-management`, design D4, with the
// `beforeDelete` hook that project-sharing fills in). It is called by the auth
// service before the users row is deleted and returns every other account whose
// devices must be told (members of projects the account owned or belonged to).
//
//   - The personal scope (`user:<id>`): its ops, scope labels and materialized
//     fields are deleted.
//   - Shared projects the account owns: transfer is out of scope, so the project
//     is deleted for everyone, as the spec says ("its projects are deleted"):
//     its ops, fields, members and scope go. Members' devices purge it on their
//     next sync because their membership list no longer contains it, exactly as
//     after being removed from a project, so all devices converge.
//   - Shared projects owned by someone else: only the membership goes. Ops the
//     account authored there are kept; they are part of the project's history
//     that other members (and future members' backfill) rely on to converge.
//     Tasks assigned to the account there are unassigned by server ops
//     authored by the project's owner, as when a member leaves (task-assignment
//     "Unassign on departure", sync-convergence).
//
// This form has no service: its unassignments are stamped with the wall clock
// and observers are not told. The server wires Service.DeleteAccountData.
func DeleteAccountData(ctx context.Context, tx *sql.Tx, userID string) ([]string, error) {
	return (&Service{now: time.Now}).DeleteAccountData(ctx, tx, userID)
}

type deletionKey struct{}

// AccountDeletion collects the winning changes Service.DeleteAccountData wrote
// inside the deletion transaction, for the observer once it committed.
type AccountDeletion struct{ changes []Change }

// WithAccountDeletion returns a context for an account deletion whose changes
// are collected in the returned value; pass it to ObserveAccountDeletion after
// the deletion committed.
func WithAccountDeletion(ctx context.Context) (context.Context, *AccountDeletion) {
	d := &AccountDeletion{}
	return context.WithValue(ctx, deletionKey{}, d), d
}

// ObserveAccountDeletion hands the unassignments of a committed account
// deletion to the post-commit observer (webhooks), like RemoveMember does.
func (s *Service) ObserveAccountDeletion(ctx context.Context, d *AccountDeletion) {
	if d == nil || s.observer == nil || len(d.changes) == 0 {
		return
	}
	s.observer(context.WithoutCancel(ctx), d.changes)
}

// DeleteAccountData is the account deletion hook (see the package function of
// the same name): its unassignments use the service's server clock, and their
// changes are collected when ctx comes from WithAccountDeletion.
func (s *Service) DeleteAccountData(ctx context.Context, tx *sql.Tx, userID string) ([]string, error) {
	notify := map[string]bool{}

	owned, err := stringColumn(ctx, tx, `SELECT project_id FROM project_scopes WHERE owner_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	for _, pid := range owned {
		users, err := scopeUsers(ctx, tx, ProjectScope(pid))
		if err != nil {
			return nil, err
		}
		for _, u := range users {
			notify[u] = true
		}
		if err := deleteScope(ctx, tx, ProjectScope(pid)); err != nil {
			return nil, err
		}
		for _, q := range []string{
			`DELETE FROM project_members WHERE project_id = ?`,
			`DELETE FROM member_backfills WHERE project_id = ?`,
			`DELETE FROM project_scopes WHERE project_id = ?`,
		} {
			if _, err := tx.ExecContext(ctx, q, pid); err != nil {
				return nil, err
			}
		}
	}

	joined, err := stringColumn(ctx, tx, `SELECT project_id FROM project_members WHERE user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	for _, pid := range joined {
		users, err := scopeUsers(ctx, tx, ProjectScope(pid))
		if err != nil {
			return nil, err
		}
		for _, u := range users {
			notify[u] = true
		}
		var owner string
		if err := tx.QueryRowContext(ctx, `SELECT owner_id FROM project_scopes WHERE project_id = ?`, pid).Scan(&owner); err != nil {
			return nil, fmt.Errorf("owner of project %s: %w", pid, err)
		}
		_, changes, err := s.unassignDeparted(ctx, tx, owner, pid, userID)
		if err != nil {
			return nil, fmt.Errorf("unassign deleted account: %w", err)
		}
		if d, ok := ctx.Value(deletionKey{}).(*AccountDeletion); ok {
			d.changes = append(d.changes, changes...)
		}
	}
	for _, q := range []string{
		`DELETE FROM project_members WHERE user_id = ?`,
		`DELETE FROM member_backfills WHERE user_id = ?`,
		`DELETE FROM project_grants WHERE subject_kind = 'user' AND subject_id = ?`,
		`DELETE FROM project_grants WHERE project_id IN (SELECT project_id FROM project_scopes WHERE owner_id = ?)`,
	} {
		if _, err := tx.ExecContext(ctx, q, userID); err != nil {
			return nil, err
		}
	}

	if err := deleteScope(ctx, tx, PersonalScope(userID)); err != nil {
		return nil, err
	}
	if err := handOverWorkspaces(ctx, tx, userID, notify); err != nil {
		return nil, err
	}

	delete(notify, userID)
	out := make([]string, 0, len(notify))
	for u := range notify {
		out = append(out, u)
	}
	sort.Strings(out)
	return out, nil
}

// deleteScope removes every op, scope label and materialized field of a scope.
func deleteScope(ctx context.Context, tx *sql.Tx, scope string) error {
	for _, q := range []string{
		`DELETE FROM ops WHERE seq IN (SELECT seq FROM op_scopes WHERE scope_id = ?)`,
		`DELETE FROM op_scopes WHERE scope_id = ?`,
		`DELETE FROM scope_fields WHERE scope_id = ?`,
	} {
		if _, err := tx.ExecContext(ctx, q, scope); err != nil {
			return err
		}
	}
	return nil
}

func stringColumn(ctx context.Context, q querier, query string, args ...any) ([]string, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// WorkspaceHandover is what happened to one created workspace a deleted
// account owned (workspaces design D10), for the audit event.
type WorkspaceHandover struct {
	WorkspaceID string
	// NewOwner is the account that owns it now, "" when it was deleted.
	NewOwner string
}

type handoverKey struct{}

// WithWorkspaceHandovers returns a context in which DeleteAccountData records
// the workspaces it handed over or deleted into *out.
func WithWorkspaceHandovers(ctx context.Context, out *[]WorkspaceHandover) context.Context {
	return context.WithValue(ctx, handoverKey{}, out)
}

// handOverWorkspaces runs inside the account deletion before the users row
// goes (its default workspace and memberships go with it by cascade): each
// created workspace the account owns passes to its oldest admin, or is deleted
// when it has no projects and no other member, or otherwise passes to the
// server owner. Every member of an affected workspace is told.
func handOverWorkspaces(ctx context.Context, tx *sql.Tx, userID string, notify map[string]bool) error {
	member, err := stringColumn(ctx, tx, `SELECT DISTINCT m2.user_id FROM workspace_members m
		JOIN workspace_members m2 ON m2.workspace_id = m.workspace_id WHERE m.user_id = ?`, userID)
	if err != nil {
		return err
	}
	for _, u := range member {
		notify[u] = true
	}
	owned, err := stringColumn(ctx, tx, `SELECT id FROM workspaces WHERE owner_id = ? AND kind = 'created' ORDER BY id`, userID)
	if err != nil {
		return err
	}
	record, _ := ctx.Value(handoverKey{}).(*[]WorkspaceHandover)
	for _, ws := range owned {
		next := ""
		err := tx.QueryRowContext(ctx, `SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'admin' ORDER BY created_at, user_id LIMIT 1`, ws).Scan(&next)
		if err != nil && err != sql.ErrNoRows {
			return err
		}
		if next == "" {
			projects, err := workspaceProjectIDs(ctx, tx, ws)
			if err != nil {
				return err
			}
			others, err := stringColumn(ctx, tx, `SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id != ?`, ws, userID)
			if err != nil {
				return err
			}
			if len(projects) > 0 || len(others) > 0 {
				err := tx.QueryRowContext(ctx, `SELECT id FROM users WHERE role = 'owner' AND id != ? ORDER BY created_at LIMIT 1`, userID).Scan(&next)
				if err != nil && err != sql.ErrNoRows {
					return err
				}
			}
		}
		if next == "" {
			if _, err := tx.ExecContext(ctx, `DELETE FROM workspaces WHERE id = ?`, ws); err != nil {
				return err
			}
		} else {
			if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO workspace_members(workspace_id,user_id,role,added_by,created_at) VALUES(?,?,'admin',?,?)`,
				ws, next, userID, time.Now().UnixMilli()); err != nil {
				return err
			}
			if err := transferWorkspaceTx(ctx, tx, ws, userID, next); err != nil {
				return err
			}
			notify[next] = true
		}
		if record != nil {
			*record = append(*record, WorkspaceHandover{WorkspaceID: ws, NewOwner: next})
		}
	}
	return nil
}
