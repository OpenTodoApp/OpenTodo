package sync

import (
	"context"
	"encoding/json"
	"sort"
)

// WorkspaceReader is a FeedReader over one workspace (OpenSpec change
// workspace-activity, design D2): the shared projects placed in it that the
// user is a member of, read whole, and the entities of the user's own scope
// placed in it (personal projects, their tasks and the workspace's Inbox, with
// the tasks' comments and time entries). Nothing else is ever read: a shared
// project the user is not a member of is outside acc.projects, so its scope is
// never named, whatever the workspace or the filters.
//
// projects, when not empty, keeps only those projects ("" names the Inbox).
// Entities whose latest op at or before upTo is before from are skipped.
// ErrNotFound when the user does not belong to the workspace.
func (s *Service) WorkspaceReader(ctx context.Context, userID, workspaceID string, projects map[string]bool, from, upTo int64) (*FeedReader, error) {
	acc, err := loadAccess(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	p, err := s.buildPartition(ctx, userID)
	if err != nil {
		return nil, err
	}
	if workspaceID == "" || !p.Known[workspaceID] {
		return nil, ErrNotFound
	}
	keep := func(pid string) bool { return len(projects) == 0 || projects[pid] }
	r := &FeedReader{s: s}
	opaque, opaqueArgs := opaqueFilter()
	for _, pid := range acc.projects {
		if p.Project(pid) != workspaceID || !keep(pid) {
			continue
		}
		ents, err := s.latestByEntity(ctx, ProjectScope(pid), from, upTo, opaque, opaqueArgs)
		if err != nil {
			return nil, err
		}
		for _, e := range ents {
			e.project = pid
			r.ents = append(r.ents, e)
		}
	}
	ents, err := s.latestByEntity(ctx, acc.personal, from, upTo, opaque, opaqueArgs)
	if err != nil {
		return nil, err
	}
	parents, err := parentTasks(ctx, s.db, acc.personal)
	if err != nil {
		return nil, err
	}
	for _, e := range ents {
		var ws, pid string
		switch e.entity {
		case "project":
			ws, pid = p.Project(e.id), e.id
		case "task":
			ws, pid = p.Task(e.id), projectOfTask(p, e.id)
		default: // a comment or a time entry: its task's
			tid := parents[e.entity+":"+e.id]
			ws, pid = p.Task(tid), projectOfTask(p, tid)
		}
		if ws != workspaceID || !keep(pid) {
			continue
		}
		e.project = pid
		r.ents = append(r.ents, e)
	}
	sort.SliceStable(r.ents, func(i, j int) bool { return r.ents[i].latest > r.ents[j].latest })
	return r, nil
}

// projectOfTask is the project a task's events belong to: its own, else its
// parent's, "" for the Inbox.
func projectOfTask(p *Partition, id string) string {
	for i := 0; i < maxDepth; i++ {
		t, ok := p.Tasks[id]
		if !ok {
			return ""
		}
		if t.ProjectID != "" {
			return t.ProjectID
		}
		if t.ParentID == "" {
			return ""
		}
		id = t.ParentID
	}
	return ""
}

// parentTasks maps "comment:<id>" and "time_entry:<id>" to their task in scope.
func parentTasks(ctx context.Context, q querier, scope string) (map[string]string, error) {
	rows, err := q.QueryContext(ctx, `SELECT entity, entity_id, value FROM scope_fields
		WHERE scope_id = ? AND entity IN ('comment','time_entry') AND field = 'task_id'`, scope)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var entity, id, raw string
		if err := rows.Scan(&entity, &id, &raw); err != nil {
			return nil, err
		}
		var tid string
		_ = json.Unmarshal([]byte(raw), &tid)
		out[entity+":"+id] = tid
	}
	return out, rows.Err()
}
