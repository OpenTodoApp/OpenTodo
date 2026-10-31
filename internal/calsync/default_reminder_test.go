package calsync

import (
	"encoding/json"
	"testing"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// TestCalendarSyncAddsNoDefaultReminder (default-reminders D6): calendar sync
// writes what the calendar says; the person's default reminder is never added.
func TestCalendarSyncAddsNoDefaultReminder(t *testing.T) {
	h := newHarness(t)
	var ops []opsync.Op
	for f, v := range map[string]string{"reminder_default_timed": "-30", "reminder_default_dated": "-1440"} {
		raw, _ := json.Marshal(v)
		ops = append(ops, opsync.Op{ID: "pref-" + f, Entity: "user_prefs", EntityID: "me", Field: f, Value: raw, TS: h.sync.ServerTSAt(h.clock.UnixMilli()), Device: "phone"})
	}
	if _, err := h.sync.ApplyStrict(h.ctx, "alice", ops); err != nil {
		t.Fatal(err)
	}
	h.task("alice", "t1", map[string]any{"title": "Write report", "due": map[string]string{"date": "2026-11-03", "time": "09:00"}})
	c := h.connect(false)
	h.cycle(c)
	h.clock = h.clock.Add(time.Minute)
	h.srv.Put("work", "t1.ics", event("t1", "Write the report", "DTSTART;VALUE=DATE:20261104", "DTEND;VALUE=DATE:20261105", h.clock))
	h.clock = h.clock.Add(time.Minute)
	if n := h.cycle(h.conn(c.ID)); n.Moved != 1 {
		t.Fatalf("counts = %+v", n)
	}
	list, err := h.sync.List(h.ctx, "alice", "reminder", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 0 {
		t.Fatalf("reminders = %v", list)
	}
}
