package httpapi

import (
	"strings"
	"testing"
	"time"
)

// Planning fields on every assistant surface (OpenSpec change
// agent-planning-fields): the MCP write tools, the agent REST routes and the
// task results.

// rpcArgError calls a tool and returns the JSON-RPC -32602 message ("" when the
// call did not fail that way).
func (e *env) rpcArgError(secret, name string, args map[string]any) string {
	e.t.Helper()
	out := e.rpc(secret, "tools/call", map[string]any{"name": name, "arguments": args})
	er, ok := out["error"].(map[string]any)
	if !ok || er["code"] != float64(-32602) {
		return ""
	}
	return er["message"].(string)
}

func (e *env) newTask(body map[string]any) string {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/tasks", body)
	e.mustStatus(resp, 201, out)
	return out["id"].(string)
}

func TestAgentPlanningFieldsWriteAndRead(t *testing.T) {
	e, _, secret, _ := agentReady(t)
	report := e.newTask(map[string]any{"title": "Quarterly report", "due": map[string]any{"date": "2026-11-02"}})
	parts := e.newTask(map[string]any{"title": "Order parts"})

	// Defer and set a deadline in one update; due is untouched.
	e.mustTool(secret, "update_tasks", map[string]any{"updates": []any{
		map[string]any{"id": report, "start": "2026-11-03", "deadline": "2026-11-06", "evening": true, "blocked_by": []string{parts}},
	}})
	got := e.task(report)
	if got["start"] != "2026-11-03" || got["deadline"] != "2026-11-06" || got["evening"] != true {
		t.Fatalf("stored = %v", got)
	}
	if d, _ := got["due"].(map[string]any); d["date"] != "2026-11-02" {
		t.Fatalf("due changed: %v", got["due"])
	}
	// The read carries the fields and the derived blocked state.
	task := e.mustTool(secret, "get_task", map[string]any{"id": report})["task"].(map[string]any)
	if task["start"] != "2026-11-03" || task["deadline"] != "2026-11-06" || task["evening"] != true || task["blocked"] != true {
		t.Fatalf("get_task = %v", task)
	}
	if l := task["blocked_by"].([]any); len(l) != 1 || l[0] != parts {
		t.Fatalf("blocked_by = %v", task["blocked_by"])
	}
	// The blocked filter lists it; once the blocker is completed it no longer blocks.
	list := e.mustTool(secret, "list_tasks", map[string]any{"blocked": true})["tasks"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["id"] != report {
		t.Fatalf("blocked list = %v", list)
	}
	e.mustTool(secret, "complete_tasks", map[string]any{"ids": []string{parts}})
	task = e.mustTool(secret, "get_task", map[string]any{"id": report})["task"].(map[string]any)
	if task["blocked"] != false || len(task["blocked_by"].([]any)) != 1 {
		t.Fatalf("after completing the blocker = %v", task)
	}

	// Park five tasks in Someday in one call; the Someday view lists them.
	var five []any
	for i := 0; i < 5; i++ {
		id := e.newTask(map[string]any{"title": "Idea", "due": map[string]any{"date": "2026-11-09"}})
		five = append(five, map[string]any{"id": id, "start": "someday"})
	}
	res := e.mustTool(secret, "update_tasks", map[string]any{"updates": five})
	if res["changed"] != float64(5) {
		t.Fatalf("park = %v", res)
	}
	some := e.mustTool(secret, "list_tasks", map[string]any{"view": "someday"})["tasks"].([]any)
	if len(some) != 5 {
		t.Fatalf("someday view = %d tasks", len(some))
	}
	for _, it := range some {
		if d, _ := it.(map[string]any)["due"].(map[string]any); d["date"] != "2026-11-09" {
			t.Fatalf("parking cleared the due: %v", it)
		}
	}
	if msg := e.rpcArgError(secret, "list_tasks", map[string]any{"view": "later"}); !strings.Contains(msg, "someday, anytime") {
		t.Fatalf("invalid view = %q", msg)
	}
}

func TestAgentPlanningFieldsRefusals(t *testing.T) {
	e, _, secret, _ := agentReady(t)
	a := e.newTask(map[string]any{"title": "A"})
	b := e.newTask(map[string]any{"title": "B"})
	before := countOps(t, e)

	for _, it := range []map[string]any{{"title": "X", "deadline": "next friday"}, {"title": "X", "start": "later"}, {"title": "X", "deadline": "2026-02-30"}, {"title": "X", "evening": "yes"}} {
		msg := e.rpcArgError(secret, "create_tasks", map[string]any{"items": []any{it}})
		if !strings.Contains(msg, "items[0].") {
			t.Fatalf("%v: %q", it, msg)
		}
	}
	// A cycle through the call is refused as a whole.
	msg := e.rpcArgError(secret, "update_tasks", map[string]any{"updates": []any{
		map[string]any{"id": a, "blocked_by": []string{b}}, map[string]any{"id": b, "blocked_by": []string{a}},
	}})
	if !strings.Contains(msg, "blocked_by") || !strings.Contains(msg, "cycle") {
		t.Fatalf("cycle = %q", msg)
	}
	// Self-reference.
	if msg := e.rpcArgError(secret, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": a, "blocked_by": []string{a}}}}); !strings.Contains(msg, "updates[0].") || !strings.Contains(msg, "blocked_by") {
		t.Fatalf("self = %q", msg)
	}
	// An unknown blocker is not_found.
	sc, isErr := e.toolCall(secret, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": a, "blocked_by": []string{"no-such-task"}}}})
	if !isErr || sc["error"] != "not_found" {
		t.Fatalf("unknown blocker = %v", sc)
	}
	// Invalid locations.
	for _, l := range []any{map[string]any{"lat": 91, "lon": 9}, map[string]any{}} {
		if msg := e.rpcArgError(secret, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": a, "location": l}}}); !strings.Contains(msg, "updates[0].location") {
			t.Fatalf("location %v: %q", l, msg)
		}
	}
	if sc, isErr := e.toolCall(secret, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": a, "location": map[string]any{"place_id": "nowhere"}}}}); !isErr || sc["error"] != "not_found" {
		t.Fatalf("unknown place = %v", sc)
	}
	if countOps(t, e) != before {
		t.Fatal("a refused call stored ops")
	}
}

func TestAgentPlanningLocation(t *testing.T) {
	e, _, secret, _ := agentReady(t)
	task := e.newTask(map[string]any{"title": "Swim"})
	gym := "pl-gym"
	resp, out := e.do("POST", "/api/v1/sync", map[string]any{"device": "d1", "ops": []map[string]any{
		{"id": "pg1", "entity": "place", "entityId": gym, "field": "name", "value": "Gym", "ts": 100, "device": "d1"},
		{"id": "pg2", "entity": "place", "entityId": gym, "field": "address", "value": "Via Roma 1, Torino", "ts": 100, "device": "d1"},
		{"id": "pg3", "entity": "place", "entityId": gym, "field": "geo", "value": map[string]any{"lat": 45.07, "lon": 7.68}, "ts": 100, "device": "d1"},
	}})
	e.mustStatus(resp, 200, out)
	e.mustTool(secret, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": task, "location": map[string]any{"place_id": gym}}}})
	loc := e.task(task)["location"].(map[string]any)
	if loc["place_id"] != gym || loc["name"] != "Gym" || loc["address"] != "Via Roma 1, Torino" || loc["lat"] != 45.07 {
		t.Fatalf("stored location = %v", loc)
	}
	read := e.mustTool(secret, "get_task", map[string]any{"id": task})["task"].(map[string]any)
	ut := read["untrusted_text"].(map[string]any)["location"].(map[string]any)
	if ut["name"] != "Gym" || read["location"].(map[string]any)["place_id"] != gym {
		t.Fatalf("read location = %v / %v", ut, read["location"])
	}
	// A plain location by coordinates; null removes it.
	e.mustTool(secret, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": task, "location": map[string]any{"name": "Pool", "lat": 45.1234567, "lon": 9.1}}}})
	if loc := e.task(task)["location"].(map[string]any); loc["lat"] != 45.123457 {
		t.Fatalf("rounded = %v", loc)
	}
	e.mustTool(secret, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": task, "location": nil}}})
	if e.task(task)["location"] != nil {
		t.Fatal("location not removed")
	}
}

func TestAgentPlanningEncryptedAccount(t *testing.T) {
	e, _, secret, _ := agentReady(t)
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	cipher := "enc:v1:" + strings.Repeat("A", 40)
	id := e.newTask(map[string]any{"title": cipher, "location": cipher, "deadline": "2026-11-06"})
	sc, isErr := e.toolCall(secret, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "location": map[string]any{"name": "Gym"}}}})
	if !isErr || sc["error"] != "encryption_enabled" {
		t.Fatalf("plaintext location = %v", sc)
	}
	e.mustTool(secret, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "start": "someday", "deadline": "2026-11-07"}}})
	other := "enc:v1:" + strings.Repeat("B", 40)
	e.mustTool(secret, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "location": other}}})
	if e.task(id)["location"] != other {
		t.Fatalf("envelope not stored as given: %v", e.task(id)["location"])
	}
	read := e.mustTool(secret, "get_task", map[string]any{"id": id})["task"].(map[string]any)
	if read["location"] != nil || read["encrypted"] != true || read["deadline"] != "2026-11-07" || read["start"] != "someday" {
		t.Fatalf("encrypted read = %v", read)
	}
}

func TestAgentRestPlanningFields(t *testing.T) {
	e, _, secret, c := agentReady(t)
	id := e.newTask(map[string]any{"title": "Report"})
	other := e.newTask(map[string]any{"title": "Order parts"})
	// Issue #198: start someday through the agent REST route.
	resp, out := c.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"start": "someday"}, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	resp, out = c.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"start": "2026-10-31", "deadline": "2026-11-06", "evening": true, "blocked_by": []string{other}}, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	if out["start"] != "2026-10-31" || out["deadline"] != "2026-11-06" || out["evening"] != true {
		t.Fatalf("patched = %v", out)
	}
	resp, out = c.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"start": "later"}, bearer(secret)...)
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "start") {
		t.Fatalf("invalid start = %d %v", resp.StatusCode, out)
	}
	resp, out = c.do("POST", "/api/v1/tasks", map[string]any{"title": "Install shelves", "blocked_by": []string{other}, "deadline": "2026-11-20"}, bearer(secret)...)
	c.mustStatus(resp, 201, out)
	if l, _ := out["blocked_by"].([]any); len(l) != 1 {
		t.Fatalf("created = %v", out)
	}
}

func TestAgentPlanningDeadlineReminderFollows(t *testing.T) {
	e, _ := pushEnv(t, false)
	e.allowWrites(true)
	e.allowMyAssistants(true)
	_, secret := e.namedToken("Planner", "agent")
	e.do("POST", "/api/v1/sync", map[string]any{"device": "devA", "cursor": 0, "ops": []any{}, "tzOffset": 120})
	zone := time.FixedZone("", 7200)
	id := e.newTask(map[string]any{"title": "Tax return", "due": map[string]any{"date": "2026-11-02"}, "deadline": "2026-11-06"})
	resp, rem := e.do("POST", "/api/v1/reminders", map[string]any{"task_id": id, "kind": "deadline", "offset_minutes": -1440})
	e.mustStatus(resp, 201, rem)
	rid := rem["id"].(string)
	e.mustTool(secret, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "deadline": "2026-11-12"}}})
	resp, rem = e.do("GET", "/api/v1/reminders/"+rid, nil)
	e.mustStatus(resp, 200, rem)
	if want := time.Date(2026, 11, 11, 9, 0, 0, 0, zone).UnixMilli(); int64(rem["fire_at"].(float64)) != want {
		t.Fatalf("fire_at after an assistant's deadline edit = %v, want %d", rem["fire_at"], want)
	}
}
