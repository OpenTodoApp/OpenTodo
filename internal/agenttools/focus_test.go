package agenttools

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// TestSetTodayFocus (OpenSpec change mcp-set-today-focus): set, replace and
// clear today's focus on the review row, the limit of three, the user's own
// tasks only, and today_summary reading it back.
func TestSetTodayFocus(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	for _, id := range []string{"a", "b", "c", "d"} {
		f.task("u1", id, "Task "+id, nil)
	}
	f.task("u1", "done", "Done", map[string]any{"completed_at": 1})
	f.task("u2", "theirs", "Theirs", nil)
	review := func() opsync.Entity {
		t.Helper()
		row, err := f.sync.Get(context.Background(), "u1", "review", "me")
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	focusOf := func(out map[string]any) []string {
		t.Helper()
		raw, _ := json.Marshal(out["focus"])
		var ids []string
		if err := json.Unmarshal(raw, &ids); err != nil {
			t.Fatal(err)
		}
		return ids
	}
	summary := func() []string {
		t.Helper()
		return focusOf(f.mustCall(c, "today_summary", map[string]any{"timezone": "UTC"}))
	}
	if got := summary(); len(got) != 0 {
		t.Fatalf("no focus yet: %v", got)
	}

	// Set: in order; a completed task is left out.
	out := f.mustCall(c, "set_today_focus", map[string]any{"ids": []string{"b", "done", "a"}})
	if got := focusOf(out); !reflect.DeepEqual(got, []string{"b", "a"}) || out["focus_date"] != "2026-10-12" {
		t.Fatalf("set: %v", out)
	}
	if row := review(); rawStr(row, "focus") != "b,a" || rawStr(row, "focus_date") != "2026-10-12" {
		t.Fatalf("review row = %v", row)
	}
	if got := summary(); !reflect.DeepEqual(got, []string{"b", "a"}) {
		t.Fatalf("today_summary focus = %v", got)
	}

	// Replace: the whole focus.
	f.mustCall(c, "set_today_focus", map[string]any{"ids": []string{"c", "d", "a"}})
	if got := summary(); !reflect.DeepEqual(got, []string{"c", "d", "a"}) {
		t.Fatalf("replace: %v", got)
	}

	// More than three is refused and nothing is written.
	if _, err := f.call(c, "set_today_focus", map[string]any{"ids": []string{"a", "b", "c", "d"}}); !isArgErr(err) {
		t.Fatalf("four ids: %v", err)
	}
	// Another account's task, or an unknown id, is not found; nothing is written.
	for _, bad := range []string{"theirs", "nope"} {
		_, err := f.call(c, "set_today_focus", map[string]any{"ids": []string{"a", bad}})
		if toolCode(err) != "not_found" {
			t.Fatalf("%s: %v", bad, err)
		}
	}
	// A shared task assigned to someone else is theirs.
	f.put("u1", "project", "house", map[string]any{"name": "House"})
	shareWith(f, "house", opsync.RoleEditor)
	f.task("u1", "bins", "Bins", map[string]any{"project_id": "house", "assignee_id": "u2"})
	if _, err := f.call(c, "set_today_focus", map[string]any{"ids": []string{"bins"}}); toolCode(err) != "not_permitted" {
		t.Fatalf("assigned to someone else: %v", err)
	}
	if got := summary(); !reflect.DeepEqual(got, []string{"c", "d", "a"}) {
		t.Fatalf("a refused call changed the focus: %v", got)
	}

	// Clear.
	f.mustCall(c, "set_today_focus", map[string]any{"ids": []string{}})
	if got := summary(); len(got) != 0 {
		t.Fatalf("clear: %v", got)
	}
	if row := review(); rawStr(row, "focus") != "" {
		t.Fatalf("clear: review row = %v", row)
	}

	// A focus of another day does not read as today's.
	f.put("u1", "review", "me", map[string]any{"focus_date": "2026-10-11", "focus": "a"})
	if got := summary(); len(got) != 0 {
		t.Fatalf("yesterday's focus: %v", got)
	}
}

// TestSetTodayFocusBento: with Bento the tool places by estimate as the
// Daily check does (ruleval.PlanSetFocus) and writes focus_slots.
func TestSetTodayFocusBento(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	f.put("u1", "user_prefs", "me", map[string]any{"focus_style": "bento"})
	f.task("u1", "small", "Small", map[string]any{"estimate_minutes": 15})
	f.task("u1", "large", "Large", map[string]any{"estimate_minutes": 120})
	f.task("u1", "any", "Any", nil)
	out := f.mustCall(c, "set_today_focus", map[string]any{"ids": []string{"small", "large", "any"}})
	raw, _ := json.Marshal(out["focus"])
	if string(raw) != `["large","any","small"]` {
		t.Fatalf("bento focus = %s", raw)
	}
	row, err := f.sync.Get(context.Background(), "u1", "review", "me")
	if err != nil {
		t.Fatal(err)
	}
	if got := rawStr(row, "focus_slots"); got != "L:large,M:any,S:small" {
		t.Fatalf("focus_slots = %q", got)
	}
}

// TestSetTodayFocusGates: the write gate of every write tool, and a
// workspace-limited token gets token_restricted (personal scope only).
func TestSetTodayFocusGates(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "a", "A", nil)
	read := agent("u1")
	read.Scope = "read"
	if _, err := f.call(read, "set_today_focus", map[string]any{"ids": []string{"a"}}); toolCode(err) != DeniedByScope {
		t.Fatalf("read token: %v", err)
	}
	off := agent("u1")
	off.UserAllowsWrites = false
	if _, err := f.call(off, "set_today_focus", map[string]any{"ids": []string{"a"}}); toolCode(err) != DeniedByUser {
		t.Fatalf("user switch off: %v", err)
	}
	if err := reachRefused(opsync.WithReach(context.Background(), []string{"ws"}), "set_today_focus"); err == nil || err.Code != "token_restricted" {
		t.Fatalf("workspace-limited token: %v", err)
	}
	if row, _ := f.sync.Get(context.Background(), "u1", "review", "me"); rawStr(row, "focus") != "" {
		t.Fatalf("a refused call wrote %v", row)
	}
}
