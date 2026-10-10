package httpapi

import "testing"

// TestTaskPatchEstimate covers the REST side of time-blocking: estimate_minutes is
// patched independently of due, validated (invalid values leave it unchanged),
// requires authentication, and is part of the export.
func TestTaskPatchEstimate(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("PATCH", "/api/v1/tasks/x", map[string]any{"estimate_minutes": 30})
	e.mustStatus(resp, 401, out)

	resp, out = e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Plan sprint", "due": map[string]any{"date": "2026-10-13"}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	// Like every unset field, an unset estimate is absent from the row (read as null).
	if v := out["estimate_minutes"]; v != nil {
		t.Fatalf("new task estimate_minutes = %v", v)
	}

	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"estimate_minutes": 90})
	e.mustStatus(resp, 200, out)
	// Moving the block is a due edit; the estimate stays.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"due": map[string]any{"date": "2026-10-13", "time": "14:30"}})
	e.mustStatus(resp, 200, out)
	if out["estimate_minutes"] != float64(90) {
		t.Fatalf("estimate after due edit = %v", out["estimate_minutes"])
	}

	for _, bad := range []any{0, -15, 1.5, "45", 10081} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"estimate_minutes": bad})
		e.mustStatus(resp, 400, out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if out["estimate_minutes"] != float64(90) {
		t.Fatalf("estimate after rejected writes = %v", out["estimate_minutes"])
	}

	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	tasks, _ := out["tasks"].([]any)
	if len(tasks) != 1 || tasks[0].(map[string]any)["estimate_minutes"] != float64(90) {
		t.Fatalf("export tasks = %v", tasks)
	}
}
