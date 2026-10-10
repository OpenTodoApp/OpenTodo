package sync

import (
	"context"
	"fmt"
	"sort"
	"strings"
)

// ActivityOps returns the operations the activity log of one task or project is
// derived from (OpenSpec change `comments-and-activity`, design D4), in seq
// order, each with its Actor. Like History (trash-and-history D3) it reads the
// op log directly and only from scopes the user can read; it never writes.
//
//   - task: the task's ops and the ops of its comments;
//   - project: in a shared project every task, comment and project op of its
//     scope; in a personal project the project's ops, the ops of the tasks that
//     currently belong to it and of their comments.
//
// ErrNotFound when the user can see no such task or project.
func (s *Service) ActivityOps(ctx context.Context, userID, entity, id string) ([]Op, error) {
	if entity != "task" && entity != "project" {
		return nil, fmt.Errorf("%w: unknown entity %q", ErrInvalidOp, entity)
	}
	acc, err := loadAccess(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	scope, _, ok, err := locate(ctx, s.db, acc, entity, id)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrNotFound
	}
	const cols = `SELECT o.seq,o.op_id,o.entity,o.entity_id,o.field,o.value,o.ts,o.device,o.user_id FROM ops o JOIN op_scopes s ON s.seq = o.seq `
	if entity == "project" && strings.HasPrefix(scope, "project:") {
		return s.readOps(ctx, cols+`WHERE s.scope_id = ? AND o.entity IN ('task','project','comment') ORDER BY o.seq`, scope)
	}
	targets := map[string][]string{}
	if entity == "task" {
		targets["task"] = []string{id}
	} else {
		targets["project"] = []string{id}
		if targets["task"], err = taskIDsWhere(ctx, s.db, scope, "project_id", id, false); err != nil {
			return nil, err
		}
	}
	for _, tid := range targets["task"] {
		cids, err := commentIDsOf(ctx, s.db, scope, tid)
		if err != nil {
			return nil, err
		}
		targets["comment"] = append(targets["comment"], cids...)
	}
	var out []Op
	for _, ent := range []string{"project", "task", "comment"} {
		ids := targets[ent]
		for len(ids) > 0 {
			n := min(len(ids), 400)
			chunk := ids[:n]
			ids = ids[n:]
			ops, err := s.readOps(ctx, cols+`WHERE s.scope_id = ? AND o.entity = ? AND o.entity_id IN (`+placeholders(n)+`)`,
				append([]any{scope, ent}, anys(chunk)...)...)
			if err != nil {
				return nil, err
			}
			out = append(out, ops...)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Seq < out[j].Seq })
	return out, nil
}

func (s *Service) readOps(ctx context.Context, query string, args ...any) ([]Op, error) {
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Op
	for rows.Next() {
		op, err := scanOp(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, op)
	}
	return out, rows.Err()
}

// UserNames resolves account ids to display names (the name, else the email);
// unknown ids are left out. Used to label activity events.
func (s *Service) UserNames(ctx context.Context, ids []string) map[string]string {
	out := map[string]string{}
	for _, id := range ids {
		if _, done := out[id]; done || id == "" {
			continue
		}
		if n := s.userName(ctx, id); n != "" {
			out[id] = n
		}
	}
	return out
}
