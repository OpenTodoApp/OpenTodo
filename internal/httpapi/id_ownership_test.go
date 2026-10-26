package httpapi

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// Entity id ownership (OpenSpec change entity-id-ownership, security findings
// H1 and L9) through the HTTP entry points. Bob is an editor of alice's shared
// project and has learned the id of her private Inbox task.
func squatSetup(t *testing.T) (*shareEnv, string) {
	t.Helper()
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	resp, out := se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Private"})
	se.alice.mustStatus(resp, 201, out)
	return se, out["id"].(string)
}

// TestSyncRefusesSquattedID: /api/v1/sync refuses a task created with the id
// of a task the author cannot see, with the reason of any forbidden write.
func TestSyncRefusesSquattedID(t *testing.T) {
	se, private := squatSetup(t)
	ts := time.Now().UnixMilli()
	ops := []map[string]any{
		{"id": ids.New(), "entity": "task", "entityId": private, "field": "title", "value": "hijacked", "ts": ts, "device": "bob-laptop"},
		{"id": ids.New(), "entity": "task", "entityId": private, "field": "project_id", "value": se.project, "ts": ts, "device": "bob-laptop"},
	}
	out := syncOnce(se.bob, "bob-laptop", 0, ops)
	rejected, _ := out["rejected"].([]any)
	if len(rejected) != 2 {
		t.Fatalf("rejected = %v", out["rejected"])
	}
	for _, r := range rejected {
		if r.(map[string]any)["reason"] != "forbidden" {
			t.Fatalf("reason = %v", r)
		}
	}
	if task := se.alice.task(private); task["title"] != "Private" || task["project_id"] != nil {
		t.Fatalf("alice's task = %v", task)
	}
	if strings.Contains(fmt.Sprint(syncOnce(se.bob, "bob-laptop", 0, nil)), "Private") {
		t.Fatal("bob's device received alice's private task")
	}
}

// TestCaldavSquatGetsAFreshID: a VTODO whose UID is the id of a task the
// client's account cannot see is stored under a fresh id, so it can neither
// take over the task nor collide with it; its resource name and UID are kept
// for bob's account only (L9), so alice's client never sees her private
// task's UID on another task.
func TestCaldavSquatGetsAFreshID(t *testing.T) {
	se, private := squatSetup(t)
	resp, out := se.alice.do("PUT", "/api/v1/settings/caldav", map[string]any{"enabled": true})
	se.alice.mustStatus(resp, 200, out)
	ac := newDavClient(se.alice, "alice@example.com", se.ids["alice"])
	bc := newDavClient(se.bob, "bob@example.com", se.ids["bob"])

	bc.must("PUT", bc.cal(se.project)+"squat.ics", vtodoBody(private, "SUMMARY:bait"), 201)
	if task := se.alice.task(private); task["title"] != "Private" || task["project_id"] != nil {
		t.Fatalf("alice's task = %v", task)
	}
	var created string
	if err := se.alice.db.QueryRow(`SELECT task_id FROM caldav_resources WHERE user_id = ? AND name = 'squat.ics'`, se.ids["bob"]).Scan(&created); err != nil {
		t.Fatal(err)
	}
	if created == private {
		t.Fatal("the VTODO took the private task's id")
	}
	// Bob's client finds it where it put it, with the UID it chose.
	_, ics := bc.must("GET", bc.cal(se.project)+"squat.ics", "", 200)
	if !strings.Contains(ics, "UID:"+private) || !strings.Contains(ics, "SUMMARY:bait") {
		t.Fatalf("bob's resource: %s", ics)
	}
	// Alice's client sees bob's task under its own id and UID only.
	_, listing := ac.must("PROPFIND", ac.cal(se.project), `<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>`, 207, "Depth", "1")
	if strings.Contains(listing, "squat.ics") || !strings.Contains(listing, ac.cal(se.project)+created+".ics") {
		t.Fatalf("alice's listing: %s", listing)
	}
	_, ics = ac.must("GET", ac.cal(se.project)+created+".ics", "", 200)
	if strings.Contains(ics, private) {
		t.Fatalf("alice's client sees her private id on bob's task: %s", ics)
	}
	_, ics = ac.must("GET", ac.cal("inbox")+private+".ics", "", 200)
	if !strings.Contains(ics, "SUMMARY:Private") {
		t.Fatalf("alice's private task: %s", ics)
	}
	// A rename by alice's client stays hers.
	ac.must("PUT", ac.cal(se.project)+"alice-name.ics", strings.Replace(ics, "UID:"+private, "UID:alice-uid-1", 1), 201)
	var n int
	if err := se.alice.db.QueryRow(`SELECT COUNT(*) FROM caldav_resources WHERE user_id = ? AND name = 'alice-name.ics'`, se.ids["bob"]).Scan(&n); err != nil || n != 0 {
		t.Fatalf("alice's name reached bob's rows: %d (%v)", n, err)
	}
}
