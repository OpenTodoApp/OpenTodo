package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

// Grants and effective membership (OpenSpec change workspaces, design D3).
// project_grants holds what people did: a direct grant per member (the owner
// included) and one grant per group. project_members stays the materialised
// effective membership every reader uses: recomputeProject rewrites a
// project's rows from the grants and the current group memberships inside the
// transaction of the change, with the effects adding and removing a member
// always had (history replay for newcomers, unassignment for the departed).

// memberDiff is one account's effective role before and after a recomputation.
type memberDiff struct{ from, to string }

// recomputed is what recomputeProject changed.
type recomputed struct {
	diffs      map[string]memberDiff
	unassigned []string
	changes    []Change
}

// higherRole reports whether a outranks b (owner > admin > editor > viewer).
func higherRole(a, b string) bool {
	if b == "" {
		return a != ""
	}
	ra, oka := roleOrder[a]
	rb, okb := roleOrder[b]
	return oka && (!okb || ra < rb)
}

// effective is one account's computed membership.
type effective struct {
	role string
	via  []string
}

// wantedMembers computes a shared project's effective membership from its grants.
func wantedMembers(ctx context.Context, tx *sql.Tx, projectID, ownerID string) (map[string]*effective, error) {
	want := map[string]*effective{}
	put := func(user, role, via string) {
		e := want[user]
		if e == nil {
			e = &effective{}
			want[user] = e
		}
		if higherRole(role, e.role) {
			e.role = role
		}
		if via != "" {
			e.via = append(e.via, via)
		}
	}
	rows, err := tx.QueryContext(ctx, `SELECT g.subject_id, g.role, '' FROM project_grants g JOIN users u ON u.id = g.subject_id
		WHERE g.project_id = ? AND g.subject_kind = 'user'
		UNION ALL
		SELECT gm.user_id, g.role, g.subject_id FROM project_grants g
		JOIN groups gr ON gr.id = g.subject_id AND gr.deleted_at IS NULL
		JOIN group_members gm ON gm.group_id = gr.id
		WHERE g.project_id = ? AND g.subject_kind = 'group'`, projectID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var user, role, via string
		if err := rows.Scan(&user, &role, &via); err != nil {
			return nil, err
		}
		if role == RoleOwner && user != ownerID {
			role = RoleAdmin // only project_scopes names the owner
		}
		put(user, role, via)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	put(ownerID, RoleOwner, "")
	for _, e := range want {
		sort.Strings(e.via)
	}
	return want, nil
}

// recomputeProject rewrites a shared project's project_members rows from its
// grants. An unshared project (no scope) has nothing to rewrite.
func (s *Service) recomputeProject(ctx context.Context, tx *sql.Tx, actorID, projectID string) (recomputed, error) {
	out := recomputed{diffs: map[string]memberDiff{}}
	var ownerID string
	err := tx.QueryRowContext(ctx, `SELECT owner_id FROM project_scopes WHERE project_id = ?`, projectID).Scan(&ownerID)
	if errors.Is(err, sql.ErrNoRows) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	want, err := wantedMembers(ctx, tx, projectID, ownerID)
	if err != nil {
		return out, err
	}
	have := map[string]effective{}
	rows, err := tx.QueryContext(ctx, `SELECT user_id, role, via FROM project_members WHERE project_id = ?`, projectID)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var u, role, via string
		if err := rows.Scan(&u, &role, &via); err != nil {
			rows.Close()
			return out, err
		}
		e := effective{role: role}
		if via != "" {
			e.via = strings.Split(via, ",")
		}
		have[u] = e
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}
	now := s.now().UnixMilli()
	for _, u := range sortedKeys(want) {
		w, h := want[u], have[u]
		via := strings.Join(w.via, ",")
		switch {
		case h.role == "":
			if _, err := tx.ExecContext(ctx, `INSERT INTO project_members(project_id,user_id,role,added_by,created_at,backfill,via) VALUES(?,?,?,?,?,1,?)`,
				projectID, u, w.role, actorID, now, via); err != nil {
				return out, err
			}
			// A (re-)added member replays the history on every device.
			if _, err := tx.ExecContext(ctx, `DELETE FROM member_backfills WHERE project_id = ? AND user_id = ?`, projectID, u); err != nil {
				return out, err
			}
			out.diffs[u] = memberDiff{"", w.role}
		case h.role != w.role || strings.Join(h.via, ",") != via:
			if _, err := tx.ExecContext(ctx, `UPDATE project_members SET role = ?, via = ? WHERE project_id = ? AND user_id = ?`, w.role, via, projectID, u); err != nil {
				return out, err
			}
			out.diffs[u] = memberDiff{h.role, w.role}
		}
	}
	for _, u := range sortedKeys(have) {
		if _, kept := want[u]; kept {
			continue
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM project_members WHERE project_id = ? AND user_id = ?`, projectID, u); err != nil {
			return out, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM member_backfills WHERE project_id = ? AND user_id = ?`, projectID, u); err != nil {
			return out, err
		}
		unassigned, changes, err := s.unassignDeparted(ctx, tx, actorID, projectID, u)
		if err != nil {
			return out, err
		}
		out.unassigned = append(out.unassigned, unassigned...)
		out.changes = append(out.changes, changes...)
		out.diffs[u] = memberDiff{have[u].role, ""}
	}
	return out, nil
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// putUserGrant writes (or replaces) a direct grant.
func putUserGrant(ctx context.Context, tx *sql.Tx, projectID, userID, role, addedBy string, now int64) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO project_grants(project_id,subject_kind,subject_id,role,added_by,created_at) VALUES(?,'user',?,?,?,?)
		ON CONFLICT(project_id,subject_kind,subject_id) DO UPDATE SET role = excluded.role`, projectID, userID, role, addedBy, now)
	return err
}

// userGrant is userID's direct grant on a project, "" for none.
func userGrant(ctx context.Context, q querier, projectID, userID string) (string, error) {
	var role string
	err := q.QueryRowContext(ctx, `SELECT role FROM project_grants WHERE project_id = ? AND subject_kind = 'user' AND subject_id = ?`, projectID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return role, err
}

// projectWorkspace is the workspace_id a project's owner wrote, "" for the default.
func projectWorkspace(ctx context.Context, q querier, projectID string) (string, error) {
	var raw string
	err := q.QueryRowContext(ctx, `SELECT value FROM scope_fields WHERE entity = 'project' AND entity_id = ? AND field = 'workspace_id' LIMIT 1`, projectID).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	var id string
	_ = json.Unmarshal([]byte(raw), &id)
	return id, nil
}

// closedWorkspace returns the created workspace a project belongs to, or ""
// when the project is in a default workspace or one that does not exist: only
// a created workspace is a closed directory (design D4).
func closedWorkspace(ctx context.Context, q querier, projectID string) (string, error) {
	ws, err := projectWorkspace(ctx, q, projectID)
	if err != nil || ws == "" {
		return "", err
	}
	var kind string
	err = q.QueryRowContext(ctx, `SELECT kind FROM workspaces WHERE id = ? AND deleted_at IS NULL`, ws).Scan(&kind)
	if errors.Is(err, sql.ErrNoRows) || kind != "created" {
		return "", nil
	}
	return ws, err
}

// requireInDirectory refuses targetID with ErrNotInWorkspace when the project
// is in a created workspace targetID is not a member of.
func requireInDirectory(ctx context.Context, q querier, projectID, targetID string) error {
	ws, err := closedWorkspace(ctx, q, projectID)
	if err != nil || ws == "" {
		return err
	}
	ok, err := isWorkspaceMember(ctx, q, ws, targetID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotInWorkspace
	}
	return nil
}

// Grant is one group grant on a project, as the member list shows it.
type Grant struct {
	GroupID string `json:"groupId"`
	Name    string `json:"name"`
	Role    string `json:"role"`
}

// projectGrants lists a project's group grants by group name.
func projectGrants(ctx context.Context, q querier, projectID string) ([]Grant, error) {
	rows, err := q.QueryContext(ctx, `SELECT g.subject_id, COALESCE(gr.name,''), g.role FROM project_grants g
		JOIN groups gr ON gr.id = g.subject_id AND gr.deleted_at IS NULL
		WHERE g.project_id = ? AND g.subject_kind = 'group' ORDER BY gr.name COLLATE NOCASE, g.subject_id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Grant{}
	for rows.Next() {
		var g Grant
		if err := rows.Scan(&g.GroupID, &g.Name, &g.Role); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// GrantChange reports a group grant change: the grant's role before and after
// and every account whose devices should sync.
type GrantChange struct {
	From, To string
	Audience []string
	changes  []Change
}

// SetGroupGrant grants a group of the project's workspace a role on the
// project, or changes it (role "" removes the grant). The owner grants any
// member role; an admin grants viewer and editor and changes only those.
func (s *Service) SetGroupGrant(ctx context.Context, actorID, projectID, groupID, role string, create bool) (GrantChange, error) {
	if role != "" && !ValidMemberRole(role) {
		return GrantChange{}, fmt.Errorf("%w: role must be viewer, editor or admin", ErrInvalidMember)
	}
	var gc GrantChange
	ch, err := s.membershipTx(ctx, actorID, projectID, func(tx *sql.Tx, actorRole string, shared bool) (MemberChange, error) {
		if actorRole != RoleOwner && actorRole != RoleAdmin {
			return MemberChange{}, ErrForbidden
		}
		ws, err := closedWorkspace(ctx, tx, projectID)
		if err != nil {
			return MemberChange{}, err
		}
		var groupWS string
		err = tx.QueryRowContext(ctx, `SELECT workspace_id FROM groups WHERE id = ? AND deleted_at IS NULL`, groupID).Scan(&groupWS)
		if errors.Is(err, sql.ErrNoRows) || (err == nil && (ws == "" || groupWS != ws)) {
			return MemberChange{}, fmt.Errorf("%w: group", ErrNotFound)
		}
		if err != nil {
			return MemberChange{}, err
		}
		var current string
		err = tx.QueryRowContext(ctx, `SELECT role FROM project_grants WHERE project_id = ? AND subject_kind = 'group' AND subject_id = ?`, projectID, groupID).Scan(&current)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return MemberChange{}, err
		}
		switch {
		case create && current != "":
			return MemberChange{}, ErrAlreadyMember
		case !create && current == "":
			return MemberChange{}, fmt.Errorf("%w: grant", ErrNotFound)
		}
		if actorRole == RoleAdmin && (current == RoleAdmin || role == RoleAdmin) {
			return MemberChange{}, ErrForbidden
		}
		if create && !CanGrant(actorRole, role) {
			return MemberChange{}, ErrForbidden
		}
		if !shared {
			if err := s.share(ctx, tx, actorID, projectID); err != nil {
				return MemberChange{}, err
			}
		}
		now := s.now().UnixMilli()
		if role == "" {
			_, err = tx.ExecContext(ctx, `DELETE FROM project_grants WHERE project_id = ? AND subject_kind = 'group' AND subject_id = ?`, projectID, groupID)
		} else {
			_, err = tx.ExecContext(ctx, `INSERT INTO project_grants(project_id,subject_kind,subject_id,role,added_by,created_at) VALUES(?,'group',?,?,?,?)
				ON CONFLICT(project_id,subject_kind,subject_id) DO UPDATE SET role = excluded.role`, projectID, groupID, role, actorID, now)
		}
		if err != nil {
			return MemberChange{}, err
		}
		re, err := s.recomputeProject(ctx, tx, actorID, projectID)
		if err != nil {
			return MemberChange{}, err
		}
		gc.From, gc.To = current, role
		return MemberChange{Unassigned: re.unassigned, changes: re.changes}, nil
	})
	if err != nil {
		return GrantChange{}, err
	}
	gc.Audience, gc.changes = ch.Audience, ch.changes
	return gc, nil
}
