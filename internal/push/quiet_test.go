package push

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"
)

// The rule shared with the web app (reminderProjects.vectors.json, docs/contracts.md).
func TestProjectQuietVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/reminderProjects.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Projects []struct {
			ID        string  `json:"id"`
			ParentID  *string `json:"parent_id"`
			DeletedAt *int64  `json:"deleted_at"`
			Archived  bool    `json:"archived"`
		} `json:"projects"`
		Cases []struct {
			Name      string  `json:"name"`
			ProjectID *string `json:"project_id"`
			Quiet     bool    `json:"quiet"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	links := map[string]projectLink{}
	for _, p := range v.Projects {
		l := projectLink{Deleted: p.DeletedAt != nil, Archived: p.Archived}
		if p.ParentID != nil {
			l.Parent = *p.ParentID
		}
		links[p.ID] = l
	}
	get := func(id string) (projectLink, bool, error) { l, ok := links[id]; return l, ok, nil }
	for _, c := range v.Cases {
		id := ""
		if c.ProjectID != nil {
			id = *c.ProjectID
		}
		if got, err := projectQuiet(id, get); err != nil || got != c.Quiet {
			t.Errorf("%s: quiet = %v, %v; want %v", c.Name, got, err, c.Quiet)
		}
	}
	if len(v.Cases) < 10 {
		t.Fatalf("only %d cases", len(v.Cases))
	}
}

// Issue #1234: a reminder on an open task in an archived project, or below one,
// is neither pushed nor handed to the notification channels, and is not recorded;
// once the project is unarchived it is delivered once, even though its firing
// time passed while the project was archived.
func TestSchedulerSkipsArchivedProjects(t *testing.T) {
	e := newTestEnv(t)
	f := newFakePush(t)
	ctx := context.Background()
	s := e.service()
	var hooked []string
	s.SetReminderHook(func(_ context.Context, r DueReminder) { hooked = append(hooked, r.ID) })
	if _, _, err := s.Upsert(ctx, "u1", "", f.input("phone", false)); err != nil {
		t.Fatal(err)
	}
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{
		"project:home":   {"name": "Home", "parent_id": nil, "archived": true, "deleted_at": nil},
		"project:garden": {"name": "Garden", "parent_id": "home", "archived": false, "deleted_at": nil},
		"project:work":   {"name": "Work", "parent_id": nil, "archived": true, "deleted_at": nil},
		"project:live":   {"name": "Live", "parent_id": nil, "archived": false, "deleted_at": nil},
		"task:direct":    {"title": "In archived project", "project_id": "work", "completed_at": nil, "deleted_at": nil},
		"task:nested":    {"title": "Under archived ancestor", "project_id": "garden", "completed_at": nil, "deleted_at": nil},
		"task:live":      {"title": "In a live project", "project_id": "live", "completed_at": nil, "deleted_at": nil},
	})
	e.reminder(t, "u1", "r-direct", "direct", now-60_000)
	e.reminder(t, "u1", "r-nested", "nested", now-60_000)
	e.reminder(t, "u1", "r-live", "live", now-60_000)

	if n, err := s.Tick(ctx); err != nil || n != 1 {
		t.Fatalf("tick recorded %d, %v", n, err)
	}
	if got := f.received(); len(got) != 1 || got[0].ReminderID != "r-live" {
		t.Fatalf("pushed = %+v", got)
	}
	if len(hooked) != 1 || hooked[0] != "r-live" {
		t.Fatalf("hook = %v", hooked)
	}
	for _, id := range []string{"r-direct", "r-nested"} {
		r, _ := e.sync.Get(ctx, "u1", "reminder", id)
		if string(r["delivered_at"]) != "null" || string(r["dismissed_at"]) != "null" {
			t.Fatalf("%s delivered_at = %s, dismissed_at = %s; want null", id, r["delivered_at"], r["dismissed_at"])
		}
	}
	if _, ok, err := s.NextDue(ctx); err != nil || ok {
		t.Fatalf("NextDue while archived: ok %v, %v", ok, err)
	}
	*e.clock = e.clock.Add(time.Minute)
	if n, _ := s.Tick(ctx); n != 0 {
		t.Fatalf("archived reminders recorded %d", n)
	}
	// Unarchived: both are delivered once, late.
	e.apply(t, "u1", map[string]map[string]any{"project:home": {"archived": false}, "project:work": {"archived": false}})
	if n, err := s.Tick(ctx); err != nil || n != 2 {
		t.Fatalf("tick after unarchive recorded %d, %v", n, err)
	}
	if got := f.received(); len(got) != 3 {
		t.Fatalf("pushed = %+v", got)
	}
	if n, _ := s.Tick(ctx); n != 0 {
		t.Fatalf("delivered again: %d", n)
	}
}
