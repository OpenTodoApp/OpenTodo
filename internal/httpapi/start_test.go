package httpapi

import "testing"

// TestTaskStartEveningREST covers the REST side of someday-and-evening (task
// 1.4): both fields go through the schema path, invalid values are refused
// with invalid_input, and the export carries them.
func TestTaskStartEveningREST(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Learn Italian", "start": "someday"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if out["start"] != "someday" {
		t.Fatalf("created start = %v", out["start"])
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"start": "2027-03-01", "evening": true})
	e.mustStatus(resp, 200, out)
	if out["start"] != "2027-03-01" || out["evening"] != true {
		t.Fatalf("patched = %v", out)
	}
	for _, bad := range []map[string]any{{"start": "later"}, {"start": "2026-02-30"}, {"evening": "yes"}} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+id, bad)
		e.mustStatus(resp, 400, out)
		if code := out["error"].(map[string]any)["code"]; code != "invalid_input" {
			t.Fatalf("%v: code %v", bad, code)
		}
	}
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	tasks, _ := out["tasks"].([]any)
	if len(tasks) != 1 || tasks[0].(map[string]any)["start"] != "2027-03-01" || tasks[0].(map[string]any)["evening"] != true {
		t.Fatalf("export tasks = %v", tasks)
	}
}
