package httpapi

import (
	"strings"
	"testing"
)

// CalDAV and workspaces (OpenSpec change workspaces, task 4.1).
func TestCalDAVTwoWorkspaces(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	garden := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Website", "workspace_id": work})
	e.mustStatus(resp, 201, out)
	website := out["id"].(string)

	_, body := c.must("PROPFIND", "/dav/calendars/"+c.uid+"/", propfindCalendars, 207, "Depth", "1")
	for _, want := range []string{
		"<d:displayname>Garden</d:displayname>", "<d:displayname>Inbox</d:displayname>",
		"<d:displayname>Work · Website</d:displayname>", "<d:displayname>Work · Inbox</d:displayname>",
		c.cal("inbox"), c.cal("inbox-" + work), c.cal(website),
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("listing lacks %q:\n%s", want, body)
		}
	}
	// A VTODO created in Work's Inbox is a task of Work's Inbox.
	c.must("PUT", c.cal("inbox-"+work)+"call.ics", vtodoBody("call-1", "SUMMARY:Call the client"), 201)
	var id string
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	for _, raw := range out["tasks"].([]any) {
		tk := raw.(map[string]any)
		if tk["title"] == "Call the client" {
			id = tk["id"].(string)
			if tk["workspace_id"] != work || tk["project_id"] != nil {
				t.Fatalf("task = %v", tk)
			}
		}
	}
	if id == "" {
		t.Fatal("task not created")
	}
	_, body = c.must("PROPFIND", c.cal("inbox-"+work), propfindCalendars, 207, "Depth", "1")
	if !strings.Contains(body, "call.ics") {
		t.Fatalf("Work inbox lacks the task:\n%s", body)
	}

	// Project moved between workspaces: same path, new name.
	resp, out = e.do("PATCH", "/api/v1/projects/"+garden, map[string]any{"workspace_id": work})
	e.mustStatus(resp, 200, out)
	_, body = c.must("PROPFIND", c.cal(garden), propfindCalendars, 207, "Depth", "0")
	if !strings.Contains(body, "<d:displayname>Work · Garden</d:displayname>") {
		t.Fatalf("moved calendar:\n%s", body)
	}
	// An unknown workspace inbox is not a calendar.
	c.must("PROPFIND", c.cal("inbox-nope"), propfindCalendars, 404, "Depth", "0")
}
