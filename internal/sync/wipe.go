package sync

import (
	"context"
	"sort"
)

// WipeAccounts removes every synced entity of the given accounts while keeping
// the accounts, their sessions and their devices' cursors usable (OpenSpec
// change `demo-mode`, design D3). It is the nightly reset of a demo instance.
//
//   - Shared projects owned by one of the accounts are deleted for everyone
//     (ops, fields, members, scope), exactly like DeleteAccountData does: member
//     devices drop them because their membership list no longer contains them.
//     Memberships of the accounts in other projects are removed too.
//   - The personal scope of each account is emptied.
//   - Every removed entity gets a purge marker in the personal scope of every
//     account that could see it (trash-and-history D5), so a device that syncs
//     afterwards drops its local copy and a stale queued op for a removed id is
//     discarded instead of resurrecting it.
//   - The accounts' in-app notifications and the CalDAV resource names of
//     their tasks are deleted.
//
// It returns everyone whose devices must be told (the accounts and any other
// member of a deleted project); callers wake them with NotifyMembership.
func (s *Service) WipeAccounts(ctx context.Context, userIDs []string) ([]string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	notify := map[string]bool{}
	// entity key -> users who could see it (marker recipients).
	type key struct{ entity, id string }
	seen := map[key]map[string]bool{}
	var order []key
	collect := func(scope string, users []string) error {
		rows, err := tx.QueryContext(ctx, `SELECT DISTINCT entity, entity_id FROM scope_fields WHERE scope_id = ? ORDER BY entity, entity_id`, scope)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var k key
			if err := rows.Scan(&k.entity, &k.id); err != nil {
				return err
			}
			if seen[k] == nil {
				seen[k] = map[string]bool{}
				order = append(order, k)
			}
			for _, u := range users {
				seen[k][u] = true
			}
		}
		return rows.Err()
	}
	for _, uid := range userIDs {
		notify[uid] = true
		owned, err := stringColumn(ctx, tx, `SELECT project_id FROM project_scopes WHERE owner_id = ?`, uid)
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
			if err := collect(ProjectScope(pid), users); err != nil {
				return nil, err
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
		for _, q := range []string{
			`DELETE FROM project_members WHERE user_id = ?`,
			`DELETE FROM member_backfills WHERE user_id = ?`,
			`DELETE FROM notifications WHERE user_id = ?`,
		} {
			if _, err := tx.ExecContext(ctx, q, uid); err != nil {
				return nil, err
			}
		}
		if err := collect(PersonalScope(uid), []string{uid}); err != nil {
			return nil, err
		}
		if err := deleteScope(ctx, tx, PersonalScope(uid)); err != nil {
			return nil, err
		}
	}
	now := s.now().UnixMilli()
	for _, k := range order {
		if k.entity == "task" {
			// CalDAV resource names go with their task, as in purgeTx.
			if _, err := tx.ExecContext(ctx, `DELETE FROM caldav_resources WHERE task_id = ?
				AND NOT EXISTS (SELECT 1 FROM scope_fields WHERE entity = 'task' AND entity_id = ?)`, k.id, k.id); err != nil {
				return nil, err
			}
		}
		users := make([]string, 0, len(seen[k]))
		for u := range seen[k] {
			users = append(users, u)
		}
		sort.Strings(users)
		for _, u := range users {
			seq, err := reserveSeq(ctx, tx)
			if err != nil {
				return nil, err
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO purges(seq, user_id, scope_id, entity, entity_id, purged_at) VALUES(?,?,?,?,?,?)`,
				seq, "", PersonalScope(u), k.entity, k.id, now); err != nil {
				return nil, err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(notify))
	for u := range notify {
		out = append(out, u)
	}
	sort.Strings(out)
	return out, nil
}
