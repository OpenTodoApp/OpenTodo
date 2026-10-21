package agenttools

import (
	"context"
	"errors"
	"time"
)

// Resource payloads for the MCP server (mcp-server design D4): built from the
// same reads as the tools, with the same exclusions and the same
// untrusted-text marking. ok is false when the resource does not exist for
// this user (unknown, deleted or foreign, indistinguishable).

// ParseZone resolves an IANA zone argument ("" and "UTC" are UTC); name is the
// argument's name for the error message.
func ParseZone(tz, name string) (*time.Location, error) { return parseZone(tz, name) }

// ProjectsResource is opentodo://projects.
func (r *Registry) ProjectsResource(ctx context.Context, userID string) (map[string]any, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	return noticed(r.projectsPayload(snap, false)), nil
}

// ProjectResource is opentodo://projects/{id}: the project, its sections and
// its open tasks.
func (r *Registry) ProjectResource(ctx context.Context, userID, id string, loc *time.Location) (map[string]any, bool, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, false, err
	}
	proj, ok := snap.projects[id]
	if !ok {
		return nil, false, nil
	}
	res, err := r.queryTasks(snap, taskQuery{view: "all", projectID: id, loc: loc, limit: MaxItems})
	if err != nil {
		return nil, false, err
	}
	type sectionOut struct {
		ID        string   `json:"id"`
		Untrusted nameText `json:"untrusted_text"`
	}
	sections := []sectionOut{}
	secs, err := r.list(ctx, userID, "section", false)
	if err != nil {
		return nil, false, err
	}
	for _, sec := range secs {
		if str(sec, "project_id") == id {
			sections = append(sections, sectionOut{ID: str(sec, "id"), Untrusted: nameText{Name: str(sec, "name")}})
		}
	}
	return noticed(map[string]any{"project": snap.renderProject(proj, snap.openCounts()), "sections": sections,
		"tasks": res["tasks"], "truncated": res["next_cursor"] != nil, "timezone": res["timezone"], "today": res["today"], "server_time": res["server_time"]}), true, nil
}

// TaskResource is opentodo://tasks/{id}, the same payload as get_task.
func (r *Registry) TaskResource(ctx context.Context, userID, id string, loc *time.Location) (map[string]any, bool, error) {
	detail, err := r.taskDetail(ctx, userID, id, loc)
	if errors.Is(err, ErrTaskNotFound) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return noticed(detail), true, nil
}

// ViewResource is opentodo://views/{inbox,today,upcoming}.
func (r *Registry) ViewResource(ctx context.Context, userID, view string, loc *time.Location) (map[string]any, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	res, err := r.queryTasks(snap, taskQuery{view: view, loc: loc, limit: MaxItems})
	if err != nil {
		return nil, err
	}
	res["truncated"] = res["next_cursor"] != nil
	delete(res, "next_cursor")
	return noticed(res), nil
}

func noticed(m map[string]any) map[string]any {
	m["_notice"] = Notice
	return m
}
