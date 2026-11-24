package httpapi

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

// OpenSpec change server-series-move (#1991): the REST API, and the CLI and
// assistants through it, refuse to move a series onto one of its records.

// runSeries is "Run", every Sunday at 08:00, whose 29 November is done (it
// was completed there) and which now stands on 6 December.
func runSeries(t *testing.T, e *env) string {
	t.Helper()
	e.now.Freeze(time.Date(2026, 11, 24, 12, 0, 0, 0, time.Local))
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Run", "due": map[string]any{"date": "2026-11-29", "time": "08:00"}, "recurrence": "every sunday"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": e.now.Now().UnixMilli()})
	e.mustStatus(resp, 200, out)
	if due := out["due"].(map[string]any); due["date"] != "2026-12-06" {
		t.Fatalf("series due = %v, want 6 December", due)
	}
	return id
}

func TestRESTSeriesMoveOntoRecord(t *testing.T) {
	e := ownerEnv(t)
	run := runSeries(t, e)
	resp, out := e.do("POST", "/api/v1/tasks/"+run+"/occurrences/2026-12-13/skip", nil)
	e.mustStatus(resp, 200, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+run+"/occurrences/2026-12-20", map[string]any{"due": map[string]any{"date": "2026-12-21", "time": "08:00"}})
	e.mustStatus(resp, 200, out)

	for date, why := range map[string]string{"2026-11-29": "is already done", "2026-12-13": "was skipped", "2026-12-20": "was moved"} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+run, map[string]any{"due": map[string]any{"date": date, "time": "08:00"}, "title": "Long run"})
		if resp.StatusCode != http.StatusConflict || errCode(out) != "series_date_taken" {
			t.Fatalf("%s: %d %v, want 409 series_date_taken", date, resp.StatusCode, out)
		}
		if msg := out["error"].(map[string]any)["message"].(string); !strings.Contains(msg, date+" "+why) {
			t.Fatalf("%s: message %q does not say it %s", date, msg, why)
		}
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+run, nil)
	e.mustStatus(resp, 200, out)
	if out["due"].(map[string]any)["date"] != "2026-12-06" || out["title"] != "Run" {
		t.Fatalf("series changed: %v", out)
	}
	// A free date, earlier ones included, still moves it.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+run, map[string]any{"due": map[string]any{"date": "2026-11-22", "time": "08:00"}})
	e.mustStatus(resp, 200, out)
	if out["due"].(map[string]any)["date"] != "2026-11-22" {
		t.Fatalf("free date: %v", out)
	}
}

func TestMCPSeriesMoveOntoRecord(t *testing.T) {
	e, _, secret, c := agentReady(t)
	run := runSeries(t, e)
	sc, isErr := c.toolCall(secret, "schedule_tasks", map[string]any{"ids": []string{run}, "due": map[string]any{"date": "2026-11-29"}})
	if !isErr {
		t.Fatalf("schedule_tasks onto a done occurrence succeeded: %v", sc)
	}
	msg, _ := sc["message"].(string)
	items, _ := sc["items"].([]any)
	if sc["error"] != "series_date_taken" || !strings.Contains(msg, "2026-11-29 is already done") || len(items) != 1 {
		t.Fatalf("tool error = %v", sc)
	}
	if item := items[0].(map[string]any); item["date"] != "2026-11-29" || item["state"] != "done" {
		t.Fatalf("item = %v", item)
	}
	if got := e.taskField(run, "due").(map[string]any)["date"]; got != "2026-12-06" {
		t.Fatalf("due = %v, want 6 December", got)
	}
	c.mustTool(secret, "schedule_tasks", map[string]any{"ids": []string{run}, "due": map[string]any{"date": "2026-12-27"}})
	if got := e.taskField(run, "due").(map[string]any)["date"]; got != "2026-12-27" {
		t.Fatalf("due = %v, want 27 December", got)
	}
}
