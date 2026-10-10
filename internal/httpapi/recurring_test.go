package httpapi

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
)

func registeredEnv(t *testing.T) *env {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e
}

func dayOffset(n int) string { return time.Now().Local().AddDate(0, 0, n).Format("2006-01-02") }

func dueOf(t *testing.T, v any) map[string]any {
	t.Helper()
	m, ok := v.(map[string]any)
	if !ok {
		t.Fatalf("due = %v, want an object", v)
	}
	return m
}

func TestRestCompleteRecurringRollsForward(t *testing.T) {
	e := registeredEnv(t)
	today := dayOffset(0)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Stand-up", "recurrence": "Every  Day", "due": map[string]any{"date": today, "time": "09:00"}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if out["recurrence"] != "every day" {
		t.Fatalf("stored rule = %v, want the canonical form", out["recurrence"])
	}

	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": time.Now().UnixMilli(), "title": "Daily stand-up"})
	e.mustStatus(resp, 200, out)
	if out["completed_at"] != nil {
		t.Fatalf("series completed_at = %v, want it to stay open", out["completed_at"])
	}
	if d := dueOf(t, out["due"]); d["date"] != dayOffset(1) || d["time"] != "09:00" {
		t.Fatalf("series due = %v, want tomorrow 09:00", d)
	}
	if out["recurrence"] != "every day" || out["title"] != "Daily stand-up" {
		t.Fatalf("series = %v", out)
	}

	recordID := occurrenceID(id, today)
	resp, out = e.do("GET", "/api/v1/tasks/"+recordID, nil)
	e.mustStatus(resp, 200, out)
	if out["series_id"] != id || out["recurrence"] != nil || out["completed_at"] == nil || out["title"] != "Daily stand-up" {
		t.Fatalf("occurrence record = %v", out)
	}
	if d := dueOf(t, out["due"]); d["date"] != today {
		t.Fatalf("record due = %v, want the completed occurrence", d)
	}

	// A device that completed the same occurrence offline syncs later: same record
	// id, so there is still exactly one record.
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "phone", "cursor": 0, "ops": []map[string]any{
		{"id": "p1", "entity": "task", "entityId": recordID, "field": "completed_at", "value": time.Now().UnixMilli(), "ts": time.Now().UnixMilli(), "device": "phone"},
		{"id": "p2", "entity": "task", "entityId": recordID, "field": "series_id", "value": id, "ts": time.Now().UnixMilli(), "device": "phone"},
		{"id": "p3", "entity": "task", "entityId": id, "field": "due", "value": map[string]any{"date": dayOffset(1), "time": "09:00"}, "ts": time.Now().UnixMilli(), "device": "phone"},
	}})
	e.mustStatus(resp, 200, out)
	if n := countRecords(t, e, id); n != 1 {
		t.Fatalf("records after concurrent completion = %d, want 1", n)
	}
}

func countRecords(t *testing.T, e *env, seriesID string) int {
	t.Helper()
	resp, out := e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	n := 0
	for _, raw := range out["tasks"].([]any) {
		if task := raw.(map[string]any); task["series_id"] == seriesID && task["completed_at"] != nil {
			n++
		}
	}
	return n
}

func TestRestRecurringEndConditionsAndCompletionRelative(t *testing.T) {
	e := registeredEnv(t)
	// for 2 times: the first completion rolls, the second completes the series.
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Twice", "recurrence": "every day for 2 times", "due": map[string]any{"date": dayOffset(0)}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": 1})
	e.mustStatus(resp, 200, out)
	if out["completed_at"] != nil || dueOf(t, out["due"])["date"] != dayOffset(1) {
		t.Fatalf("after first completion: %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": 2})
	e.mustStatus(resp, 200, out)
	if out["completed_at"] != float64(2) {
		t.Fatalf("after last completion: completed_at = %v, want the series completed", out["completed_at"])
	}
	if n := countRecords(t, e, id); n != 1 {
		t.Fatalf("records = %d, want 1 (the last completion is the series itself)", n)
	}

	// Completion-relative: counted from the server's local date, not the stale due date.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Mow", "recurrence": "every 3 days after completion", "due": map[string]any{"date": "2020-01-01"}})
	e.mustStatus(resp, 201, out)
	mow := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+mow, map[string]any{"completed_at": 3})
	e.mustStatus(resp, 200, out)
	if d := dueOf(t, out["due"]); d["date"] != dayOffset(3) {
		t.Fatalf("completion-relative due = %v, want %s", d, dayOffset(3))
	}

	// A plain task still completes normally.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Once"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+out["id"].(string), map[string]any{"completed_at": 4})
	e.mustStatus(resp, 200, out)
	if out["completed_at"] != float64(4) {
		t.Fatalf("plain completion = %v", out)
	}
}

func TestRestRecurrenceValidation(t *testing.T) {
	e := registeredEnv(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Bad", "recurrence": "every blursday"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Ok", "due": map[string]any{"date": "2026-10-12"}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"recurrence": "every mon, wed, fri"})
	e.mustStatus(resp, 200, out)
	if out["recurrence"] != "every monday, wednesday, friday" {
		t.Fatalf("recurrence = %v", out["recurrence"])
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"recurrence": "every day until 2026-02-30"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if out["recurrence"] != "every monday, wednesday, friday" {
		t.Fatalf("rule after rejected write = %v, want the previous rule", out["recurrence"])
	}
	// Auth is required like every other task route.
	anon := newClientFor(e)
	resp, out = anon.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": 1})
	anon.mustStatus(resp, 401, out)
}

func TestRestCompletionOfDeletedSeriesIsPlain(t *testing.T) {
	e := registeredEnv(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Gone", "recurrence": "every day", "due": map[string]any{"date": dayOffset(0)}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	uid := ""
	for _, u := range mustUsers(t, e) {
		uid = u
	}
	// Tombstone through the op log, then complete via REST: no record is created.
	if _, err := e.sync.Apply(context.Background(), uid, []opsync.Op{{ID: "d1", Entity: "task", EntityID: id, Field: "deleted_at", Value: json.RawMessage("5"), TS: time.Now().UnixMilli(), Device: "x"}}); err != nil {
		t.Fatal(err)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": 6})
	e.mustStatus(resp, 200, out)
	if n := countRecords(t, e, id); n != 0 {
		t.Fatalf("records = %d, want 0 for a deleted series", n)
	}
}

func mustUsers(t *testing.T, e *env) []string {
	t.Helper()
	rows, err := e.db.Query(`SELECT id FROM users`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		out = append(out, id)
	}
	return out
}
