package sync

import (
	"context"
	"encoding/json"
	"sort"
)

// TaskPage is one task as a task page needs it (OpenSpec `task-pages`, design
// D1): the task, its live subtasks up to three levels, its live comments and its
// live attachments, read from the one scope the task lives in, in a fixed number
// of queries. The HTTP layer projects them to the fields a guest may see.
type TaskPage struct {
	// Scope is the scope the task lives in: the publisher's personal scope or a
	// shared project's.
	Scope string
	// Shared reports a shared project's scope; Role is the publisher's role in
	// the task's project (owner for a personal task).
	Shared bool
	Role   string
	// ProjectArchived reports a task whose project is archived.
	ProjectArchived bool
	Task            Entity
	Subtasks        []Entity // ordered by depth-first position; each has "depth" 1..3
	Comments        []Entity // ordered by created_at
	Attachments     []Entity // on the task itself (not on comments), by created_at
}

// TaskPageMaxDepth is how deep subtasks are shown on a page.
const TaskPageMaxDepth = 3

// TaskPageData reads taskID as the publisher sees it. ok is false when the task
// is gone (deleted, purged, never seen), its project is deleted, or the
// publisher no longer sees it.
func (s *Service) TaskPageData(ctx context.Context, publisherID, taskID string) (tp TaskPage, ok bool, err error) {
	task, err := s.Get(ctx, publisherID, "task", taskID)
	if err != nil || task == nil || task.deleted() {
		return tp, false, err
	}
	tp.Task = task
	tp.Role, tp.Scope = RoleOwner, PersonalScope(publisherID)
	if pid := idValue(task["project_id"]); pid != "" {
		role, shared, err := projectRole(ctx, s.reader(), publisherID, pid)
		if err != nil || role == "" {
			return tp, false, err
		}
		tp.Role, tp.Shared = role, shared
		if shared {
			tp.Scope = ProjectScope(pid)
		}
		project, err := s.scopeEntities(ctx, tp.Scope, "project", pid)
		if err != nil {
			return tp, false, err
		}
		p := project[pid]
		if p == nil || p.deleted() {
			return tp, false, nil
		}
		var archived bool
		_ = json.Unmarshal(p["archived"], &archived)
		tp.ProjectArchived = archived
	}
	tasks, err := s.scopeEntities(ctx, tp.Scope, "task", "")
	if err != nil {
		return tp, false, err
	}
	children := map[string][]Entity{}
	for _, t := range tasks {
		if t.deleted() {
			continue
		}
		if parent := idValue(t["parent_id"]); parent != "" {
			children[parent] = append(children[parent], t)
		}
	}
	var walk func(parent string, depth int)
	walk = func(parent string, depth int) {
		kids := children[parent]
		sort.SliceStable(kids, func(i, j int) bool { return kids[i].number("position") < kids[j].number("position") })
		for _, k := range kids {
			k["depth"] = json.RawMessage{byte('0' + depth)}
			tp.Subtasks = append(tp.Subtasks, k)
			if depth < TaskPageMaxDepth {
				walk(idValue(k["id"]), depth+1)
			}
		}
	}
	walk(taskID, 1)
	for _, kind := range []string{"comment", "attachment"} {
		list, err := s.scopeEntities(ctx, tp.Scope, kind, "")
		if err != nil {
			return tp, false, err
		}
		for _, e := range list {
			if e.deleted() || idValue(e["task_id"]) != taskID {
				continue
			}
			if kind == "comment" {
				tp.Comments = append(tp.Comments, e)
			} else if idValue(e["comment_id"]) == "" {
				tp.Attachments = append(tp.Attachments, e)
			}
		}
	}
	byCreated := func(l []Entity) {
		sort.SliceStable(l, func(i, j int) bool { return l[i].number("created_at") < l[j].number("created_at") })
	}
	byCreated(tp.Comments)
	byCreated(tp.Attachments)
	return tp, true, nil
}

// scopeEntities materialises the entities of one kind in one scope (only id
// when id is set).
func (s *Service) scopeEntities(ctx context.Context, scope, entity, id string) (map[string]Entity, error) {
	q := `SELECT entity_id, field, value FROM scope_fields WHERE scope_id = ? AND entity = ?`
	args := []any{scope, entity}
	if id != "" {
		q += ` AND entity_id = ?`
		args = append(args, id)
	}
	rows, err := s.reader().QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]Entity{}
	for rows.Next() {
		var eid, field, value string
		if err := rows.Scan(&eid, &field, &value); err != nil {
			return nil, err
		}
		e := out[eid]
		if e == nil {
			e = Entity{"id": json.RawMessage(QuoteJSON(eid))}
			out[eid] = e
		}
		e[field] = json.RawMessage(value)
	}
	return out, rows.Err()
}
