package cli

import "testing"

// agentRouteAllowed mirrors the server's agent content routes, including the
// ones of OpenSpec change agent-tools-complete.
func TestAgentRouteAllowedMirrorsServer(t *testing.T) {
	for _, c := range []struct {
		method, path string
		body         map[string]any
		want         bool
	}{
		{"POST", "/tasks", map[string]any{"title": "x"}, true},
		{"PATCH", "/tasks/t", map[string]any{"fields": map[string]any{"f": 1}}, true},
		{"PATCH", "/tasks/t", map[string]any{"assignee_id": nil}, false},
		{"PATCH", "/projects/p", map[string]any{"description": "n", "icon": nil, "parent_id": "q"}, true},
		{"PATCH", "/projects/p", map[string]any{"archived": true}, true},
		{"PATCH", "/projects/p", map[string]any{"archived": true, "name": "x"}, false},
		{"PATCH", "/projects/p", map[string]any{"workspace_id": nil}, false},
		{"POST", "/sections", map[string]any{"name": "Doing"}, true},
		{"PATCH", "/sections/s", map[string]any{"name": "Done", "position": 1}, true},
		{"DELETE", "/sections/s", nil, false},
		{"PATCH", "/labels/l", map[string]any{"name": "errands"}, true},
		{"DELETE", "/labels/l", nil, false},
		{"POST", "/reminders", map[string]any{"task_id": "t"}, true},
		{"PATCH", "/reminders/r", map[string]any{"offset_minutes": -5}, true},
		{"PATCH", "/reminders/r", map[string]any{"kind": "absolute"}, false},
		{"DELETE", "/reminders/r", nil, true},
		{"POST", "/time-entries", map[string]any{"taskId": "t"}, true},
		{"POST", "/time-entries/stop", nil, true},
		{"PATCH", "/time-entries/e", map[string]any{"note": "n"}, true},
		{"PATCH", "/time-entries/e", map[string]any{"taskId": "t"}, false},
		{"DELETE", "/time-entries/e", nil, false},
		{"POST", "/sync", nil, false},
	} {
		if got := agentRouteAllowed(c.method, c.path, c.body); got != c.want {
			t.Errorf("%s %s %v = %v, want %v", c.method, c.path, c.body, got, c.want)
		}
	}
}
