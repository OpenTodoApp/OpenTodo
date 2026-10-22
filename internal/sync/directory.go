package sync

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/pixari/opentodo/internal/ids"
)

// Workspace members and groups (OpenSpec change workspaces, "Workspace
// membership and roles" and "Groups"). Every change that can alter a shared
// project's effective membership recomputes the affected projects in its own
// transaction (design D3).

// ValidWorkspaceRole reports whether role can be given to a member (ownership
// moves only by transfer).
func ValidWorkspaceRole(role string) bool { return role == WorkspaceMember || role == WorkspaceAdmin }

// recomputeProjects recomputes each project and folds the effects into ch.
func (s *Service) recomputeProjects(ctx context.Context, tx *sql.Tx, actorID string, projects []string, ch *DirectoryChange) error {
	for _, pid := range unique(projects) {
		before, err := scopeUsers(ctx, tx, ProjectScope(pid))
		if err != nil {
			return err
		}
		re, err := s.recomputeProject(ctx, tx, actorID, pid)
		if err != nil {
			return err
		}
		if len(re.diffs) == 0 {
			continue
		}
		after, err := scopeUsers(ctx, tx, ProjectScope(pid))
		if err != nil {
			return err
		}
		ch.Audience = append(append(ch.Audience, before...), after...)
		ch.Unassigned = append(ch.Unassigned, re.unassigned...)
		ch.changes = append(ch.changes, re.changes...)
		ch.Projects = append(ch.Projects, pid)
	}
	return nil
}

// groupProjects lists the projects a group holds a grant on.
func groupProjects(ctx context.Context, q querier, groupIDs ...string) ([]string, error) {
	if len(groupIDs) == 0 {
		return nil, nil
	}
	args := make([]any, len(groupIDs))
	for i, g := range groupIDs {
		args[i] = g
	}
	rows, err := q.QueryContext(ctx, `SELECT DISTINCT project_id FROM project_grants WHERE subject_kind = 'group' AND subject_id IN (?`+strings.Repeat(",?", len(groupIDs)-1)+`) ORDER BY project_id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// AddWorkspaceMember adds an existing account to a created workspace. The
// owner adds members and admins; an admin adds members.
func (s *Service) AddWorkspaceMember(ctx context.Context, actorID, wsID, targetID, role string) (DirectoryChange, error) {
	if !ValidWorkspaceRole(role) {
		return DirectoryChange{}, fmt.Errorf("%w: role must be member or admin", ErrInvalidInput)
	}
	return s.directoryTx(ctx, actorID, wsID, func(tx *sql.Tx, ws wsRow, actorRole string) (DirectoryChange, error) {
		return DirectoryChange{}, s.addWorkspaceMember(ctx, tx, ws, actorID, actorRole, targetID, role)
	})
}

func (s *Service) addWorkspaceMember(ctx context.Context, tx *sql.Tx, ws wsRow, actorID, actorRole, targetID, role string) error {
	if !canManage(actorRole) || (actorRole == WorkspaceAdmin && role == WorkspaceAdmin) {
		return ErrForbidden
	}
	if ws.kind == "default" {
		return ErrDefaultWorkspace
	}
	if existing, err := workspaceRole(ctx, tx, ws.id, targetID); err != nil {
		return err
	} else if existing != "" {
		return ErrAlreadyMember
	}
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ?`, ws.id).Scan(&n); err != nil {
		return err
	}
	if max := s.WorkspaceLimitsInEffect().Members; n >= max {
		return &LimitError{"members", max}
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO workspace_members(workspace_id,user_id,role,added_by,created_at) VALUES(?,?,?,?,?)`,
		ws.id, targetID, role, actorID, s.now().UnixMilli())
	return err
}

// AddWorkspaceMemberTx is AddWorkspaceMember inside a transaction the caller
// owns, for workspace invite links: the link's creator is the actor, so their
// current right to grant the role is checked when the link is used. It
// returns the members to wake once the caller committed.
func (s *Service) AddWorkspaceMemberTx(ctx context.Context, tx *sql.Tx, actorID, wsID, targetID, role string) ([]string, error) {
	if !ValidWorkspaceRole(role) {
		return nil, fmt.Errorf("%w: role must be member or admin", ErrInvalidInput)
	}
	var ws wsRow
	var actorRole string
	err := tx.QueryRowContext(ctx, `SELECT w.id, w.kind, w.owner_id, m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?
		WHERE w.id = ? AND w.deleted_at IS NULL`, actorID, wsID).Scan(&ws.id, &ws.kind, &ws.ownerID, &actorRole)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if err := s.addWorkspaceMember(ctx, tx, ws, actorID, actorRole, targetID, role); err != nil {
		return nil, err
	}
	return workspaceUserIDs(ctx, tx, ws.id)
}

// SetWorkspaceMemberRole changes a member's role: the owner changes anyone but
// themselves; an admin cannot touch admins or make one.
func (s *Service) SetWorkspaceMemberRole(ctx context.Context, actorID, wsID, targetID, role string) (DirectoryChange, error) {
	if !ValidWorkspaceRole(role) {
		return DirectoryChange{}, fmt.Errorf("%w: role must be member or admin (ownership moves by transfer)", ErrInvalidInput)
	}
	return s.directoryTx(ctx, actorID, wsID, func(tx *sql.Tx, ws wsRow, actorRole string) (DirectoryChange, error) {
		if !canManage(actorRole) {
			return DirectoryChange{}, ErrForbidden
		}
		current, err := workspaceRole(ctx, tx, ws.id, targetID)
		if err != nil {
			return DirectoryChange{}, err
		}
		if current == "" {
			return DirectoryChange{}, fmt.Errorf("%w: member", ErrNotFound)
		}
		if current == WorkspaceOwner || (actorRole == WorkspaceAdmin && (current == WorkspaceAdmin || role == WorkspaceAdmin)) {
			return DirectoryChange{}, ErrForbidden
		}
		_, err = tx.ExecContext(ctx, `UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?`, role, ws.id, targetID)
		return DirectoryChange{}, err
	})
}

// RemoveWorkspaceMember removes a member, or makes the actor leave when
// targetID is the actor. The owner cannot leave; admins remove members; the
// owner removes anyone else. Every grant the member held on the workspace's
// projects, directly or through its groups, goes with them.
func (s *Service) RemoveWorkspaceMember(ctx context.Context, actorID, wsID, targetID string) (DirectoryChange, error) {
	return s.directoryTx(ctx, actorID, wsID, func(tx *sql.Tx, ws wsRow, actorRole string) (DirectoryChange, error) {
		if ws.kind == "default" {
			return DirectoryChange{}, ErrDefaultWorkspace
		}
		current, err := workspaceRole(ctx, tx, ws.id, targetID)
		if err != nil {
			return DirectoryChange{}, err
		}
		if current == "" {
			return DirectoryChange{}, fmt.Errorf("%w: member", ErrNotFound)
		}
		switch {
		case targetID == actorID && current == WorkspaceOwner:
			return DirectoryChange{}, ErrOwnerMustTransfer
		case targetID == actorID:
		case !canManage(actorRole), current == WorkspaceOwner, actorRole == WorkspaceAdmin && current == WorkspaceAdmin:
			return DirectoryChange{}, ErrForbidden
		}
		var ch DirectoryChange
		return ch, s.removeFromWorkspace(ctx, tx, actorID, ws.id, targetID, &ch)
	})
}

// removeFromWorkspace drops targetID's membership, groups and grants in the
// workspace and recomputes the projects that changed.
func (s *Service) removeFromWorkspace(ctx context.Context, tx *sql.Tx, actorID, wsID, targetID string, ch *DirectoryChange) error {
	groupIDs, err := stringsOf(ctx, tx, `SELECT gm.group_id FROM group_members gm JOIN groups g ON g.id = gm.group_id WHERE g.workspace_id = ? AND gm.user_id = ?`, wsID, targetID)
	if err != nil {
		return err
	}
	affected, err := groupProjects(ctx, tx, groupIDs...)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM group_members WHERE user_id = ? AND group_id IN (SELECT id FROM groups WHERE workspace_id = ?)`, targetID, wsID); err != nil {
		return err
	}
	projects, err := workspaceProjectIDs(ctx, tx, wsID)
	if err != nil {
		return err
	}
	for _, pid := range projects {
		var owner string
		_ = tx.QueryRowContext(ctx, `SELECT owner_id FROM project_scopes WHERE project_id = ?`, pid).Scan(&owner)
		if owner == targetID {
			continue // their own project stays theirs
		}
		res, err := tx.ExecContext(ctx, `DELETE FROM project_grants WHERE project_id = ? AND subject_kind = 'user' AND subject_id = ?`, pid, targetID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			affected = append(affected, pid)
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?`, wsID, targetID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE workspace_invites SET revoked_at = ? WHERE workspace_id = ? AND created_by = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
		s.now().UnixMilli(), wsID, targetID); err != nil {
		return err
	}
	return s.recomputeProjects(ctx, tx, actorID, affected, ch)
}

func stringsOf(ctx context.Context, q querier, query string, args ...any) ([]string, error) {
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

// groupRow loads a live group of the workspace, ErrNotFound otherwise.
func groupRow(ctx context.Context, tx *sql.Tx, wsID, groupID string) (string, error) {
	var name string
	err := tx.QueryRowContext(ctx, `SELECT name FROM groups WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`, groupID, wsID).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("%w: group", ErrNotFound)
	}
	return name, err
}

// nameTaken reports whether another live group of the workspace has name, ignoring case.
func nameTaken(ctx context.Context, tx *sql.Tx, wsID, name, except string) (bool, error) {
	var n int
	err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM groups WHERE workspace_id = ? AND deleted_at IS NULL AND id != ? AND lower(name) = lower(?)`,
		wsID, except, strings.TrimSpace(name)).Scan(&n)
	return n > 0, err
}

// CreateGroup creates a group in a created workspace (owner and admins).
func (s *Service) CreateGroup(ctx context.Context, actorID, wsID, name string) (Group, DirectoryChange, error) {
	if !ValidName(name) {
		return Group{}, DirectoryChange{}, fmt.Errorf("%w: name must be 1 to 60 characters", ErrInvalidInput)
	}
	g := Group{ID: ids.New(), Name: strings.TrimSpace(name), Members: []string{}}
	ch, err := s.directoryTx(ctx, actorID, wsID, func(tx *sql.Tx, ws wsRow, role string) (DirectoryChange, error) {
		if !canManage(role) {
			return DirectoryChange{}, ErrForbidden
		}
		if ws.kind == "default" {
			return DirectoryChange{}, ErrDefaultWorkspace
		}
		if taken, err := nameTaken(ctx, tx, ws.id, name, ""); err != nil {
			return DirectoryChange{}, err
		} else if taken {
			return DirectoryChange{}, ErrGroupExists
		}
		var n int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM groups WHERE workspace_id = ? AND deleted_at IS NULL`, ws.id).Scan(&n); err != nil {
			return DirectoryChange{}, err
		}
		if max := s.WorkspaceLimitsInEffect().Groups; n >= max {
			return DirectoryChange{}, &LimitError{"groups", max}
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO groups(id,workspace_id,name,created_at) VALUES(?,?,?,?)`, g.ID, ws.id, g.Name, s.now().UnixMilli())
		return DirectoryChange{}, err
	})
	if err != nil {
		return Group{}, DirectoryChange{}, err
	}
	return g, ch, nil
}

// RenameGroup renames a group (owner and admins).
func (s *Service) RenameGroup(ctx context.Context, actorID, wsID, groupID, name string) (DirectoryChange, error) {
	if !ValidName(name) {
		return DirectoryChange{}, fmt.Errorf("%w: name must be 1 to 60 characters", ErrInvalidInput)
	}
	return s.directoryTx(ctx, actorID, wsID, func(tx *sql.Tx, ws wsRow, role string) (DirectoryChange, error) {
		if !canManage(role) {
			return DirectoryChange{}, ErrForbidden
		}
		if _, err := groupRow(ctx, tx, ws.id, groupID); err != nil {
			return DirectoryChange{}, err
		}
		if taken, err := nameTaken(ctx, tx, ws.id, name, groupID); err != nil {
			return DirectoryChange{}, err
		} else if taken {
			return DirectoryChange{}, ErrGroupExists
		}
		_, err := tx.ExecContext(ctx, `UPDATE groups SET name = ? WHERE id = ?`, strings.TrimSpace(name), groupID)
		return DirectoryChange{}, err
	})
}

// DeleteGroup deletes a group and its grants; members who had no other grant
// on those projects leave them.
func (s *Service) DeleteGroup(ctx context.Context, actorID, wsID, groupID string) (DirectoryChange, error) {
	return s.directoryTx(ctx, actorID, wsID, func(tx *sql.Tx, ws wsRow, role string) (DirectoryChange, error) {
		if !canManage(role) {
			return DirectoryChange{}, ErrForbidden
		}
		if _, err := groupRow(ctx, tx, ws.id, groupID); err != nil {
			return DirectoryChange{}, err
		}
		affected, err := groupProjects(ctx, tx, groupID)
		if err != nil {
			return DirectoryChange{}, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM project_grants WHERE subject_kind = 'group' AND subject_id = ?`, groupID); err != nil {
			return DirectoryChange{}, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM groups WHERE id = ?`, groupID); err != nil {
			return DirectoryChange{}, err
		}
		var ch DirectoryChange
		return ch, s.recomputeProjects(ctx, tx, actorID, affected, &ch)
	})
}

// SetGroupMember adds (in true) or removes a member of a group; the account
// must be a member of the workspace. Every project the group is on changes
// its effective membership in the same transaction.
func (s *Service) SetGroupMember(ctx context.Context, actorID, wsID, groupID, userID string, in bool) (DirectoryChange, error) {
	return s.directoryTx(ctx, actorID, wsID, func(tx *sql.Tx, ws wsRow, role string) (DirectoryChange, error) {
		if !canManage(role) {
			return DirectoryChange{}, ErrForbidden
		}
		if _, err := groupRow(ctx, tx, ws.id, groupID); err != nil {
			return DirectoryChange{}, err
		}
		var present int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM group_members WHERE group_id = ? AND user_id = ?`, groupID, userID).Scan(&present); err != nil {
			return DirectoryChange{}, err
		}
		if in {
			if ok, err := isWorkspaceMember(ctx, tx, ws.id, userID); err != nil {
				return DirectoryChange{}, err
			} else if !ok {
				return DirectoryChange{}, ErrNotInWorkspace
			}
			if present > 0 {
				return DirectoryChange{}, ErrAlreadyMember
			}
			var n int
			if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM group_members WHERE group_id = ?`, groupID).Scan(&n); err != nil {
				return DirectoryChange{}, err
			}
			if max := s.WorkspaceLimitsInEffect().GroupMembers; n >= max {
				return DirectoryChange{}, &LimitError{"group_members", max}
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO group_members(group_id,user_id,created_at) VALUES(?,?,?)`, groupID, userID, s.now().UnixMilli()); err != nil {
				return DirectoryChange{}, err
			}
		} else {
			if present == 0 {
				return DirectoryChange{}, fmt.Errorf("%w: member", ErrNotFound)
			}
			if _, err := tx.ExecContext(ctx, `DELETE FROM group_members WHERE group_id = ? AND user_id = ?`, groupID, userID); err != nil {
				return DirectoryChange{}, err
			}
		}
		affected, err := groupProjects(ctx, tx, groupID)
		if err != nil {
			return DirectoryChange{}, err
		}
		ch := DirectoryChange{Audience: []string{userID}}
		return ch, s.recomputeProjects(ctx, tx, actorID, affected, &ch)
	})
}
