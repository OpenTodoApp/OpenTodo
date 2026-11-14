package httpapi

import (
	"net/http"
	"testing"
	"time"
)

// OpenSpec change habits-assistant, habits "Habits route".

func habitEnv(t *testing.T) (*env, string) {
	t.Helper()
	e := ownerEnv(t)
	e.now.Freeze(time.Date(2026, 10, 12, 12, 0, 0, 0, time.Local))
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Water", "due": map[string]any{"date": "2026-10-12"}, "recurrence": "every day", "habit": true})
	e.mustStatus(resp, 201, out)
	return e, out["id"].(string)
}

func TestHabitsRouteLogsWater(t *testing.T) {
	e, water := habitEnv(t)
	c := e.bearerClient()
	full := e.token("full")
	// A phone shortcut logs water: today's record is done, the series moves on.
	resp, out := c.do("POST", "/api/v1/habits/"+water+"/log", map[string]any{"state": "done"}, bearer(full)...)
	c.mustStatus(resp, 200, out)
	h := out["habit"].(map[string]any)
	if h["current_date"] != "2026-10-13" || h["streak"] != float64(1) || h["kept_days"] != float64(1) || out["server_time"] == nil {
		t.Fatalf("answer = %v", out)
	}
	days := out["days"].([]any)
	if d := days[0].(map[string]any); len(days) != 1 || d["date"] != "2026-10-12" || d["state"] != "done" {
		t.Fatalf("days = %v", days)
	}
	resp, out = e.do("GET", "/api/v1/habits", nil)
	e.mustStatus(resp, 200, out)
	if list := out["habits"].([]any); len(list) != 1 || list[0].(map[string]any)["untrusted_text"].(map[string]any)["title"] != "Water" {
		t.Fatalf("list = %v", out)
	}
	// Skip through the API keeps the streak.
	resp, out = e.do("POST", "/api/v1/habits/"+water+"/log", map[string]any{"state": "skipped", "date": "2026-10-12"})
	e.mustStatus(resp, 200, out)
	if h := out["habit"].(map[string]any); h["streak"] != float64(0) || h["current_date"] != "2026-10-13" {
		t.Fatalf("after skip = %v", h)
	}
}

func TestHabitsRouteRefusals(t *testing.T) {
	e, water := habitEnv(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Report"})
	e.mustStatus(resp, 201, out)
	plain := out["id"].(string)
	before := countOps(t, e)
	c := e.bearerClient()
	// Not signed in.
	resp, out = c.do("POST", "/api/v1/habits/"+water+"/log", map[string]any{"state": "done"})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous = %d %v", resp.StatusCode, out)
	}
	// A read token reads, but cannot write.
	read := e.token("read")
	resp, out = c.do("POST", "/api/v1/habits/"+water+"/log", map[string]any{"state": "done"}, bearer(read)...)
	if resp.StatusCode != http.StatusForbidden || errCode(out) != "insufficient_scope" {
		t.Fatalf("read token = %d %v", resp.StatusCode, out)
	}
	resp, out = c.do("GET", "/api/v1/habits/"+water, nil, bearer(read)...)
	c.mustStatus(resp, 200, out)
	for _, tc := range []struct {
		body       map[string]any
		path, code string
		status     int
	}{
		{map[string]any{"state": "maybe"}, water, "invalid_input", 400},
		{map[string]any{}, water, "invalid_input", 400},
		{map[string]any{"state": "done", "date": "2026-10-13"}, water, "invalid_input", 400},
		{map[string]any{"state": "done", "date": "2026-09-01"}, water, "invalid_input", 400},
		{map[string]any{"state": "done"}, plain, "not_a_habit", 400},
		{map[string]any{"state": "done"}, "nope", "not_found", 404},
	} {
		resp, out = e.do("POST", "/api/v1/habits/"+tc.path+"/log", tc.body)
		if resp.StatusCode != tc.status || errCode(out) != tc.code {
			t.Fatalf("%v = %d %v", tc.body, resp.StatusCode, out)
		}
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("refusals wrote: %d → %d", before, after)
	}
}

func TestHabitsRouteAgentToken(t *testing.T) {
	e, _, secret, c := agentReady(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Walk", "due": map[string]any{"date": localToday(e.now.Now())}, "recurrence": "every day", "habit": true})
	e.mustStatus(resp, 201, out)
	walk := out["id"].(string)
	resp, out = c.do("POST", "/api/v1/habits/"+walk+"/log", map[string]any{"state": "tiny", "note": "around the block"}, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	if h := out["habit"].(map[string]any); h["kept_days"] != float64(1) {
		t.Fatalf("answer = %v", out)
	}
	e.allowMyAssistants(false)
	resp, out = c.do("POST", "/api/v1/habits/"+walk+"/log", map[string]any{"state": "done", "date": localToday(e.now.Now())}, bearer(secret)...)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("agent with writes off = %d %v", resp.StatusCode, out)
	}
}
