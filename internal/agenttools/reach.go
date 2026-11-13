package agenttools

import (
	"context"
	"encoding/json"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// reachTools are the tools a token limited to workspaces may call (OpenSpec
// change token-workspaces, D4): they read and write workspace content only
// through the sync service, which applies the request's reach. Every other
// tool answers token_restricted, so a new tool stays closed to such tokens
// until it is added here on purpose (TestReachToolsAreKnown keeps the list honest).
var reachTools = map[string]bool{
	// Reads.
	"get_task": true, "list_tasks": true, "search_tasks": true, "today_summary": true,
	"list_projects": true, "list_workspaces": true, "list_icons": true,
	"list_notes": true, "get_note": true, "search_notes": true, "list_time_entries": true,
	// Writes.
	"create_tasks": true, "update_tasks": true, "move_tasks": true, "schedule_tasks": true,
	"complete_tasks": true, "reopen_tasks": true, "trash_tasks": true,
	"add_comment": true, "add_reminders": true, "update_reminders": true, "remove_reminders": true,
	"create_project": true, "update_project": true, "archive_projects": true, "set_favourite": true,
	"create_sections": true, "update_sections": true, "reorder_sections": true,
	"create_label": true, "update_labels": true,
	"create_note": true, "update_note": true, "append_to_note": true, "note_to_task": true, "trash_note": true,
	"log_time": true, "start_timer": true, "stop_timer": true, "update_time_entries": true,
}

// reachRefused answers a tool a workspace-limited token may not call.
func reachRefused(ctx context.Context, name string) *ToolError {
	if !opsync.Reached(ctx) || reachTools[name] {
		return nil
	}
	return toolErr("token_restricted", "this token is limited to chosen workspaces; "+name+" covers the whole account, so it is not available to it")
}

// placeInReach puts a new task, project, label, note or view of a
// workspace-limited request without a workspace, project or parent in the
// request's first workspace (token-workspaces D3), never the account's default.
func placeInReach(ctx context.Context, ch Change) {
	ws := opsync.ReachWorkspaces(ctx)
	if !ch.Create || len(ws) == 0 || ch.Patch == nil {
		return
	}
	switch ch.Entity {
	case "task", "project", "label", "note", "view":
	default:
		return
	}
	if _, has := ch.Patch["workspace_id"]; has {
		return
	}
	for _, f := range []string{"project_id", "parent_id"} {
		if v, has := ch.Patch[f]; has && string(v) != "null" && string(v) != `""` {
			return
		}
	}
	ch.Patch["workspace_id"] = json.RawMessage(opsync.QuoteJSON(ws[0]))
}
