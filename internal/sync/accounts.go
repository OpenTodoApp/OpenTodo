package sync

import (
	"context"
	"database/sql"
	"sort"
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
func DeleteAccountData(ctx context.Context, tx *sql.Tx, userID string) ([]string, error) {
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
	}
	for _, q := range []string{
		`DELETE FROM project_members WHERE user_id = ?`,
		`DELETE FROM member_backfills WHERE user_id = ?`,
	} {
		if _, err := tx.ExecContext(ctx, q, userID); err != nil {
			return nil, err
		}
	}

	if err := deleteScope(ctx, tx, PersonalScope(userID)); err != nil {
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
