package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// find_free_time over MCP with the calendar's events (OpenSpec change
// assistant-time-blocks, spec "Find free time"): a subscribed calendar's
// meeting takes time, and an MCP request without a token is refused.
func TestFindFreeTimeCountsCalendarEvents(t *testing.T) {
	e := ownerEnv(t)
	feedsOn(t, e)
	yes := true
	if err := e.hooks.SeedAllowPrivate(context.Background(), &yes); err != nil {
		t.Fatal(err)
	}
	src := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, icsBody) }))
	defer src.Close()
	resp, out := e.do("POST", "/api/v1/calendar-feeds/subscriptions", map[string]any{"url": src.URL})
	e.mustStatus(resp, 201, out)
	e.enableMCP(true)
	read := e.token("read")
	c := e.bearerClient()
	// The day before the meeting, so the whole of Monday is ahead.
	e.now.Freeze(time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC))

	// Team sync is 10:00-11:00 in Berlin on Monday 2026-10-19.
	res := c.mcpTool(read, "find_free_time", map[string]any{"from": "2026-10-19", "min_minutes": 60, "day_start_hour": 8, "day_end_hour": 18, "timezone": "Europe/Berlin"})
	day := res["days"].([]any)[0].(map[string]any)
	var got []string
	for _, f := range day["free"].([]any) {
		m := f.(map[string]any)
		got = append(got, m["start"].(string)+"-"+m["end"].(string))
	}
	if strings.Join(got, " ") != "08:00-10:00 11:00-18:00" {
		t.Fatalf("free = %v", got)
	}
	// The same meeting in London is an hour earlier.
	res = c.mcpTool(read, "find_free_time", map[string]any{"from": "2026-10-19", "day_start_hour": 8, "day_end_hour": 18, "timezone": "Europe/London"})
	if first := res["days"].([]any)[0].(map[string]any)["free"].([]any)[1].(map[string]any); first["start"] != "10:00" {
		t.Fatalf("London = %v", res)
	}
	// Calendar feeds off: the events no longer count.
	resp, out = e.do("PUT", "/api/v1/settings/calendar-feeds", map[string]any{"enabled": false})
	e.mustStatus(resp, 200, out)
	res = c.mcpTool(read, "find_free_time", map[string]any{"from": "2026-10-19", "day_start_hour": 8, "day_end_hour": 18})
	if n := len(res["days"].([]any)[0].(map[string]any)["free"].([]any)); n != 1 {
		t.Fatalf("feeds off: %v", res)
	}

	// Without a token: refused like every MCP request.
	anon := newClientAt(e, "10.9.9.11")
	resp, _ = anon.do("POST", "/mcp", map[string]any{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": map[string]any{"name": "find_free_time", "arguments": map[string]any{}}})
	if resp.StatusCode != 401 {
		t.Fatalf("anonymous = %d", resp.StatusCode)
	}
}
