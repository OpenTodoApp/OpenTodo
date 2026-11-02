package agenttools

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestSectorTools (OpenSpec change time-sectors, task 5.3): create_tasks and
// update_tasks take an absolute sector written as sent, null clears it, a
// relative word or an invalid period is an argument error that writes nothing,
// results carry it, and list_tasks filters by a period or carried.
func TestSectorTools(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	out := f.mustCall(c, "create_tasks", map[string]any{"items": []any{
		map[string]any{"title": "Book the venue", "sector": "2026-W45"},
		map[string]any{"title": "Old plan", "sector": "2020-W01"},
	}, "client_request_id": "r-sector"})
	results := out["results"].([]map[string]any)
	id, old := results[0]["id"].(string), results[1]["id"].(string)
	if e := f.entity("u1", "task", id); str(e, "sector") != "2026-W45" {
		t.Fatalf("created sector %s", e["sector"])
	}
	got := f.mustCall(c, "get_task", map[string]any{"id": id})
	raw, _ := json.Marshal(got)
	if !strings.Contains(string(raw), `"sector":"2026-W45"`) {
		t.Fatalf("get_task = %s", raw)
	}

	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "sector": "2999-Q1"}}})
	if e := f.entity("u1", "task", id); str(e, "sector") != "2999-Q1" {
		t.Fatalf("updated sector %s", e["sector"])
	}
	for _, bad := range []any{"next week", "this-week", "2026-W54", "2027-W53", 44} {
		if _, err := f.call(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "sector": bad}}}); !isArgErr(err) || !strings.Contains(err.Error(), "sector") {
			t.Fatalf("sector %v: %v", bad, err)
		}
	}
	if e := f.entity("u1", "task", id); str(e, "sector") != "2999-Q1" {
		t.Fatal("a refused call wrote")
	}

	list := func(filter string) []string {
		out := f.mustCall(c, "list_tasks", map[string]any{"sector": filter})
		var ids []string
		for _, task := range out["tasks"].([]taskOut) {
			ids = append(ids, task.ID)
		}
		return ids
	}
	if got := list("2999-Q1"); len(got) != 1 || got[0] != id {
		t.Fatalf("sector 2999-Q1 lists %v", got)
	}
	if got := list("carried"); len(got) != 1 || got[0] != old {
		t.Fatalf("carried lists %v", got)
	}
	if _, err := f.call(c, "list_tasks", map[string]any{"sector": "this week"}); !isArgErr(err) {
		t.Fatalf("relative filter: %v", err)
	}
	// A sector schedules the task: it is in neither the Inbox nor Anytime.
	for _, view := range []string{"inbox", "anytime"} {
		out := f.mustCall(c, "list_tasks", map[string]any{"view": view})
		for _, task := range out["tasks"].([]taskOut) {
			if task.ID == id {
				t.Fatalf("%s lists the sectored task", view)
			}
		}
	}

	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "sector": nil}}})
	if e := f.entity("u1", "task", id); string(e["sector"]) != `""` {
		t.Fatalf("cleared sector %s", e["sector"])
	}
	got = f.mustCall(c, "get_task", map[string]any{"id": id})
	raw, _ = json.Marshal(got)
	if !strings.Contains(string(raw), `"sector":null`) {
		t.Fatalf("get_task after clear = %s", raw)
	}
}
