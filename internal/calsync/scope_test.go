package calsync

import (
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/syncscope"
)

func (h *harness) setScope(c *Connection, s syncscope.Scope) *Connection {
	h.t.Helper()
	s, err := syncscope.Normalize(s)
	if err != nil {
		h.t.Fatal(err)
	}
	c, err = h.w.Store.Update(h.ctx, "alice", c.ID, Patch{Scope: &s})
	if err != nil {
		h.t.Fatal(err)
	}
	return c
}

// A connection with a scope writes only the tasks in it (sync-scope).
func TestScopeFiltersPush(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		at := map[string]string{"date": "2026-11-03", "time": "09:00"}
		h.task("alice", "home", map[string]any{"title": "Garden", "due": at, "project_id": "garden"})
		h.task("alice", "work", map[string]any{"title": "Deploy", "due": at, "project_id": "site", "workspace_id": "w-work"})
		h.task("alice", "inbox", map[string]any{"title": "Call", "due": at, "workspace_id": "w-work"})
		c := h.setScope(h.connect(false), syncscope.Scope{Mode: syncscope.Only, Workspaces: []string{"w-work"}})
		if c.Scope.Mode != syncscope.Only || !slices.Equal(c.Scope.Workspaces, []string{"w-work"}) {
			t.Fatalf("stored scope = %+v", c.Scope)
		}
		if n := h.cycle(c); n.Written != 2 {
			t.Fatalf("counts = %+v", n)
		}
		if got := h.srv.Members("work"); !slices.Equal(got, []string{"inbox.ics", "work.ics"}) {
			t.Fatalf("members = %v", got)
		}
	})
}

// Narrowing the scope removes the events the connection wrote for tasks that
// left it, and never an event it did not write; widening it writes them again.
func TestScopeChangeRemovesOnlyOwnEvents(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		at := map[string]string{"date": "2026-11-03", "time": "09:00"}
		h.task("alice", "home", map[string]any{"title": "Garden", "due": at, "project_id": "garden"})
		h.task("alice", "work", map[string]any{"title": "Deploy", "due": at, "project_id": "site"})
		// The user's own event, with an id like a task's.
		h.srv.Put("work", "dentist.ics", event("dentist", "Dentist", "DTSTART:20261103T100000", "DTEND:20261103T110000", h.clock))
		c := h.connect(false)
		if n := h.cycle(c); n.Written != 2 {
			t.Fatalf("counts = %+v", n)
		}
		c = h.setScope(h.conn(c.ID), syncscope.Scope{Mode: syncscope.Except, Projects: []string{"garden"}})
		if c.NextSyncAt > h.clock.UnixMilli() {
			t.Fatal("a new scope does not make the connection due")
		}
		if n := h.cycle(c); n.Removed != 1 || n.Written != 0 {
			t.Fatalf("counts = %+v", n)
		}
		if got := h.srv.Members("work"); !slices.Equal(got, []string{"dentist.ics", "work.ics"}) {
			t.Fatalf("members = %v", got)
		}
		if task := h.get("alice", "home"); due(task)["date"] != "2026-11-03" {
			t.Fatalf("the task changed: %v", task)
		}
		c = h.setScope(h.conn(c.ID), syncscope.Everything())
		if n := h.cycle(c); n.Written != 1 || h.srv.Get("work", "home.ics") == "" {
			t.Fatalf("counts = %+v", n)
		}
	})
}

// An event of a task outside the scope is not applied back to the task.
func TestScopeRefusesChangesFromOutside(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		h.task("alice", "home", map[string]any{"title": "Garden", "due": map[string]string{"date": "2026-11-03", "time": "09:00"}, "project_id": "garden"})
		c := h.connect(false)
		h.cycle(c)
		c = h.setScope(h.conn(c.ID), syncscope.Scope{Mode: syncscope.Only, Projects: []string{"site"}})
		// Moved in the calendar before the next cycle ran.
		h.clock = h.clock.Add(time.Minute)
		h.srv.Put("work", "home.ics", event("home", "Garden later", "DTSTART:20261105T140000", "DTEND:20261105T150000", h.clock))
		h.clock = h.clock.Add(time.Minute)
		n := h.cycle(c)
		if n.Moved != 0 || n.Renamed != 0 {
			t.Fatalf("counts = %+v", n)
		}
		task := h.get("alice", "home")
		if due(task)["date"] != "2026-11-03" || str(task["title"]) != "Garden" {
			t.Fatalf("task = %v %s", due(task), task["title"])
		}
		if strings.Contains(strings.Join(h.srv.Members("work"), ","), "home.ics") {
			t.Fatal("the event of a task outside the scope stays")
		}
	})
}
