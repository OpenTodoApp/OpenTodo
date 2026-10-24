package sync

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

// Group mentions (OpenSpec change group-mentions). A comment's mentions and a
// task's note_mentions may hold "group:<group id>" beside account ids (D1). At
// receipt a group stays only when it belongs to the created workspace of the
// task's shared project and the writer is a member of that workspace (D2); when
// the server notifies, a group becomes its current members who are members of
// the project, never anyone else (D3).

// GroupMentionPrefix marks a workspace group in a mention list.
const GroupMentionPrefix = "group:"

// GroupMentionGroup returns the group id of a mention entry, and false for an
// account id.
func GroupMentionGroup(entry string) (string, bool) {
	id, ok := strings.CutPrefix(entry, GroupMentionPrefix)
	return id, ok && id != ""
}

// keepMention reports whether one entry of a mention list may be stored in a
// shared project scope: a current member of the project, or a group of its
// workspace (D2). Answers are cached for the batch.
func (r *resolver) keepMention(scope, entry string) (bool, error) {
	group, isGroup := GroupMentionGroup(entry)
	if !isGroup {
		return r.canBeAssigned(scope, entry)
	}
	key := "group\x00" + scope + "\x00" + group
	if v, ok := r.assignable[key]; ok {
		return v, nil
	}
	ok, err := groupInProjectWorkspace(r.ctx, r.tx, strings.TrimPrefix(scope, "project:"), group, r.acc.userID)
	if err != nil {
		return false, err
	}
	r.assignable[key] = ok
	return ok, nil
}

// groupInProjectWorkspace: the group exists in the created workspace the
// project belongs to, and writer is a member of that workspace.
func groupInProjectWorkspace(ctx context.Context, q querier, projectID, groupID, writer string) (bool, error) {
	ws, err := closedWorkspace(ctx, q, projectID)
	if err != nil || ws == "" {
		return false, err
	}
	var one int
	err = q.QueryRowContext(ctx, `SELECT 1 FROM groups WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`, groupID, ws).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return isWorkspaceMember(ctx, q, ws, writer)
}

// mentionReach is who a mention list reaches: every account in order, and for
// an account reached only through a group, that group's id.
type mentionReach struct {
	people []string
	via    map[string]string
}

// reach expands a mention list in a project scope (D3): direct ids first, then
// each group's current members who are members of the project. A read error
// leaves a group out: notifying is best effort, like the sinks themselves.
func (s *Service) reach(ctx context.Context, scope string, list []string) mentionReach {
	out := mentionReach{via: map[string]string{}}
	seen := map[string]bool{}
	var groups []string
	for _, id := range list {
		if g, ok := GroupMentionGroup(id); ok {
			groups = append(groups, g)
			continue
		}
		if id != "" && !seen[id] {
			seen[id] = true
			out.people = append(out.people, id)
		}
	}
	project := strings.TrimPrefix(scope, "project:")
	for _, g := range groups {
		members, err := stringsOf(ctx, s.db, `SELECT gm.user_id FROM group_members gm
			JOIN groups g ON g.id = gm.group_id AND g.deleted_at IS NULL
			JOIN project_members pm ON pm.user_id = gm.user_id AND pm.project_id = ?
			WHERE gm.group_id = ? ORDER BY gm.user_id`, project, g)
		if err != nil {
			continue
		}
		for _, id := range members {
			if !seen[id] {
				seen[id] = true
				out.people = append(out.people, id)
				out.via[id] = g
			}
		}
	}
	return out
}

// groupName is a group's current name, "" when it is gone.
func (s *Service) groupName(ctx context.Context, groupID string) string {
	var name string
	_ = s.db.QueryRowContext(ctx, `SELECT name FROM groups WHERE id = ?`, groupID).Scan(&name)
	return name
}
