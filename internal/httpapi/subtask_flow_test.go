package httpapi

import "testing"

// TestSubtaskFlowREST (OpenSpec change subtask-flow, GitHub issue 1046): a
// task's flow_mode is accepted on create and patch as "", "parallel" or
// "sequential" (null clears it), and anything else is refused with 400 invalid_input, writing
// nothing; a request without credentials is refused.
func TestSubtaskFlowREST(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Paint the doghouse", "flow_mode": "sequential"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if out["flow_mode"] != "sequential" {
		t.Fatalf("created = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"flow_mode": "parallel"})
	e.mustStatus(resp, 200, out)
	for _, bad := range []any{"area", "Sequential", 1, true} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"flow_mode": bad})
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" {
			t.Fatalf("%v: code %v", bad, out)
		}
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if out["flow_mode"] != "parallel" {
		t.Fatalf("a refused patch wrote: %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"flow_mode": nil})
	e.mustStatus(resp, 200, out)
	if out["flow_mode"] != "" {
		t.Fatalf("null did not clear it: %v", out)
	}
	resp, out = e.do("POST", "/api/v1/auth/logout", nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"flow_mode": "sequential"})
	e.mustStatus(resp, 401, out)
}
