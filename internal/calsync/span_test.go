package calsync

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// TestSpanWrittenAndReadBack (OpenSpec change multi-day-tasks, task 6.3): a
// span is one all-day event from start to due with the option off, a moved
// all-day event moves start and due (time kept) as ops of the connection, and
// an event made timed sets the due only.
func TestSpanWrittenAndReadBack(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		h.task("alice", "t1", map[string]any{"title": "Lisbon trip", "start": "2026-11-03", "due": map[string]string{"date": "2026-11-05", "time": "17:00"}, "span": true})
		h.task("alice", "t2", map[string]any{"title": "Deferred", "start": "2026-11-03", "due": map[string]string{"date": "2026-11-05"}})
		c := h.connect(false)
		if n := h.cycle(c); n.Written != 1 {
			t.Fatalf("counts = %+v", n)
		}
		body := h.srv.Get("work", "t1.ics")
		if !strings.Contains(body, "DTSTART;VALUE=DATE:20261103") || !strings.Contains(body, "DTEND;VALUE=DATE:20261106") || strings.Contains(body, "T170000") {
			t.Fatalf("span event:\n%s", body)
		}
		if h.srv.Get("work", "t2.ics") != "" {
			t.Fatal("a date-only task that is not a span was written with the option off")
		}
		if n := h.cycle(h.conn(c.ID)); n.Written != 0 {
			t.Fatalf("second cycle = %+v", n)
		}

		h.clock = h.clock.Add(time.Minute)
		h.srv.Put("work", "t1.ics", event("t1", "Lisbon trip", "DTSTART;VALUE=DATE:20261110", "DTEND;VALUE=DATE:20261113", h.clock))
		h.clock = h.clock.Add(time.Minute)
		if n := h.cycle(h.conn(c.ID)); n.Moved != 1 || n.Written != 0 {
			t.Fatalf("counts after move = %+v", n)
		}
		task := h.get("alice", "t1")
		if d := due(task); str(task["start"]) != "2026-11-10" || d["date"] != "2026-11-12" || d["time"] != "17:00" || string(task["span"]) != "true" {
			t.Fatalf("moved: start %s due %v span %s", task["start"], d, task["span"])
		}
		var device string
		if err := h.db.QueryRow(`SELECT device FROM ops WHERE entity_id = 't1' AND field = 'start' ORDER BY seq DESC LIMIT 1`).Scan(&device); err != nil || device != Device(c.ID) {
			t.Fatalf("device = %q %v", device, err)
		}
		if n := h.cycle(h.conn(c.ID)); n.Moved != 0 || n.Written != 0 {
			t.Fatalf("stable cycle = %+v", n)
		}

		h.clock = h.clock.Add(time.Minute)
		h.srv.Put("work", "t1.ics", event("t1", "Lisbon trip", "DTSTART:20261111T090000", "DTEND:20261111T100000", h.clock))
		h.clock = h.clock.Add(time.Minute)
		h.cycle(h.conn(c.ID))
		task = h.get("alice", "t1")
		if d := due(task); str(task["start"]) != "2026-11-10" || d["date"] != "2026-11-11" || d["time"] != "09:00" || string(task["span"]) != "true" {
			t.Fatalf("timed: start %s due %v span %s", task["start"], d, task["span"])
		}
	})
}

// TestViewerSpanWrittenBack: a viewer's span lengthened in the calendar is
// refused and its own range is written back over the event.
func TestViewerSpanWrittenBack(t *testing.T) {
	h := newHarness(t)
	h.clock = h.clock.Add(time.Second)
	ts := h.sync.ServerTSAt(h.clock.UnixMilli())
	raw := func(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
	if _, err := h.sync.ApplyStrict(h.ctx, "bob", []opsync.Op{{ID: "p1", Entity: "project", EntityID: "P", Field: "name", Value: raw("Trips"), TS: ts, Device: "phone"}}); err != nil {
		t.Fatal(err)
	}
	h.task("bob", "t1", map[string]any{"title": "Lisbon trip", "project_id": "P", "start": "2026-11-03", "due": map[string]string{"date": "2026-11-05"}, "span": true})
	if _, err := h.sync.AddMember(h.ctx, "bob", "P", "alice", opsync.RoleViewer); err != nil {
		t.Fatal(err)
	}
	c := h.connect(false)
	h.cycle(c)
	h.clock = h.clock.Add(time.Minute)
	h.srv.Put("work", "t1.ics", event("t1", "Lisbon trip", "DTSTART;VALUE=DATE:20261103", "DTEND;VALUE=DATE:20261108", h.clock))
	h.clock = h.clock.Add(time.Minute)
	if n := h.cycle(h.conn(c.ID)); n.Refused != 1 {
		t.Fatalf("counts = %+v", n)
	}
	h.cycle(h.conn(c.ID))
	task := h.get("bob", "t1")
	if d := due(task); str(task["start"]) != "2026-11-03" || d["date"] != "2026-11-05" {
		t.Fatalf("viewer changed the task: start %s due %v", task["start"], d)
	}
	if body := h.srv.Get("work", "t1.ics"); !strings.Contains(body, "DTEND;VALUE=DATE:20261106") {
		t.Fatalf("range not written back:\n%s", body)
	}
}
