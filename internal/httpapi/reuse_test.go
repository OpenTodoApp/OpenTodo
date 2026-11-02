package httpapi

import (
	"testing"
)

// TestReuseREST (OpenSpec reusable-lists, task 3.1): POST /api/v1/tasks with
// reuse: true in a reusable project answers the open match (200, "open"),
// reopens a completed match (200, "reopened") and creates when nothing matches
// (201); without reuse, or in an ordinary project, nothing changes.
func TestReuseREST(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Groceries"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	if out["reusable"] != false || out["aisles"] != false {
		t.Fatalf("new project flags = %v %v", out["reusable"], out["aisles"])
	}
	resp, out = e.do("PATCH", "/api/v1/projects/"+pid, map[string]any{"reusable": true, "aisles": true})
	e.mustStatus(resp, 200, out)
	if out["reusable"] != true || out["aisles"] != true {
		t.Fatalf("patched project = %v", out)
	}

	// No match: an ordinary create.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Milk", "project_id": pid, "reuse": true})
	e.mustStatus(resp, 201, out)
	milk := out["id"].(string)
	if _, has := out["reused"]; has {
		t.Fatalf("a create says reused: %v", out)
	}
	// Open match: nothing written.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "milk ", "project_id": pid, "reuse": true})
	e.mustStatus(resp, 200, out)
	if out["id"] != milk || out["reused"] != "open" {
		t.Fatalf("open match = %v", out)
	}
	// Completed match: reopened in place.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+milk, map[string]any{"completed_at": 1700000000000})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "MILK", "project_id": pid, "reuse": true})
	e.mustStatus(resp, 200, out)
	if out["id"] != milk || out["reused"] != "reopened" || out["completed_at"] != nil || out["completed_by"] != nil {
		t.Fatalf("reopened = %v", out)
	}
	// Without reuse: a second Milk, as before.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Milk", "project_id": pid})
	e.mustStatus(resp, 201, out)
	if out["id"] == milk {
		t.Fatal("a create without reuse matched")
	}
	// A subtask never matches.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Milk", "project_id": pid, "parent_id": milk, "reuse": true})
	e.mustStatus(resp, 201, out)
	// An ordinary project ignores reuse.
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	for range 2 {
		resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Report", "project_id": work, "reuse": true})
		e.mustStatus(resp, 201, out)
	}
	// reuse must be a boolean.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Eggs", "project_id": pid, "reuse": "yes"})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_input" {
		t.Fatalf("reuse yes = %v", out)
	}
	// The answer is not a field a patch can write.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+milk, map[string]any{"priority": 2, "reused": "open"})
	e.mustStatus(resp, 200, out)

	// Idempotency-Key: a retried create is replayed, never matched against itself.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Bread", "project_id": pid, "reuse": true}, "Idempotency-Key", "bread-1")
	e.mustStatus(resp, 201, out)
	bread := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Bread", "project_id": pid, "reuse": true}, "Idempotency-Key", "bread-1")
	e.mustStatus(resp, 200, out)
	if out["id"] != bread || resp.Header.Get(ReplayedHeader) != "true" {
		t.Fatalf("replay = %v %v", out, resp.Header)
	}

	// Without credentials: 401, nothing changes.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+milk, map[string]any{"completed_at": 1700000000000})
	e.mustStatus(resp, 200, out)
	anon := newClientFor(e)
	resp, out = anon.do("POST", "/api/v1/tasks", map[string]any{"title": "Milk", "project_id": pid, "reuse": true})
	anon.mustStatus(resp, 401, out)
	if e.taskField(milk, "completed_at") == nil {
		t.Fatal("an anonymous request reopened Milk")
	}
}

// TestReuseRESTShared: a viewer is refused (403) and Milk stays ticked off; an
// editor reopens it; someone outside the project gets what a create gets.
func TestReuseRESTShared(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "viewer")
	resp, out := se.alice.do("PATCH", "/api/v1/projects/"+se.project, map[string]any{"reusable": true})
	se.alice.mustStatus(resp, 200, out)
	resp, out = se.alice.do("PATCH", "/api/v1/tasks/"+se.task, map[string]any{"completed_at": 1700000000000})
	se.alice.mustStatus(resp, 200, out)

	body := map[string]any{"title": "Milk", "project_id": se.project, "reuse": true}
	resp, out = se.bob.do("POST", "/api/v1/tasks", body)
	se.bob.mustStatus(resp, 403, out)
	if errCode(out) != "forbidden" || se.alice.taskField(se.task, "completed_at") == nil {
		t.Fatalf("viewer: %v", out)
	}

	plain, plainOut := se.carol.do("POST", "/api/v1/tasks", map[string]any{"title": "Milk", "project_id": se.project})
	reusing, reuseOut := se.carol.do("POST", "/api/v1/tasks", body)
	if plain.StatusCode != reusing.StatusCode || errCode(plainOut) != errCode(reuseOut) || reusing.StatusCode < 400 {
		t.Fatalf("outsider: plain %d %v, reuse %d %v", plain.StatusCode, plainOut, reusing.StatusCode, reuseOut)
	}
	if se.alice.taskField(se.task, "completed_at") == nil {
		t.Fatal("an outsider reopened Milk")
	}

	se.share(se.alice, "carol@example.com", "editor")
	// Editors change the switches (reusable-lists D1); viewers do not.
	resp, out = se.carol.do("PATCH", "/api/v1/projects/"+se.project, map[string]any{"aisles": true})
	se.carol.mustStatus(resp, 200, out)
	resp, out = se.bob.do("PATCH", "/api/v1/projects/"+se.project, map[string]any{"reusable": false})
	se.bob.mustStatus(resp, 403, out)
	resp, out = se.carol.do("POST", "/api/v1/tasks", body)
	se.carol.mustStatus(resp, 200, out)
	if out["id"] != se.task || out["reused"] != "reopened" {
		t.Fatalf("editor reopen = %v", out)
	}
}

// TestReuseRESTEncrypted: the server cannot read an encrypted account's titles,
// so reuse creates and says "unavailable".
func TestReuseRESTEncrypted(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "enc:v1:QUJDREVGR0hJSktM", "reusable": true})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	// A ciphertext title on an account without encryption.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "enc:v1:QUJDREVGR0hJSktN", "project_id": pid, "reuse": true})
	e.mustStatus(resp, 201, out)
	if out["reused"] != "unavailable" {
		t.Fatalf("ciphertext title = %v", out)
	}
	resp, out = e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	for range 2 {
		resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "enc:v1:QUJDREVGR0hJSktP", "project_id": pid, "reuse": true})
		e.mustStatus(resp, 201, out)
		if out["reused"] != "unavailable" {
			t.Fatalf("encrypted account = %v", out)
		}
	}
}

// TestSectionAisleREST (task 1.2): a section's aisle is one of the nine keys or
// null; anything else is 400 invalid_aisle and writes nothing.
func TestSectionAisleREST(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Groceries"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/sections", map[string]any{"name": "Fridge", "project_id": pid})
	e.mustStatus(resp, 201, out)
	sid := out["id"].(string)
	if v, has := out["aisle"]; !has || v != nil {
		t.Fatalf("new section aisle = %v (present %v)", v, has)
	}
	for _, k := range []string{"produce", "bakery", "dairy", "meat", "frozen", "pantry", "drinks", "household", "personal"} {
		resp, out = e.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"aisle": k})
		e.mustStatus(resp, 200, out)
		if out["aisle"] != k {
			t.Fatalf("%s: %v", k, out)
		}
		resp, out = e.do("POST", "/api/v1/sections", map[string]any{"name": k, "project_id": pid, "aisle": k})
		e.mustStatus(resp, 201, out)
	}
	for _, bad := range []any{"deli", "Dairy", "", 3, true} {
		resp, out = e.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"aisle": bad})
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_aisle" {
			t.Fatalf("%v: %v", bad, out)
		}
		resp, out = e.do("POST", "/api/v1/sections", map[string]any{"name": "Deli", "project_id": pid, "aisle": bad})
		e.mustStatus(resp, 400, out)
	}
	resp, out = e.do("GET", "/api/v1/sections/"+sid, nil)
	e.mustStatus(resp, 200, out)
	if out["aisle"] != "personal" {
		t.Fatalf("after refusals = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"aisle": nil})
	e.mustStatus(resp, 200, out)
	if out["aisle"] != nil {
		t.Fatalf("cleared = %v", out)
	}
}
