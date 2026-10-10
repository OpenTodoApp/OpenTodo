package httpapi

import (
	"encoding/base64"
	"strings"
	"testing"
)

// TestRestNotesDocRoundTrip (collaborative-rich-text, task 1.2): the REST API
// accepts and returns notes_doc on create, patch, get and list, refuses an
// invalid value with invalid_input and changes nothing, keeps description as
// plain Markdown text, and the export carries both fields.
func TestRestNotesDocRoundTrip(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)

	// Default: a task created with only a title has an empty notes_doc (the
	// client default); the server stores no field it was not sent.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Plain"})
	e.mustStatus(resp, 201, out)
	if v, has := out["notes_doc"]; has && v != "" {
		t.Fatalf("notes_doc on a plain task = %v", v)
	}

	doc := "ydoc:v1:" + base64.StdEncoding.EncodeToString([]byte{1, 1, 200, 3, 0, 7, 1, 9})
	md := "# Plan\n\n**call** the plumber\n\n- [ ] buy washers"
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Fix sink", "description": md, "notes_doc": doc})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if out["notes_doc"] != doc || out["description"] != md {
		t.Fatalf("create returned %v", out)
	}

	// Invalid values: 400 invalid_input, and the stored pair is untouched.
	for _, bad := range []any{"not an envelope", "ydoc:v1:@@@", 7, "ydoc:v1:" + strings.Repeat("A", 256*1024)} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"description": "overwritten", "notes_doc": bad})
		e.mustStatus(resp, 400, out)
		if code := out["error"].(map[string]any)["code"]; code != "invalid_input" {
			t.Fatalf("code = %v", code)
		}
	}
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Bad", "notes_doc": "nope"})
	e.mustStatus(resp, 400, out)

	// A plain-text write (scripts, older clients) only touches description; the
	// document is folded back by the next rich-text client (docs/sync.md).
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"description": "- [ ] call the plumber"})
	e.mustStatus(resp, 200, out)
	if out["description"] != "- [ ] call the plumber" || out["notes_doc"] != doc {
		t.Fatalf("patch returned %v", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if out["notes_doc"] != doc {
		t.Fatalf("get notes_doc = %v", out["notes_doc"])
	}
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	found := false
	for _, x := range out["tasks"].([]any) {
		if m := x.(map[string]any); m["id"] == id {
			found = m["notes_doc"] == doc
		}
	}
	if !found {
		t.Fatalf("list lacks notes_doc: %v", out)
	}

	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	ok := false
	for _, x := range out["tasks"].([]any) {
		if m := x.(map[string]any); m["id"] == id {
			ok = m["notes_doc"] == doc && m["description"] == "- [ ] call the plumber"
		}
	}
	if !ok || out["version"] != float64(1) {
		t.Fatalf("export lacks notes_doc/description: %v", out["tasks"])
	}

	// A device syncing an oversized document gets invalid_op.
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "phone", "cursor": 0, "ops": []any{
		map[string]any{"id": "p-1", "entity": "task", "entityId": id, "field": "notes_doc", "value": "ydoc:v1:" + strings.Repeat("A", 256*1024), "ts": 5, "device": "phone"},
	}})
	e.mustStatus(resp, 400, out)
	if code := out["error"].(map[string]any)["code"]; code != "invalid_op" {
		t.Fatalf("sync code = %v", code)
	}
}
