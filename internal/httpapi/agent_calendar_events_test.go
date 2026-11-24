package httpapi

import (
	"testing"
)

// The calendar event tools over MCP (calendar-event-edits, tasks 6.1–6.2).
func TestAgentCalendarEventTools(t *testing.T) {
	e := newEventEnv(t)
	e.enableMCP(true)
	e.allowWrites(true)
	e.allowMyAssistants(true)
	_, secret := e.namedToken("Desk assistant", "agent")
	e.setOptions(map[string]any{"edit_events": true})
	list := func() map[string]any {
		out := e.mustTool(secret, "list_calendar_events", map[string]any{"from": e.day, "to": e.day})
		for _, x := range out["events"].([]any) {
			if ev := x.(map[string]any); ev["untrusted_text"].(map[string]any)["summary"] == "Standup" {
				return ev
			}
		}
		t.Fatalf("no Standup in %v", out)
		return nil
	}
	ev := list()
	if acc := ev["access"].(map[string]any); acc["update"] != false || acc["reason"] != "assistant_edits_off" || acc["delete"] != nil {
		t.Fatalf("access without the assistant switch = %v", acc)
	}
	args := map[string]any{"connection_id": ev["connection_id"], "event_id": ev["id"], "rev": ev["rev"], "summary": "Planning"}
	if sc, isErr := e.toolCall(secret, "update_calendar_event", args); !isErr || sc["error"] != "assistant_edits_off" {
		t.Fatalf("switch off = %v", sc)
	}
	e.setOptions(map[string]any{"assistant_edits": true})
	ev = list()
	if ev["access"].(map[string]any)["update"] != true {
		t.Fatalf("access = %v", ev["access"])
	}
	stale := map[string]any{"connection_id": ev["connection_id"], "event_id": ev["id"], "rev": "0000000000000000", "summary": "Planning"}
	if sc, isErr := e.toolCall(secret, "update_calendar_event", stale); !isErr || sc["error"] != "event_changed" {
		t.Fatalf("stale = %v", sc)
	}
	if sc, isErr := e.toolCall(secret, "update_calendar_event", map[string]any{"connection_id": ev["connection_id"], "event_id": ev["id"], "rev": ev["rev"], "summary": "\r\n"}); !isErr || sc["error"] != "invalid_input" {
		t.Fatalf("empty title = %v", sc)
	}
	args["rev"] = ev["rev"]
	out := e.mustTool(secret, "update_calendar_event", args)
	moved := out["event"].(map[string]any)
	if moved["untrusted_text"].(map[string]any)["summary"] != "Planning" || out["undo"] == nil {
		t.Fatalf("update = %v", out)
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'agent.write' AND details LIKE '%update_calendar_event%'`).Scan(&n)
	var m int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'calendar_event.changed' AND details LIKE '%token_id%'`).Scan(&m)
	if n < 1 || m != 1 {
		t.Fatalf("audit agent.write %d, calendar_event.changed %d", n, m)
	}
	// The person sees who changed it and undoes it.
	served, _ := e.event("Planning")
	if cb, _ := served["changedBy"].(map[string]any); cb["name"] != "Desk assistant" {
		t.Fatalf("changedBy = %v", served["changedBy"])
	}
	resp, undo := e.do("POST", e.path+served["id"].(string)+"/undo", nil)
	e.mustStatus(resp, 200, undo)
	if undo["event"].(map[string]any)["summary"] != "Standup" {
		t.Fatalf("undo = %v", undo)
	}
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'calendar_event.changed' AND details LIKE '%undone%'`).Scan(&n)
	if n != 1 {
		t.Fatalf("%d undo events", n)
	}
	// No tool deletes an event.
	res := e.rpc(secret, "tools/list", map[string]any{})
	for _, tool := range res["result"].(map[string]any)["tools"].([]any) {
		if name := tool.(map[string]any)["name"].(string); name == "delete_calendar_event" {
			t.Fatal("delete_calendar_event is offered")
		}
	}
	if out := e.rpc(secret, "tools/call", map[string]any{"name": "delete_calendar_event", "arguments": map[string]any{"event_id": ev["id"]}}); rpcCode(out) == 0 {
		t.Fatalf("delete_calendar_event answered %v", out)
	}
	// A token limited to workspaces gets token_restricted from both tools.
	resp, ws := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, ws)
	limited := e.token(map[string]any{"name": "Work assistant", "scope": "agent", "workspaces": []string{ws["id"].(string)}})
	gets := e.cal.Count("GET")
	for _, name := range []string{"list_calendar_events", "update_calendar_event"} {
		if sc, isErr := e.toolCall(limited, name, map[string]any{"from": e.day, "to": e.day, "connection_id": ev["connection_id"], "event_id": ev["id"], "rev": ev["rev"], "summary": "x"}); !isErr || sc["error"] != "token_restricted" {
			t.Fatalf("%s with a limited token = %v", name, sc)
		}
	}
	if e.cal.Count("GET") != gets {
		t.Fatal("a limited token reached the calendar")
	}
	// The owner's switch off: the write tool is not offered and is refused.
	e.allowWrites(false)
	if sc, isErr := e.toolCall(secret, "update_calendar_event", args); !isErr || sc["error"] != "writes_disabled_by_owner" {
		t.Fatalf("owner off = %v", sc)
	}
}
