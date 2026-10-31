package httpapi

import (
	"strings"
	"testing"
)

// Standalone notes REST (OpenSpec change notes-overview, "Notes in the API",
// "Plain-text replacement checks the version", the append and to-task routes).

func TestNotesCollectionAndVersionCheck(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Home"})
	e.mustStatus(resp, 201, out)
	project := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/notes", map[string]any{"title": "Wi-Fi", "description": "- network: home", "project_id": project})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	v1, _ := out["body_version"].(string)
	if v1 == "" || v1 == "0" || out["appends"] == nil || out["description"] != "- network: home" {
		t.Fatalf("created note: %v", out)
	}
	resp, out = e.do("GET", "/api/v1/notes", nil)
	e.mustStatus(resp, 200, out)
	if notes := out["notes"].([]any); len(notes) != 1 {
		t.Fatalf("list: %v", out)
	}
	// A note is not a task.
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	for _, task := range out["tasks"].([]any) {
		if task.(map[string]any)["id"] == id {
			t.Fatal("note listed as a task")
		}
	}
	// A replacement with the version read is accepted.
	resp, out = e.do("PATCH", "/api/v1/notes/"+id, map[string]any{"description": "- network: office"}, "If-Match", `"`+v1+`"`)
	e.mustStatus(resp, 200, out)
	v2 := out["body_version"].(string)
	if v2 == v1 {
		t.Fatalf("version did not move: %v", out)
	}
	// With the old version it is refused and nothing is written.
	resp, out = e.do("PATCH", "/api/v1/notes/"+id, map[string]any{"description": "stale"}, "If-Match", `"`+v1+`"`)
	if resp.StatusCode != 409 || errCode(out) != "body_changed" || out["error"].(map[string]any)["body_version"] != v2 {
		t.Fatalf("stale: %d %v", resp.StatusCode, out)
	}
	// Without If-Match a PATCH behaves as before; a title change keeps the version.
	resp, out = e.do("PATCH", "/api/v1/notes/"+id, map[string]any{"title": "Router"})
	e.mustStatus(resp, 200, out)
	if out["body_version"] != v2 || out["description"] != "- network: office" {
		t.Fatalf("title patch: %v", out)
	}
	// Validation: an unknown project, a long title.
	resp, out = e.do("POST", "/api/v1/notes", map[string]any{"title": "x", "project_id": "nope"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("unknown project: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/notes", map[string]any{"title": strings.Repeat("a", MaxNoteTitle+1)})
	if resp.StatusCode != 400 {
		t.Fatalf("long title: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("GET", "/api/v1/notes/unknown", nil)
	if resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("unknown: %d %v", resp.StatusCode, out)
	}
}

func TestNoteAppendRoutes(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/notes", map[string]any{"title": "Meeting", "description": "Agenda"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/notes/"+id+"/append", map[string]any{"text": "- decided: ship Friday"})
	e.mustStatus(resp, 201, out)
	appendID := out["append_id"].(string)
	if appendID == "" || out["entity_id"] != id {
		t.Fatalf("append: %v", out)
	}
	// Readable before any device folds it, and the description is untouched.
	resp, out = e.do("GET", "/api/v1/notes/"+id, nil)
	e.mustStatus(resp, 200, out)
	appends := out["appends"].([]any)
	if out["description"] != "Agenda" || len(appends) != 1 || appends[0].(map[string]any)["text"] != "- decided: ship Friday" {
		t.Fatalf("read: %v", out)
	}
	if _, has := out["appends."+appendID]; has {
		t.Fatalf("raw family field in the representation: %v", out)
	}
	// A retry with the same id and text is answered as written; another text conflicts.
	resp, out = e.do("POST", "/api/v1/notes/"+id+"/append", map[string]any{"id": appendID, "text": "- decided: ship Friday"})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/notes/"+id+"/append", map[string]any{"id": appendID, "text": "other"})
	if resp.StatusCode != 409 || errCode(out) != "conflict" {
		t.Fatalf("taken id: %d %v", resp.StatusCode, out)
	}
	// A task's note.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Call", "description": "number"})
	e.mustStatus(resp, 201, out)
	task := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks/"+task+"/note/append", map[string]any{"text": "- called, no answer"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("GET", "/api/v1/tasks/"+task, nil)
	e.mustStatus(resp, 200, out)
	if len(out["appends"].([]any)) != 1 || out["body_version"] == "" {
		t.Fatalf("task read: %v", out)
	}
	for _, c := range []struct {
		path string
		body map[string]any
		code int
	}{
		{"/api/v1/notes/unknown/append", map[string]any{"text": "x"}, 404},
		{"/api/v1/notes/" + id + "/append", map[string]any{"text": " "}, 400},
		{"/api/v1/notes/" + id + "/append", map[string]any{"text": strings.Repeat("a", MaxNoteText+1)}, 400},
		{"/api/v1/notes/" + id + "/append", map[string]any{"id": "bad id", "text": "x"}, 400},
	} {
		resp, out = e.do("POST", c.path, c.body)
		if resp.StatusCode != c.code {
			t.Fatalf("%s %v: %d %v", c.path, c.body, resp.StatusCode, out)
		}
	}
}

func TestNoteToTaskRoute(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Home"})
	e.mustStatus(resp, 201, out)
	project := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/notes", map[string]any{"title": "Call the plumber", "description": "- leaking tap", "project_id": project})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/notes/"+id+"/to-task", nil)
	e.mustStatus(resp, 201, out)
	if out["title"] != "Call the plumber" || out["description"] != "- leaking tap" || out["project_id"] != project {
		t.Fatalf("task: %v", out)
	}
	resp, out = e.do("GET", "/api/v1/notes/"+id, nil)
	if resp.StatusCode != 404 {
		t.Fatalf("note not in the Trash: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/notes/"+id+"/to-task", nil)
	if resp.StatusCode != 404 {
		t.Fatalf("again: %d %v", resp.StatusCode, out)
	}
	// History and purge of a note.
	resp, out = e.do("GET", "/api/v1/notes/"+id+"/history", nil)
	e.mustStatus(resp, 200, out)
	resp, _ = e.do("DELETE", "/api/v1/notes/"+id+"/purge", nil)
	if resp.StatusCode != 200 && resp.StatusCode != 204 {
		t.Fatalf("purge: %d", resp.StatusCode)
	}
	resp, out = e.do("GET", "/api/v1/notes/"+id+"/history", nil)
	if resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("history after purge: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/notes", map[string]any{"title": "Live"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("DELETE", "/api/v1/notes/"+out["id"].(string)+"/purge", nil)
	if resp.StatusCode != 409 || errCode(out) != "not_deleted" {
		t.Fatalf("purge live: %d %v", resp.StatusCode, out)
	}
}

func TestNoteRoutesAuthScopesAndRoles(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/notes", map[string]any{"title": "Mine"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	anon := e.bearerClient()
	for _, rt := range [][2]string{{"GET", "/api/v1/notes"}, {"POST", "/api/v1/notes/" + id + "/append"}, {"GET", "/api/v1/notes/" + id + "/history"}, {"DELETE", "/api/v1/notes/" + id + "/purge"}, {"PATCH", "/api/v1/notes/" + id}} {
		resp, out = anon.do(rt[0], rt[1], map[string]any{"text": "x", "description": "x"}, "If-Match", `"0"`)
		if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
			t.Fatalf("anonymous %s %s: %d %v", rt[0], rt[1], resp.StatusCode, out)
		}
	}
	before := countOps(t, e)
	for _, secret := range []string{e.token("read"), e.token("agent")} {
		resp, out = anon.do("GET", "/api/v1/notes/"+id, nil, bearer(secret)...)
		e.mustStatus(resp, 200, out)
		for _, rt := range [][2]string{{"POST", "/api/v1/notes"}, {"POST", "/api/v1/notes/" + id + "/append"}, {"POST", "/api/v1/notes/" + id + "/to-task"}, {"POST", "/api/v1/tasks/x/note/append"}} {
			resp, out = anon.do(rt[0], rt[1], map[string]any{"title": "x", "text": "x"}, bearer(secret)...)
			if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
				t.Fatalf("%s %s: %d %v", rt[0], rt[1], resp.StatusCode, out)
			}
		}
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("ops changed: %d → %d", before, after)
	}
	// A viewer of a shared project reads its notes and cannot write them.
	se := newShareEnv(t)
	resp, out = se.alice.do("POST", "/api/v1/notes", map[string]any{"title": "Plan", "project_id": se.project})
	se.alice.mustStatus(resp, 201, out)
	shared := out["id"].(string)
	se.share(se.alice, "bob@example.com", "viewer")
	resp, out = se.bob.do("GET", "/api/v1/notes/"+shared, nil)
	se.bob.mustStatus(resp, 200, out)
	resp, out = se.bob.do("PATCH", "/api/v1/notes/"+shared, map[string]any{"title": "Viewer"})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("viewer patch: %d %v", resp.StatusCode, out)
	}
	resp, out = se.bob.do("POST", "/api/v1/notes/"+shared+"/append", map[string]any{"text": "x"})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("viewer append: %d %v", resp.StatusCode, out)
	}
}

func TestNoteRoutesOnEncryptedAccount(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/notes", map[string]any{"title": "enc:v1:QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlq"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/notes/"+id+"/append", map[string]any{"text": "call back"})
	if resp.StatusCode != 409 || errCode(out) != "encryption_enabled" {
		t.Fatalf("plaintext append: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/notes/"+id+"/append", map[string]any{"text": "enc:v1:QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlq"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/notes/"+id+"/to-task", nil)
	if resp.StatusCode != 409 || errCode(out) != "encryption_enabled" {
		t.Fatalf("to-task without sealed values: %d %v", resp.StatusCode, out)
	}
	sealed := "enc:v1:QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlq"
	resp, out = e.do("POST", "/api/v1/notes/"+id+"/to-task", map[string]any{"task_id": "t-sealed", "title": sealed, "description": sealed})
	e.mustStatus(resp, 201, out)
	if out["id"] != "t-sealed" || out["title"] != sealed {
		t.Fatalf("sealed to-task: %v", out)
	}
}
