package httpapi

import (
	"encoding/json"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
)

// Agent content routes added by OpenSpec change agent-tools-complete (design
// D1, D7): project notes, parents, icons and archiving, sections, labels,
// reminders and time entries, each a thin translation into the registry's
// tools. Every mapper answers the calls, a refusal (403 insufficient_scope)
// or a malformed request (400 invalid_input).

// agentPatchProjectCalls maps a project PATCH: name, color, icon, parent_id and
// description go to update_project (icon and parent_id may be null); archived
// goes to archive_projects and only on its own (D4).
func agentPatchProjectCalls(id string, body map[string]json.RawMessage) ([]agenttools.ToolCall, string, string) {
	if v, ok := body["archived"]; ok {
		if len(body) > 1 {
			return nil, "", "project.archived: archive on its own, without other fields in the same request"
		}
		return []agenttools.ToolCall{{Name: "archive_projects", Args: mustJSON(map[string]any{"id": id, "archived": v})}}, "", ""
	}
	args := map[string]any{"id": id}
	for k, v := range body {
		switch k {
		case "icon", "parent_id":
			args[k] = v
		case "name", "color", "description":
			if string(v) != "null" {
				args[k] = v
			}
		default:
			return nil, refusedField("project", k), ""
		}
	}
	return []agenttools.ToolCall{{Name: "update_project", Args: mustJSON(args)}}, "", ""
}

// pick copies the allowed body fields into tool arguments (null dropped) and
// refuses any other field.
func pick(entity string, body map[string]json.RawMessage, allowed ...string) (map[string]any, string) {
	ok := map[string]bool{}
	for _, f := range allowed {
		ok[f] = true
	}
	out := map[string]any{}
	for k, v := range body {
		if !ok[k] {
			return nil, refusedField(entity, k)
		}
		if string(v) != "null" {
			out[k] = v
		}
	}
	return out, ""
}

// agentMoreCalls maps the section, label, reminder and time entry routes.
func agentMoreCalls(route, id string, body map[string]json.RawMessage) ([]agenttools.ToolCall, string, string) {
	one := func(name string, args map[string]any) []agenttools.ToolCall {
		return []agenttools.ToolCall{{Name: name, Args: mustJSON(args)}}
	}
	switch route {
	case agentCreateSection:
		item, refusal := pick("section", body, "name", "project_id", "color", "icon", "position")
		if refusal != "" {
			return nil, refusal, ""
		}
		pid := item["project_id"]
		delete(item, "project_id")
		return one("create_sections", map[string]any{"project_id": pid, "items": []any{item}}), "", ""
	case agentPatchSection:
		upd, refusal := pick("section", body, "name", "color", "icon", "position")
		if refusal != "" {
			return nil, refusal, ""
		}
		for _, f := range []string{"color", "icon"} {
			if v, ok := body[f]; ok && string(v) == "null" {
				upd[f] = v
			}
		}
		upd["id"] = id
		return one("update_sections", map[string]any{"updates": []any{upd}}), "", ""
	case agentPatchLabel:
		upd, refusal := pick("label", body, "name", "color", "position")
		if refusal != "" {
			return nil, refusal, ""
		}
		upd["id"] = id
		return one("update_labels", map[string]any{"updates": []any{upd}}), "", ""
	case agentCreateReminder, agentPatchReminder:
		return agentReminderCalls(route, id, body)
	case agentDeleteReminder:
		return one("remove_reminders", map[string]any{"ids": []string{id}}), "", ""
	case agentStartTime:
		var stop bool
		if v, ok := body["stopRunning"]; ok && json.Unmarshal(v, &stop) != nil {
			return nil, "", "stopRunning: must be true or false"
		}
		args, refusal := pick("time_entry", body, "taskId", "startedAt", "endedAt", "note", "stopRunning")
		if refusal != "" {
			return nil, refusal, ""
		}
		out := map[string]any{"task_id": args["taskId"]}
		if args["note"] != nil {
			out["note"] = args["note"]
		}
		if args["startedAt"] == nil && args["endedAt"] == nil {
			if stop {
				out["stop_running"] = true
			}
			return one("start_timer", out), "", ""
		}
		if stop {
			return nil, "", "stopRunning: only when starting a timer"
		}
		out["started_at"], out["ended_at"] = args["startedAt"], args["endedAt"]
		return one("log_time", map[string]any{"items": []any{out}}), "", ""
	case agentStopTime:
		return one("stop_timer", map[string]any{}), "", ""
	case agentPatchTime:
		args, refusal := pick("time_entry", body, "startedAt", "endedAt", "note")
		if refusal != "" {
			return nil, refusal, ""
		}
		upd := map[string]any{"id": id}
		for from, to := range map[string]string{"startedAt": "started_at", "endedAt": "ended_at", "note": "note"} {
			if v, ok := args[from]; ok {
				upd[to] = v
			}
		}
		return one("update_time_entries", map[string]any{"updates": []any{upd}}), "", ""
	}
	return nil, "", ""
}

// agentReminderCalls maps a reminder POST or PATCH. The REST body names an
// absolute reminder's moment as fire_at (Unix ms); the tools take a date and
// a time, so it is passed on as that minute in UTC.
func agentReminderCalls(route, id string, body map[string]json.RawMessage) ([]agenttools.ToolCall, string, string) {
	allowed := []string{"offset_minutes", "fire_at"}
	if route == agentCreateReminder {
		allowed = append(allowed, "task_id", "kind")
	}
	args, refusal := pick("reminder", body, allowed...)
	if refusal != "" {
		return nil, refusal, ""
	}
	if v, ok := args["fire_at"]; ok {
		var ms int64
		if json.Unmarshal(v.(json.RawMessage), &ms) != nil || ms <= 0 || ms%60_000 != 0 {
			return nil, "", "reminder.fire_at: must be Unix milliseconds on a whole minute"
		}
		t := time.UnixMilli(ms).UTC()
		args["at"] = map[string]any{"date": t.Format("2006-01-02"), "time": t.Format("15:04"), "tz": "UTC"}
		delete(args, "fire_at")
	}
	if route == agentCreateReminder {
		if _, ok := args["kind"]; !ok {
			// The REST default (completeReminderBody): absolute.
			args["kind"] = "absolute"
		}
		return []agenttools.ToolCall{{Name: "add_reminders", Args: mustJSON(map[string]any{"items": []any{args}})}}, "", ""
	}
	args["id"] = id
	return []agenttools.ToolCall{{Name: "update_reminders", Args: mustJSON(map[string]any{"updates": []any{args}})}}, "", ""
}
