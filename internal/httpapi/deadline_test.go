package httpapi

import (
	"testing"
	"time"
)

// TestTaskDeadlineREST covers the REST side of deadlines (OpenSpec change
// deadlines, task 1.4): the field is created and patched through the schema
// path independently of due, invalid values are refused with invalid_input and
// leave it unchanged, and it is part of the export.
func TestTaskDeadlineREST(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Tax return", "due": map[string]any{"date": "2026-11-02"}, "deadline": "2026-11-06"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if out["deadline"] != "2026-11-06" {
		t.Fatalf("created deadline = %v", out["deadline"])
	}

	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"due": map[string]any{"date": "2026-11-03"}})
	e.mustStatus(resp, 200, out)
	if out["deadline"] != "2026-11-06" {
		t.Fatalf("deadline after due edit = %v", out["deadline"])
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"deadline": "2026-11-12"})
	e.mustStatus(resp, 200, out)

	for _, bad := range []any{"next friday", "2026-02-30", "2026-11-06T10:00", map[string]any{"date": "2026-11-06"}, 20261106} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"deadline": bad})
		e.mustStatus(resp, 400, out)
		if code := out["error"].(map[string]any)["code"]; code != "invalid_input" {
			t.Fatalf("deadline %v: code %v", bad, code)
		}
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if out["deadline"] != "2026-11-12" {
		t.Fatalf("deadline after rejected writes = %v", out["deadline"])
	}

	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	tasks, _ := out["tasks"].([]any)
	if len(tasks) != 1 || tasks[0].(map[string]any)["deadline"] != "2026-11-12" {
		t.Fatalf("export tasks = %v", tasks)
	}

	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"deadline": nil})
	e.mustStatus(resp, 200, out)
	if out["deadline"] != nil {
		t.Fatalf("cleared deadline = %v", out["deadline"])
	}
}

// TestRestDeadlineMovesDeadlineReminders: a deadline reminder created over REST
// fires at 09:00 on the deadline plus its offset, follows a REST deadline edit
// with the same timestamp, ignores due edits, and has no firing time once the
// deadline is cleared (OpenSpec change deadlines, design D5).
func TestRestDeadlineMovesDeadlineReminders(t *testing.T) {
	e, _ := pushEnv(t, false)
	e.do("POST", "/api/v1/sync", map[string]any{"device": "devA", "cursor": 0, "ops": []any{}, "tzOffset": 120})
	zone := time.FixedZone("", 7200)
	resp, task := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Tax return", "due": map[string]any{"date": "2026-11-02"}, "deadline": "2026-11-06"})
	e.mustStatus(resp, 201, task)
	id := task["id"].(string)
	resp, rem := e.do("POST", "/api/v1/reminders", map[string]any{"task_id": id, "kind": "deadline", "offset_minutes": -1440})
	e.mustStatus(resp, 201, rem)
	rid := rem["id"].(string)
	if want := time.Date(2026, 11, 5, 9, 0, 0, 0, zone).UnixMilli(); int64(rem["fire_at"].(float64)) != want {
		t.Fatalf("created fire_at = %v, want %d", rem["fire_at"], want)
	}

	resp, out := e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"due": map[string]any{"date": "2026-11-03"}})
	e.mustStatus(resp, 200, out)
	resp, rem = e.do("GET", "/api/v1/reminders/"+rid, nil)
	e.mustStatus(resp, 200, rem)
	if want := time.Date(2026, 11, 5, 9, 0, 0, 0, zone).UnixMilli(); int64(rem["fire_at"].(float64)) != want {
		t.Fatalf("fire_at after due edit = %v, want %d", rem["fire_at"], want)
	}

	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"deadline": "2026-11-12"})
	e.mustStatus(resp, 200, out)
	resp, rem = e.do("GET", "/api/v1/reminders/"+rid, nil)
	e.mustStatus(resp, 200, rem)
	if want := time.Date(2026, 11, 11, 9, 0, 0, 0, zone).UnixMilli(); int64(rem["fire_at"].(float64)) != want {
		t.Fatalf("fire_at after deadline edit = %v, want %d", rem["fire_at"], want)
	}
	var deadlineTS, fireTS int64
	_ = e.db.QueryRow(`SELECT ts FROM scope_fields WHERE entity='task' AND field='deadline'`).Scan(&deadlineTS)
	_ = e.db.QueryRow(`SELECT ts FROM scope_fields WHERE entity='reminder' AND entity_id=? AND field='fire_at'`, rid).Scan(&fireTS)
	if deadlineTS != fireTS {
		t.Fatalf("deadline ts %d != fire_at ts %d", deadlineTS, fireTS)
	}

	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"deadline": nil})
	e.mustStatus(resp, 200, out)
	resp, rem = e.do("GET", "/api/v1/reminders/"+rid, nil)
	e.mustStatus(resp, 200, rem)
	if rem["fire_at"] != nil || rem["deleted_at"] != nil {
		t.Fatalf("after clearing the deadline: %v", rem)
	}
}
