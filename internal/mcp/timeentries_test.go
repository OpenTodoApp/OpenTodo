package mcp

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/pixari/opentodo/internal/agenttools"
)

// list_time_entries and tracked_minutes (OpenSpec change time-tracking, D11).
func TestTimeEntriesReadTool(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t1", "Write the report", map[string]any{"due": map[string]any{"date": "2026-03-10"}})
	// 2026-03-09 10:00Z for 40 minutes, 2026-03-10 22:50Z running (Rome: 2026-03-10 23:50).
	f.put("u1", "time_entry", "e1", map[string]any{"task_id": "t1", "user_id": "u1", "started_at": 1773050400000, "ended_at": 1773052800000, "note": "draft", "device_id": "d", "created_at": 1})
	f.put("u1", "time_entry", "e2", map[string]any{"task_id": "t1", "user_id": "u1", "started_at": 1773183000000, "ended_at": nil, "note": "enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "device_id": "d", "created_at": 1})
	// "Entries of a week".
	res := f.tool("u1", "list_time_entries", map[string]any{"from": "2026-03-09", "to": "2026-03-15", "timezone": "Europe/Rome"})
	list := res["time_entries"].([]any)
	if len(list) != 2 || res["server_time"] == nil {
		t.Fatalf("entries = %v", res)
	}
	newest := list[0].(map[string]any)
	if newest["id"] != "e2" || newest["ended_at"] != nil || newest["minutes"] != float64(40) || ut(newest)["note"] != "[encrypted]" || ut(newest)["task"] != "Write the report" {
		t.Fatalf("newest = %v", newest)
	}
	if ut(list[1].(map[string]any))["note"] != "draft" || list[1].(map[string]any)["minutes"] != float64(40) {
		t.Fatalf("older = %v", list[1])
	}
	if res := f.tool("u1", "list_time_entries", map[string]any{"running": true}); len(res["time_entries"].([]any)) != 1 {
		t.Fatalf("running = %v", res)
	}
	if res := f.tool("u1", "list_time_entries", map[string]any{"limit": 1}); res["next_cursor"] == nil {
		t.Fatalf("paging = %v", res)
	} else if p2 := f.tool("u1", "list_time_entries", map[string]any{"limit": 1, "cursor": res["next_cursor"]}); p2["time_entries"].([]any)[0].(map[string]any)["id"] != "e1" {
		t.Fatalf("page 2 = %v", p2)
	}
	// "Today's tasks" carry tracked_minutes; so does the task resource.
	today := f.tool("u1", "list_tasks", map[string]any{"view": "today", "timezone": "Europe/Rome"})
	if tk := today["tasks"].([]any); len(tk) != 1 || tk[0].(map[string]any)["tracked_minutes"] != float64(80) {
		t.Fatalf("today = %v", today)
	}
	r := f.call("u1", "resources/read", map[string]any{"uri": "opentodo://tasks/t1"})
	var payload map[string]any
	_ = json.Unmarshal([]byte(r["result"].(map[string]any)["contents"].([]any)[0].(map[string]any)["text"].(string)), &payload)
	if payload["task"].(map[string]any)["tracked_minutes"] != float64(80) {
		t.Fatalf("resource = %v", payload)
	}
	// "No write tool for entries": none listed for an agent with every switch on.
	agent := agenttools.Caller{UserID: "u1", TokenID: "tk", Scope: "agent", OwnerAllowsWrites: true, UserAllowsWrites: true}
	out, _ := f.srv.Handle(context.Background(), agent, []byte(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	var lr map[string]any
	_ = json.Unmarshal(out, &lr)
	for _, tl := range lr["result"].(map[string]any)["tools"].([]any) {
		if n := tl.(map[string]any)["name"].(string); n != "list_time_entries" && containsAny(n, "time", "track") {
			t.Fatalf("write tool for entries: %s", n)
		}
	}
	out, _ = f.srv.Handle(context.Background(), agent, []byte(`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"start_time_entry","arguments":{}}}`))
	_ = json.Unmarshal(out, &lr)
	if errCode(lr) != CodeInvalidParams {
		t.Fatalf("start_time_entry: %v", lr)
	}
	if r := f.call("u1", "tools/call", map[string]any{"name": "list_time_entries", "arguments": map[string]any{"from": "2026-13-01"}}); errCode(r) != CodeInvalidParams {
		t.Fatalf("bad from: %v", r)
	}
}

func containsAny(s string, subs ...string) bool {
	for _, x := range subs {
		for i := 0; i+len(x) <= len(s); i++ {
			if s[i:i+len(x)] == x {
				return true
			}
		}
	}
	return false
}
