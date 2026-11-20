package calsync

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/calsync/graphtest"
)

// OpenSpec change calsync-repeat-marker (GitHub issue 1231): a repeating task's
// event is titled "🔁 <title>", and the marker never comes back as a rename.

func TestRepeatingTaskIsMarkedAndReadBackUnchanged(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		h.task("alice", "t1", map[string]any{"title": "Water the plants", "recurrence": "every week",
			"due": map[string]string{"date": "2026-11-07", "time": "09:00"}})
		h.task("alice", "t2", map[string]any{"title": "🔁 Rotate keys", "due": map[string]string{"date": "2026-11-07", "time": "10:00"}})
		c := h.connect(false)
		if n := h.cycle(c); n.Written != 2 {
			t.Fatalf("first cycle = %+v", n)
		}
		if body := h.srv.Get("work", "t1.ics"); !strings.Contains(body, "SUMMARY:🔁 Water the plants") || strings.Contains(body, "RRULE") {
			t.Fatalf("repeating event:\n%s", body)
		}
		if body := h.srv.Get("work", "t2.ics"); !strings.Contains(body, "SUMMARY:🔁 Rotate keys\r") {
			t.Fatalf("one-off event:\n%s", body)
		}
		// The calendar re-serialises both events: nothing is applied or written.
		h.clock = h.clock.Add(time.Minute)
		h.srv.Put("work", "t1.ics", event("t1", "🔁 Water the plants", "DTSTART:20261107T090000", "DTEND:20261107T093000", h.clock))
		h.srv.Put("work", "t2.ics", event("t2", "🔁 Rotate keys", "DTSTART:20261107T100000", "DTEND:20261107T103000", h.clock))
		h.clock = h.clock.Add(time.Minute)
		if n := h.cycle(h.conn(c.ID)); n.Renamed != 0 || n.Moved != 0 || n.Written != 0 {
			t.Fatalf("read back = %+v", n)
		}
		if got := str(h.get("alice", "t1")["title"]); got != "Water the plants" {
			t.Fatalf("t1 title = %q", got)
		}
		if got := str(h.get("alice", "t2")["title"]); got != "🔁 Rotate keys" {
			t.Fatalf("t2 title = %q", got)
		}
	})
}

func TestRepeatMarkerRenameAndDeletion(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		h.task("alice", "t1", map[string]any{"title": "Water the plants", "recurrence": "every week",
			"due": map[string]string{"date": "2026-11-07", "time": "09:00"}})
		c := h.connect(false)
		h.cycle(c)
		rename := func(summary string) RunCounts {
			h.clock = h.clock.Add(time.Minute)
			h.srv.Put("work", "t1.ics", event("t1", summary, "DTSTART:20261107T090000", "DTEND:20261107T093000", h.clock))
			h.clock = h.clock.Add(time.Minute)
			return h.cycle(h.conn(c.ID))
		}
		// The marker deleted in the calendar: nothing changes.
		if n := rename("Water the plants"); n.Renamed != 0 {
			t.Fatalf("marker deleted = %+v", n)
		}
		// Only the marker and spaces left: never an empty title.
		if n := rename("🔁   "); n.Renamed != 0 {
			t.Fatalf("only the marker = %+v", n)
		}
		if got := str(h.get("alice", "t1")["title"]); got != "Water the plants" {
			t.Fatalf("title after the marker alone = %q", got)
		}
		// Renamed in the calendar: the new title without the marker.
		if n := rename("🔁 Water the garden"); n.Renamed != 1 {
			t.Fatalf("renamed = %+v", n)
		}
		if got := str(h.get("alice", "t1")["title"]); got != "Water the garden" {
			t.Fatalf("title = %q", got)
		}
	})
}

func TestRepeatMarkerFollowsTheRule(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		h.task("alice", "t1", map[string]any{"title": "Water the plants", "due": map[string]string{"date": "2026-11-07", "time": "09:00"}})
		c := h.connect(false)
		h.cycle(c)
		h.edit("alice", "t1", map[string]any{"recurrence": "every week"})
		if n := h.cycle(h.conn(c.ID)); n.Written != 1 || !strings.Contains(h.srv.Get("work", "t1.ics"), "SUMMARY:🔁 Water the plants") {
			t.Fatalf("starts repeating = %+v\n%s", n, h.srv.Get("work", "t1.ics"))
		}
		if n := h.cycle(h.conn(c.ID)); n.Written != 0 {
			t.Fatalf("stable = %+v", n)
		}
		h.edit("alice", "t1", map[string]any{"recurrence": nil})
		if n := h.cycle(h.conn(c.ID)); n.Written != 1 || !strings.Contains(h.srv.Get("work", "t1.ics"), "SUMMARY:Water the plants\r") {
			t.Fatalf("stops repeating = %+v\n%s", n, h.srv.Get("work", "t1.ics"))
		}
	})
}

// Links stored before the marker have no "repeats": only a repeating task's
// event is written again, once.
func TestRepeatMarkerUpgradeRewritesRepeatingTasksOnce(t *testing.T) {
	h := newHarness(t)
	h.task("alice", "t1", map[string]any{"title": "Water the plants", "recurrence": "every week", "due": map[string]string{"date": "2026-11-07", "time": "09:00"}})
	h.task("alice", "t2", map[string]any{"title": "Call the bank", "due": map[string]string{"date": "2026-11-07", "time": "10:00"}})
	c := h.connect(false)
	h.cycle(c)
	if _, err := h.w.Store.db.Exec(`UPDATE calsync_links SET snapshot = json_remove(snapshot, '$.repeats')`); err != nil {
		t.Fatal(err)
	}
	puts := h.srv.Count("PUT")
	if n := h.cycle(h.conn(c.ID)); n.Written != 1 || h.srv.Count("PUT") != puts+1 {
		t.Fatalf("upgrade cycle = %+v", n)
	}
	if n := h.cycle(h.conn(c.ID)); n.Written != 0 {
		t.Fatalf("after the upgrade = %+v", n)
	}
}

func TestRepeatMarkerEncryptedAccount(t *testing.T) {
	h := newHarness(t)
	if _, err := h.db.Exec(`INSERT INTO encryption_keys(user_id, version, kdf, salt, iterations, wrapped_passphrase, wrapped_recovery, created_at, updated_at)
		VALUES('alice', 1, 1, 's', 1, 'p', 'r', 1, 1)`); err != nil {
		t.Fatal(err)
	}
	h.task("alice", "t1", map[string]any{"title": "Water the plants", "recurrence": "every week", "due": map[string]string{"date": "2026-11-07", "time": "09:00"}})
	h.cycle(h.connect(false))
	if body := h.srv.Get("work", "t1.ics"); !strings.Contains(body, "SUMMARY:Encrypted item\r") {
		t.Fatalf("encrypted event:\n%s", body)
	}
}

func TestGraphRepeatMarker(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("W. Europe Standard Time")
	h.task("alice", "t1", map[string]any{"title": "Water the plants", "recurrence": "every week", "due": map[string]string{"date": "2026-11-07", "time": "09:00"}})
	h.cycle(h.conn(c.ID))
	ev := ms.ByTask("t1")[0]
	if ev.Subject != "🔁 Water the plants" {
		t.Fatalf("subject = %q", ev.Subject)
	}
	h.later(time.Minute)
	ms.Change(ev.ID, func(e *graphtest.Event) { e.Subject = "🔁 Water the garden" })
	h.cycle(h.conn(c.ID))
	if got := str(h.get("alice", "t1")["title"]); got != "Water the garden" {
		t.Fatalf("title = %q", got)
	}
}

func TestStripRepeatMarker(t *testing.T) {
	for in, want := range map[string]string{
		"🔁 Water": "Water", "🔁Water": "Water", "  🔁  Water": "Water", "🔁 🔁 Water": "🔁 Water",
		"🔁": "", "🔁   ": "", "Water 🔁": "Water 🔁", "": "",
	} {
		if got := calfeed.StripRepeatMarker(in); got != want {
			t.Errorf("StripRepeatMarker(%q) = %q, want %q", in, got, want)
		}
	}
	// The snapshot field is additive: an old stored snapshot reads as not repeating.
	var s Snapshot
	if err := json.Unmarshal([]byte(`{"date":"2026-11-07","title":"x"}`), &s); err != nil || s.Repeats {
		t.Fatalf("old snapshot = %+v %v", s, err)
	}
}
