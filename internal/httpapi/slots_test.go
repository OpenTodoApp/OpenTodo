package httpapi

import (
	"fmt"
	"testing"
)

// Calendar slots REST (OpenSpec change calendar-slots, "Slots API").
func TestSlotsCRUD(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/slots", map[string]any{"title": "Admin", "date": "2026-11-04", "start": "16:00", "minutes": 45})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if out["title"] != "Admin" || out["start"] != "16:00" || out["minutes"].(float64) != 45 || out["color"] != "#64748b" || out["encrypted"] != false || len(out["task_ids"].([]any)) != 0 {
		t.Fatalf("created %v", out)
	}
	resp, out = e.do("POST", "/api/v1/slots", map[string]any{"date": "2026-11-10"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("PATCH", "/api/v1/slots/"+id, map[string]any{"minutes": 60, "title": "Errands"})
	e.mustStatus(resp, 200, out)
	if out["minutes"].(float64) != 60 || out["title"] != "Errands" {
		t.Fatalf("patched %v", out)
	}
	resp, out = e.do("GET", "/api/v1/slots?from=2026-11-01&to=2026-11-07", nil)
	e.mustStatus(resp, 200, out)
	if list := out["slots"].([]any); len(list) != 1 || list[0].(map[string]any)["title"] != "Errands" {
		t.Fatalf("list %v", out)
	}
	resp, out = e.do("GET", "/api/v1/slots?from=nope", nil)
	if resp.StatusCode != 422 {
		t.Fatalf("bad from: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("DELETE", "/api/v1/slots/"+id, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/slots", nil)
	e.mustStatus(resp, 200, out)
	if len(out["slots"].([]any)) != 1 {
		t.Fatalf("deleted slot listed: %v", out)
	}
	for _, rt := range [][2]string{{"PATCH", "/api/v1/slots/" + id}, {"DELETE", "/api/v1/slots/" + id}, {"GET", "/api/v1/slots/nope"}} {
		resp, out = e.do(rt[0], rt[1], map[string]any{"title": "x"})
		if resp.StatusCode != 404 {
			t.Fatalf("%s %s: %d %v", rt[0], rt[1], resp.StatusCode, out)
		}
	}
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	if sl, _ := out["slots"].([]any); len(sl) != 2 {
		t.Fatalf("export slots: %v", out["slots"])
	}
}

// "Put tasks from the CLI": move_tasks dates the tasks to the slot's day in one batch
// and takes them out of the day's other slots.
func TestSlotsMoveTasks(t *testing.T) {
	e := ownerEnv(t)
	task := func(title string, due map[string]any) string {
		resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": title, "due": due})
		e.mustStatus(resp, 201, out)
		return out["id"].(string)
	}
	t1 := task("Reply to Marco", map[string]any{"date": "2026-11-06", "time": "10:00"})
	t2 := task("Pay invoice", map[string]any{"date": "2026-11-04"})
	resp, out := e.do("POST", "/api/v1/slots", map[string]any{"title": "Other", "date": "2026-11-04", "task_ids": []string{t2}})
	e.mustStatus(resp, 201, out)
	other := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/slots", map[string]any{"title": "Admin", "date": "2026-11-04", "start": "16:00"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/slots/"+id, map[string]any{"task_ids": []string{t1, t2}, "move_tasks": true})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/tasks/"+t1, nil)
	e.mustStatus(resp, 200, out)
	if due := out["due"].(map[string]any); due["date"] != "2026-11-04" || due["time"] != nil {
		t.Fatalf("t1 due = %v", out["due"])
	}
	resp, out = e.do("GET", "/api/v1/slots/"+other, nil)
	e.mustStatus(resp, 200, out)
	if len(out["task_ids"].([]any)) != 0 {
		t.Fatalf("other slot still lists %v", out["task_ids"])
	}
	// An unknown task with move_tasks is refused and nothing is written.
	before := countOps(t, e)
	resp, out = e.do("PATCH", "/api/v1/slots/"+id, map[string]any{"task_ids": []string{t1, "nope"}, "move_tasks": true})
	if resp.StatusCode != 422 {
		t.Fatalf("unknown task: %d %v", resp.StatusCode, out)
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("ops changed: %d → %d", before, after)
	}
}

// "Move tasks refused for a viewer": 403 naming the task, nothing written.
func TestSlotsMoveTasksRefusedForViewer(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "viewer")
	resp, out := se.bob.do("POST", "/api/v1/slots", map[string]any{"title": "Admin", "date": "2026-11-04"})
	se.bob.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = se.bob.do("PATCH", "/api/v1/slots/"+id, map[string]any{"task_ids": []string{se.task}, "move_tasks": true})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" || out["error"].(map[string]any)["task_id"] != se.task {
		t.Fatalf("viewer move: %d %v", resp.StatusCode, out)
	}
	resp, out = se.bob.do("GET", "/api/v1/slots/"+id, nil)
	se.bob.mustStatus(resp, 200, out)
	if len(out["task_ids"].([]any)) != 0 {
		t.Fatalf("slot written: %v", out)
	}
}

func TestSlotsAuthAndScopes(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/slots", map[string]any{"title": "Admin", "date": "2026-11-04"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	anon := e.bearerClient()
	resp, out = anon.do("GET", "/api/v1/slots", nil)
	if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
		t.Fatalf("anonymous: %d %v", resp.StatusCode, out)
	}
	read, agent := e.token("read"), e.token("agent")
	before := countOps(t, e)
	for _, secret := range []string{read, agent} {
		resp, out = anon.do("GET", "/api/v1/slots", nil, bearer(secret)...)
		e.mustStatus(resp, 200, out)
		for _, rt := range [][2]string{{"POST", "/api/v1/slots"}, {"PATCH", "/api/v1/slots/" + id}, {"DELETE", "/api/v1/slots/" + id}} {
			resp, out = anon.do(rt[0], rt[1], map[string]any{"title": "Nope", "date": "2026-11-04"}, bearer(secret)...)
			if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
				t.Fatalf("%s %s: %d %v", rt[0], rt[1], resp.StatusCode, out)
			}
		}
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("ops changed: %d → %d", before, after)
	}
}

func TestSlotsValidation(t *testing.T) {
	e := ownerEnv(t)
	many := make([]string, 21)
	for i := range many {
		many[i] = fmt.Sprint("t", i)
	}
	before := countOps(t, e)
	for _, c := range []struct {
		body  map[string]any
		field string
	}{
		{map[string]any{"title": "x"}, "date"},
		{map[string]any{"date": "2026-13-01"}, "date"},
		{map[string]any{"date": "2026-11-04", "start": "25:00"}, "start"},
		{map[string]any{"date": "2026-11-04", "minutes": 10}, "minutes"},
		{map[string]any{"date": "2026-11-04", "minutes": 50}, "minutes"},
		{map[string]any{"date": "2026-11-04", "minutes": 495}, "minutes"},
		{map[string]any{"date": "2026-11-04", "task_ids": many}, "task_ids"},
		{map[string]any{"date": "2026-11-04", "task_ids": []string{"a", "a"}}, "task_ids"},
		{map[string]any{"date": "2026-11-04", "color": "red"}, "color"},
	} {
		resp, out := e.do("POST", "/api/v1/slots", c.body)
		eo, _ := out["error"].(map[string]any)
		if resp.StatusCode != 422 || errCode(out) != "invalid_input" || eo["field"] != c.field {
			t.Fatalf("%v: %d %v", c.body, resp.StatusCode, out)
		}
	}
	// "Too many tasks" on a PATCH.
	resp, out := e.do("POST", "/api/v1/slots", map[string]any{"date": "2026-11-04"})
	e.mustStatus(resp, 201, out)
	before = countOps(t, e)
	resp, out = e.do("PATCH", "/api/v1/slots/"+out["id"].(string), map[string]any{"task_ids": many})
	if resp.StatusCode != 422 || errCode(out) != "invalid_input" {
		t.Fatalf("21 ids: %d %v", resp.StatusCode, out)
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("ops changed: %d → %d", before, after)
	}
}

func TestSlotsEncryptedAccount(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/slots", map[string]any{"title": "Admin", "date": "2026-11-04"})
	if resp.StatusCode != 409 || errCode(out) != "encryption_enabled" {
		t.Fatalf("plaintext title: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/slots", map[string]any{"title": "enc:v1:QUJDREVGR0hJSktM", "date": "2026-11-04"})
	e.mustStatus(resp, 201, out)
	if out["encrypted"] != true || out["title"] != "enc:v1:QUJDREVGR0hJSktM" {
		t.Fatalf("ciphertext slot: %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/slots/"+out["id"].(string), map[string]any{"minutes": 60})
	e.mustStatus(resp, 200, out)
}
