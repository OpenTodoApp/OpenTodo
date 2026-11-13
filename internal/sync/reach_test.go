package sync

import (
	"context"
	"errors"
	"testing"
)

// A request limited to one workspace (token-workspaces D2, D3) reads and writes
// only there: other workspaces' projects, tasks and labels read as missing, a
// write to them is refused as out of reach, a create or move into them as a
// limit; a request without a reach is unchanged.
func TestReachLimitsReadsAndWrites(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.db.Exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES('u1','u1@example.com','u1','h',1)`); err != nil {
		t.Fatal(err)
	}
	work, err := s.CreateWorkspace(ctx, "u1", WorkspaceInput{Name: strp("Work")})
	if err != nil {
		t.Fatal(err)
	}
	w := `"` + work.ID + `"`
	if _, err := s.ApplyStrict(ctx, "u1", []Op{
		op("1", "project", "pw", "name", `"Work project"`, 1, "d"), op("2", "project", "pw", "workspace_id", w, 1, "d"),
		op("3", "project", "ph", "name", `"Home project"`, 1, "d"),
		op("4", "task", "tw", "title", `"Write report"`, 1, "d"), op("5", "task", "tw", "project_id", `"pw"`, 1, "d"),
		op("6", "task", "tsub", "title", `"Outline"`, 1, "d"), op("7", "task", "tsub", "parent_id", `"tw"`, 1, "d"),
		op("8", "task", "th", "title", `"Buy milk"`, 1, "d"), op("9", "task", "th", "project_id", `"ph"`, 1, "d"),
		op("10", "task", "tinbox", "title", `"Call"`, 1, "d"), op("11", "task", "tinbox", "workspace_id", w, 1, "d"),
		op("12", "label", "lw", "name", `"focus"`, 1, "d"), op("13", "label", "lw", "workspace_id", w, 1, "d"),
		op("14", "label", "lh", "name", `"home"`, 1, "d"),
		op("15", "reminder", "rh", "task_id", `"th"`, 1, "d"), op("16", "reminder", "rh", "offset_minutes", `30`, 1, "d"),
	}); err != nil {
		t.Fatal(err)
	}
	in := WithReach(ctx, []string{work.ID})
	ids := func(entity string) map[string]bool {
		list, err := s.List(in, "u1", entity, false)
		if err != nil {
			t.Fatal(err)
		}
		out := map[string]bool{}
		for _, e := range list {
			out[e.str("id")] = true
		}
		return out
	}
	if got := ids("task"); len(got) != 3 || !got["tw"] || !got["tsub"] || !got["tinbox"] {
		t.Fatalf("tasks = %v", got)
	}
	if got := ids("project"); len(got) != 1 || !got["pw"] {
		t.Fatalf("projects = %v", got)
	}
	if got := ids("label"); len(got) != 1 || !got["lw"] {
		t.Fatalf("labels = %v", got)
	}
	if got := ids("reminder"); len(got) != 0 {
		t.Fatalf("reminders = %v", got)
	}
	if e, err := s.Get(in, "u1", "task", "th"); err != nil || e != nil {
		t.Fatalf("Get outside = %v, %v", e, err)
	}
	if e, _ := s.Get(ctx, "u1", "task", "th"); e == nil {
		t.Fatal("without a reach the task is there")
	}
	if all, _ := s.List(ctx, "u1", "task", false); len(all) != 4 {
		t.Fatalf("without a reach = %d tasks", len(all))
	}
	vals, err := s.FieldValues(in, "u1", "task", []string{"title"})
	if err != nil || len(vals) != 3 {
		t.Fatalf("field values = %v, %v", vals, err)
	}
	refused := func(reason string, ops ...Op) {
		t.Helper()
		var rej *RejectedError
		if _, err := s.ApplyStrict(in, "u1", ops); !errors.As(err, &rej) || rej.Reason != reason {
			t.Fatalf("%v: err = %v, want %s", ops, err, reason)
		}
	}
	refused(ReasonOutOfReach, op("20", "task", "th", "title", `"Buy oat milk"`, 2, "d"))
	refused(ReasonReachLimit, op("21", "task", "tw", "project_id", `"ph"`, 2, "d"))
	refused(ReasonReachLimit, op("22", "task", "tnew", "title", `"Loose"`, 2, "d"))
	refused(ReasonReachLimit, op("23", "task", "tnew", "title", `"Into home"`, 2, "d"), op("24", "task", "tnew", "project_id", `"ph"`, 2, "d"))
	refused(ReasonReachLimit, op("25", "user_prefs", "me", "day_parts", `true`, 2, "d"))
	refused(ReasonOutOfReach, op("26", "reminder", "rh", "offset_minutes", `60`, 2, "d"))
	// Inside: a new task in Work's Inbox and one in its project, a new project in Work.
	if _, err := s.ApplyStrict(in, "u1", []Op{
		op("30", "task", "tn1", "title", `"Inbox"`, 3, "d"), op("31", "task", "tn1", "workspace_id", w, 3, "d"),
		op("32", "task", "tn2", "title", `"In project"`, 3, "d"), op("33", "task", "tn2", "project_id", `"pw"`, 3, "d"),
		op("34", "project", "pn", "name", `"New"`, 3, "d"), op("35", "project", "pn", "workspace_id", w, 3, "d"),
		op("36", "task", "tn3", "title", `"In the new project"`, 3, "d"), op("37", "task", "tn3", "project_id", `"pn"`, 3, "d"),
		op("38", "task", "tw", "title", `"Write the report"`, 3, "d"),
	}); err != nil {
		t.Fatalf("inside = %v", err)
	}
	// No workspaces at all: nothing is readable.
	none := WithReach(ctx, []string{})
	if list, _ := s.List(none, "u1", "task", false); len(list) != 0 {
		t.Fatalf("an empty reach lists %d tasks", len(list))
	}
}
