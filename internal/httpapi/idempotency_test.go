package httpapi

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/ids"
)

// Idempotency-Key on POST /api/v1/{collection} (OpenSpec change
// `agent-ready-cli`, design D5).

func keyHeader(k string, more ...string) []string {
	return append([]string{IdempotencyHeader, k}, more...)
}

func countTitled(t *testing.T, e *env, title string) int {
	t.Helper()
	resp, out := e.do("GET", "/api/v1/tasks?include_deleted=true", nil)
	e.mustStatus(resp, 200, out)
	n := 0
	for _, tk := range out["tasks"].([]any) {
		if tk.(map[string]any)["title"] == title {
			n++
		}
	}
	return n
}

func TestIdempotentCreateReplay(t *testing.T) {
	e := ownerEnv(t)
	resp, first := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk"}, keyHeader("k1")...)
	e.mustStatus(resp, 201, first)
	if resp.Header.Get(ReplayedHeader) != "" {
		t.Fatal("first create marked as replayed")
	}
	before := countOps(t, e)
	resp, second := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk"}, keyHeader("k1")...)
	e.mustStatus(resp, 200, second)
	if resp.Header.Get(ReplayedHeader) != "true" || second["id"] != first["id"] || second["created_at"] != first["created_at"] {
		t.Fatalf("replay: %v %v (%s)", first, second, resp.Header.Get(ReplayedHeader))
	}
	if n := countTitled(t, e, "Buy milk"); n != 1 {
		t.Fatalf("tasks = %d", n)
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("a replay wrote ops: %d → %d", before, after)
	}
	// Explicit defaults are the same content.
	resp, third := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk", "priority": 4}, keyHeader("k1")...)
	e.mustStatus(resp, 200, third)
	// The same key in another collection names another entity.
	resp, label := e.do("POST", "/api/v1/labels", map[string]any{"name": "errand"}, keyHeader("k1")...)
	e.mustStatus(resp, 201, label)
	if label["id"] == first["id"] {
		t.Fatal("collections share keyed ids")
	}
	// A keyed label without colour replays with the colour it got.
	resp, again := e.do("POST", "/api/v1/labels", map[string]any{"name": "errand"}, keyHeader("k1")...)
	e.mustStatus(resp, 200, again)
	if again["color"] != label["color"] {
		t.Fatalf("label colour changed on replay: %v → %v", label["color"], again["color"])
	}
	// A tombstone replays as stored, with deleted_at.
	resp, out := e.do("DELETE", "/api/v1/tasks/"+first["id"].(string), nil)
	e.mustStatus(resp, 204, out)
	resp, gone := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk"}, keyHeader("k1")...)
	e.mustStatus(resp, 200, gone)
	if gone["id"] != first["id"] || gone["deleted_at"] == nil {
		t.Fatalf("tombstone replay: %v", gone)
	}
}

func TestIdempotentCreateConflict(t *testing.T) {
	e := ownerEnv(t)
	resp, first := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk", "description": "2 litres"}, keyHeader("k1")...)
	e.mustStatus(resp, 201, first)
	before := countOps(t, e)
	for _, body := range []map[string]any{
		{"title": "Buy bread", "description": "2 litres"},
		{"title": "Buy milk"}, // the original had a description
		{"title": "Buy milk", "description": "2 litres", "priority": 1},
	} {
		resp, out := e.do("POST", "/api/v1/tasks", body, keyHeader("k1")...)
		if resp.StatusCode != 409 || errCode(out) != "idempotency_conflict" {
			t.Fatalf("%v: %d %v", body, resp.StatusCode, out)
		}
	}
	if countOps(t, e) != before || e.taskField(first["id"].(string), "title") != "Buy milk" {
		t.Fatal("a conflicting reuse changed something")
	}
	// Later edits of the entity do not turn a replay into a conflict: the
	// original create is compared, not the current values.
	resp, out := e.do("PATCH", "/api/v1/tasks/"+first["id"].(string), map[string]any{"title": "Buy oat milk"})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk", "description": "2 litres"}, keyHeader("k1")...)
	e.mustStatus(resp, 200, out)
	if out["title"] != "Buy oat milk" {
		t.Fatalf("replay should return the stored entity: %v", out)
	}
}

func TestIdempotencyKeyInvalid400(t *testing.T) {
	e := ownerEnv(t)
	for _, k := range []string{strings.Repeat("a", 200), "has space", "", "ünï", "a/b"} {
		resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "x"}, keyHeader(k)...)
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "Idempotency-Key") {
			t.Fatalf("key %q: %d %v", k, resp.StatusCode, out)
		}
	}
	if n := countOps(t, e); n != 0 {
		t.Fatalf("ops after invalid keys = %d", n)
	}
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "x"}, keyHeader(strings.Repeat("a", 128))...)
	e.mustStatus(resp, 201, out)
	// Unauthenticated and read-token keyed creates are refused like any create.
	anon := newClientAt(e, "203.0.113.9")
	resp, out = anon.do("POST", "/api/v1/tasks", map[string]any{"title": "x"}, keyHeader("k2", "Cookie", "")...)
	if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
		t.Fatalf("anonymous: %d %v", resp.StatusCode, out)
	}
	read := e.token("read")
	resp, out = e.bearerClient().do("POST", "/api/v1/tasks", map[string]any{"title": "x"}, keyHeader("k2", bearer(read)...)...)
	if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
		t.Fatalf("read token: %d %v", resp.StatusCode, out)
	}
	if countTitled(t, e, "x") != 1 {
		t.Fatal("a refused keyed create wrote")
	}
}

func TestIdempotentCreateConvergesAcrossDevices(t *testing.T) {
	e := ownerEnv(t)
	resp, first := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk"}, keyHeader("run42-milk")...)
	e.mustStatus(resp, 201, first)
	id := first["id"].(string)
	phone := syncOnce(e, "phone", 0, nil)
	seen := 0
	for _, op := range phone["ops"].([]any) {
		if op.(map[string]any)["entityId"] == id {
			seen++
		}
	}
	if seen == 0 {
		t.Fatal("the phone did not receive the keyed create")
	}
	// The phone renames it offline; a retried create arrives later.
	syncOnce(e, "phone", phone["cursor"].(float64), []map[string]any{{"id": ids.New(), "entity": "task", "entityId": id, "field": "title", "value": "Buy milk (oat)", "ts": 4102444800000, "device": "phone"}})
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk"}, keyHeader("run42-milk")...)
	e.mustStatus(resp, 200, out)
	if out["id"] != id || out["title"] != "Buy milk (oat)" || countTitled(t, e, "Buy milk (oat)") != 1 {
		t.Fatalf("after offline rename and retry: %v", out)
	}
	laptop := syncOnce(e, "laptop", 0, nil)
	titles := map[string]bool{}
	for _, op := range laptop["ops"].([]any) {
		m := op.(map[string]any)
		if m["field"] == "title" {
			titles[m["entityId"].(string)] = true
		}
	}
	if len(titles) != 1 || !titles[id] {
		t.Fatalf("laptop sees tasks %v", titles)
	}
}

// TestIdempotencyKeysScopedPerUser: the same key used by two people names two
// entities; one user's key never returns, overwrites or collides with another
// user's entity, even one planted under the derived id in a shared project.
func TestIdempotencyKeysScopedPerUser(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	resp, a := se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Same"}, keyHeader("k1")...)
	se.alice.mustStatus(resp, 201, a)
	resp, b := se.bob.do("POST", "/api/v1/tasks", map[string]any{"title": "Same"}, keyHeader("k1")...)
	se.bob.mustStatus(resp, 201, b)
	if a["id"] == b["id"] {
		t.Fatal("two users' keys named one entity")
	}
	resp, b2 := se.bob.do("POST", "/api/v1/tasks", map[string]any{"title": "Same"}, keyHeader("k1")...)
	se.bob.mustStatus(resp, 200, b2)
	if b2["id"] != b["id"] {
		t.Fatalf("bob's replay returned %v", b2["id"])
	}
	if resp, out := se.bob.do("GET", "/api/v1/tasks/"+a["id"].(string), nil); resp.StatusCode != 404 {
		t.Fatalf("bob sees alice's keyed task: %v", out)
	}
	// Bob learns the salt (worst case) and plants a task under Alice's next
	// derived id in the project they share. Alice's keyed create must not
	// replay it, return it or write over it.
	var salt string
	_ = se.alice.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, idempotencySaltKey).Scan(&salt)
	_ = json.Unmarshal([]byte(salt), &salt)
	if salt == "" {
		t.Fatal("no idempotency salt stored")
	}
	planted := ids.NameID("idem", salt+"\x00"+se.ids["alice"]+"\x00tasks\x00k2")
	syncOnce(se.bob, "bob-phone", 0, []map[string]any{
		{"id": ids.New(), "entity": "task", "entityId": planted, "field": "project_id", "value": se.project, "ts": 1, "device": "bob-phone"},
		{"id": ids.New(), "entity": "task", "entityId": planted, "field": "title", "value": "Planted", "ts": 1, "device": "bob-phone"},
		{"id": idemOpID(planted, "title"), "entity": "task", "entityId": planted, "field": "priority", "value": 4, "ts": 1, "device": "bob-phone"},
	})
	for _, body := range []map[string]any{{"title": "Planted", "project_id": se.project}, {"title": "Mine"}} {
		resp, out := se.alice.do("POST", "/api/v1/tasks", body, keyHeader("k2")...)
		if resp.StatusCode != 409 || errCode(out) != "idempotency_conflict" {
			t.Fatalf("alice's key over a planted entity (%v): %d %v", body, resp.StatusCode, out)
		}
	}
	if se.alice.taskField(planted, "title") != "Planted" {
		t.Fatal("alice's keyed create wrote over bob's entity")
	}
}
