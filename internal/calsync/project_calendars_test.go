package calsync

import (
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/calsync/calsynctest"
)

// A calendar per project (calsync-project-calendars): a task of a matched
// project goes to its calendar, other tasks to the target; moving the task to
// another project moves its event; a cycle with nothing new writes nothing.
func TestProjectCalendars(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		h.srv.AddCalendar("home", &calsynctest.Calendar{Name: "Home"})
		h.task("alice", "t1", map[string]any{"title": "Paint the fence", "project_id": "p-home", "due": map[string]string{"date": "2026-11-03", "time": "09:00"}})
		h.task("alice", "t2", map[string]any{"title": "Write report", "due": map[string]string{"date": "2026-11-04", "time": "10:00"}})
		c := h.connect(false)
		var home string
		for _, cal := range c.Calendars {
			if cal.Name == "Home" {
				home = cal.URL
			}
		}
		if home == "" {
			t.Fatalf("no Home calendar in %+v", c.Calendars)
		}
		if err := h.w.Store.SetProjectTargets(h.ctx, c.ID, map[string]string{"p-home": home}); err != nil {
			t.Fatal(err)
		}
		if n := h.cycle(h.conn(c.ID)); n.Written != 2 {
			t.Fatalf("first cycle = %+v", n)
		}
		if !strings.Contains(h.srv.Get("home", "t1.ics"), "SUMMARY:Paint the fence") || h.srv.Get("work", "t1.ics") != "" {
			t.Fatalf("t1 should be in Home only: home=%q work=%q", h.srv.Get("home", "t1.ics"), h.srv.Get("work", "t1.ics"))
		}
		if !strings.Contains(h.srv.Get("work", "t2.ics"), "SUMMARY:Write report") || h.srv.Get("home", "t2.ics") != "" {
			t.Fatal("t2 should be in Work only")
		}
		// Nothing changed: nothing is written in either calendar.
		if n := h.cycle(h.conn(c.ID)); n.Written != 0 || n.Removed != 0 {
			t.Fatalf("quiet cycle = %+v", n)
		}
		// t1 moves to a project without a match: its event moves to Work.
		h.edit("alice", "t1", map[string]any{"project_id": "p-work"})
		if n := h.cycle(h.conn(c.ID)); n.Written != 1 || n.Removed != 1 {
			t.Fatalf("after the move = %+v", n)
		}
		if h.srv.Get("home", "t1.ics") != "" || !strings.Contains(h.srv.Get("work", "t1.ics"), "SUMMARY:Paint the fence") {
			t.Fatal("t1 should have moved to Work")
		}
		if n := h.cycle(h.conn(c.ID)); n.Written != 0 || n.Removed != 0 {
			t.Fatalf("after the move, quiet = %+v", n)
		}
		// Back to one calendar: the matches go, everything is in Work.
		if err := h.w.Store.SetProjectTargets(h.ctx, c.ID, nil); err != nil {
			t.Fatal(err)
		}
		if n := h.cycle(h.conn(c.ID)); n.Written != 0 {
			t.Fatalf("one calendar again = %+v", n)
		}
	})
}
