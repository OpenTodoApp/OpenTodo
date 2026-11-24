package agenttools

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
	"time"

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

	// More than three is refused and nothing is written; repeats count once.
	if _, err := f.call(c, "set_today_focus", map[string]any{"ids": []string{"a", "b", "c", "d"}}); !isArgErr(err) {
		t.Fatalf("four ids: %v", err)
	}
	out = f.mustCall(c, "set_today_focus", map[string]any{"ids": []string{"a", "a", "a", "a"}})
	if got := focusOf(out); !reflect.DeepEqual(got, []string{"a"}) {
		t.Fatalf("repeated id: %v", got)
	}
	f.mustCall(c, "set_today_focus", map[string]any{"ids": []string{"c", "d", "a"}})
	// Another account's task, or an unknown id, is not found; nothing is written.
	for _, bad := range []string{"theirs", "nope"} {
		_, err := f.call(c, "set_today_focus", map[string]any{"ids": []string{"a", bad}})
		if toolCode(err) != "not_found" {
			t.Fatalf("%s: %v", bad, err)
		}
	}
	if got := summary(); !reflect.DeepEqual(got, []string{"c", "d", "a"}) {
		t.Fatalf("a refused call changed the focus: %v", got)
	}
	// Three tasks leaves Bento's slots as they are.
	if row := review(); rawStr(row, "focus_slots") != "" {
		t.Fatalf("three tasks wrote focus_slots: %v", row)
	}
	f.put("u1", "review", "me", map[string]any{"focus_slots": "L:a"})
	f.mustCall(c, "set_today_focus", map[string]any{"ids": []string{"c", "d", "a"}})
	if row := review(); rawStr(row, "focus_slots") != "L:a" {
		t.Fatalf("three tasks changed focus_slots: %v", row)
	}

	// A shared task assigned to someone else can be in the focus, as in the app.
	f.put("u1", "project", "house", map[string]any{"name": "House"})
	shareWith(f, "house", opsync.RoleEditor)
	f.task("u1", "bins", "Bins", map[string]any{"project_id": "house", "assignee_id": "u2"})
	f.mustCall(c, "set_today_focus", map[string]any{"ids": []string{"bins", "a"}})
	if got := summary(); !reflect.DeepEqual(got, []string{"bins", "a"}) {
		t.Fatalf("assigned to someone else: %v", got)
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
	raw, _ := json.Marshal(map[string]any{"ids": []string{"a"}})
	if _, err := f.reg.Call(opsync.WithReach(context.Background(), []string{"ws"}), agent("u1"), "set_today_focus", raw); toolCode(err) != "token_restricted" {
		t.Fatalf("workspace-limited token: %v", err)
	}
	if row, _ := f.sync.Get(context.Background(), "u1", "review", "me"); rawStr(row, "focus") != "" {
		t.Fatalf("a refused call wrote %v", row)
	}
}

// TestSetTodayFocusDayStart: in an account zone ahead of UTC with a 04:00 day
// start, a focus set at 02:30 local belongs to the day before, and
// today_summary reads it back with that focus_date.
func TestSetTodayFocusDayStart(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	berlin, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		t.Skip(err)
	}
	f.reg.userZone = func(context.Context, string) *time.Location { return berlin }
	f.put("u1", "user_prefs", "me", map[string]any{"day_start": "04:00"})
	f.task("u1", "a", "A", nil)
	// 2026-10-13 00:30 UTC is 02:30 in Berlin: still 2026-10-12 with the day start.
	f.clock = time.Date(2026, 10, 13, 0, 30, 0, 0, time.UTC)
	out := f.mustCall(c, "set_today_focus", map[string]any{"ids": []string{"a"}})
	if out["focus_date"] != "2026-10-12" {
		t.Fatalf("focus_date = %v", out["focus_date"])
	}
	sum := f.mustCall(c, "today_summary", map[string]any{})
	raw, _ := json.Marshal(sum["focus"])
	if string(raw) != `["a"]` || sum["focus_date"] != "2026-10-12" {
		t.Fatalf("today_summary focus = %s on %v", raw, sum["focus_date"])
	}
	// At 04:30 Berlin the new day starts and the focus is gone.
	f.clock = time.Date(2026, 10, 13, 2, 30, 0, 0, time.UTC)
	sum = f.mustCall(c, "today_summary", map[string]any{})
	raw, _ = json.Marshal(sum["focus"])
	if string(raw) != `[]` || sum["focus_date"] != "2026-10-13" {
		t.Fatalf("after the day start: %s on %v", raw, sum["focus_date"])
	}
}
