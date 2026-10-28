package httpapi

import (
	"context"
	"encoding/json"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// keepTaskWorkspace adds, to a task PATCH that takes the task out of its
// project (project_id null), the workspace_id of the workspace it was in, so it
// stays in that workspace's Inbox (OpenSpec change inbox-move-keeps-workspace,
// issue #508). The workspace is the project's root ancestor's; a default,
// unknown or foreign workspace is written as null, and nothing is added when
// the task already carries that value or the body names a workspace itself.
func (s *Server) keepTaskWorkspace(ctx context.Context, uid string, body map[string]json.RawMessage, existing opsync.Entity) error {
	moving, ok := body["project_id"]
	if !ok || !opsync.IsNull(moving) || idOf(existing["project_id"]) == "" {
		return nil
	}
	if _, set := body["workspace_id"]; set {
		return nil
	}
	list, err := s.sync.Workspaces(ctx, uid)
	if err != nil || len(list) <= 1 {
		return err
	}
	known := map[string]bool{}
	for _, w := range list {
		if !w.Default {
			known[w.ID] = true
		}
	}
	pid := idOf(existing["project_id"])
	var root opsync.Entity
	for i := 0; i < 64 && pid != ""; i++ {
		p, err := s.sync.Get(ctx, uid, "project", pid)
		if err != nil {
			return err
		}
		if p == nil {
			break
		}
		root, pid = p, idOf(p["parent_id"])
	}
	if root == nil {
		return nil
	}
	ws := idOf(root["workspace_id"])
	if !known[ws] {
		ws = ""
	}
	if ws == idOf(existing["workspace_id"]) {
		return nil
	}
	if ws == "" {
		body["workspace_id"] = json.RawMessage("null")
	} else {
		body["workspace_id"] = mustJSON(ws)
	}
	return nil
}
