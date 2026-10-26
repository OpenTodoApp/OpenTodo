package calsync

import (
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/calsync/calsynctest"
)

// Both kinds of server: with sync-collection and with ETag listings only.
func forBothServers(t *testing.T, f func(t *testing.T, h *harness)) {
	for _, mode := range []string{"sync-token", "etag-listing"} {
		t.Run(mode, func(t *testing.T) {
			h := newHarness(t)
			h.srv.NoSyncToken = mode == "etag-listing"
			f(t, h)
		})
	}
}

func TestDiscovery(t *testing.T) {
	h := newHarness(t)
	h.srv.AddCalendar("tasks", &calsynctest.Calendar{Name: "Reminders", Comps: []string{"VTODO"}})
	h.srv.AddCalendar("holidays", &calsynctest.Calendar{Name: "Holidays", ReadOnly: true, TimeZone: "Europe/Berlin"})
	// A host without a path goes through /.well-known/caldav and its redirect.
	host := strings.TrimPrefix(h.srv.URL, "http://")
	base, d, err := h.w.DiscoverCalDAV(h.ctx, "http://"+host, "me", "app-pass")
	if err != nil {
		t.Fatal(err)
	}
	if base != h.srv.URL || d.Home != h.srv.Home() || !strings.HasSuffix(d.Principal, "/dav/principals/me/") {
		t.Fatalf("discovery = %q %+v", base, d)
	}
	if len(d.Calendars) != 2 {
		t.Fatalf("calendars = %+v (the VTODO-only one must be left out)", d.Calendars)
	}
	hol, work := d.Calendars[0], d.Calendars[1]
	if hol.Name != "Holidays" || !hol.ReadOnly || hol.TimeZone != "Europe/Berlin" || work.Name != "Work" || work.ReadOnly || work.Color != "#3366CC" {
		t.Fatalf("calendars = %+v", d.Calendars)
	}
	if _, _, err := h.w.DiscoverCalDAV(h.ctx, h.srv.URL, "me", "wrong"); reasonOf(err) != ReasonUnauthorized {
		t.Fatalf("wrong password = %v", err)
	}
	if got, _ := StartURL("me@fastmail.com"); got != "https://fastmail.com" {
		t.Fatalf("email start = %q", got)
	}
}

func TestRedirectToAnotherSiteIsRefused(t *testing.T) {
	d := NewDAV(nil, "https://caldav.icloud.com", nil, "t")
	for host, want := range map[string]bool{"p52-caldav.icloud.com": true, "icloud.com": true, "evil.example": false, "caldav.icloud.com.evil.example": false} {
		if d.sameSite(host) != want {
			t.Errorf("sameSite(%s) = %v", host, !want)
		}
	}
}

func TestPushWritesTimedTasks(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		h.task("alice", "t1", map[string]any{"title": "Write report", "due": map[string]string{"date": "2026-11-03", "time": "09:00", "tz": "Europe/Berlin"}, "estimate_minutes": 45})
		h.task("alice", "t2", map[string]any{"title": "Buy milk", "due": map[string]string{"date": "2026-11-04"}})
		c := h.connect(false)
		n := h.cycle(c)
		if n.Written != 1 {
			t.Fatalf("counts = %+v", n)
		}
		body := h.srv.Get("work", "t1.ics")
		for _, want := range []string{"UID:t1", "SUMMARY:Write report", "DTSTART;TZID=Europe/Berlin:20261103T090000", "DTEND;TZID=Europe/Berlin:20261103T094500", "X-OPENTODO-TASK:t1"} {
			if !strings.Contains(body, want) {
				t.Fatalf("event lacks %q:\n%s", want, body)
			}
		}
		if h.srv.Get("work", "t2.ics") != "" {
			t.Fatal("a date-only task was written with the option off")
		}
		// Nothing changed: the next cycle writes nothing.
		puts := h.srv.Count("PUT")
		if n := h.cycle(h.conn(c.ID)); n.Written != 0 || h.srv.Count("PUT") != puts {
			t.Fatalf("second cycle = %+v", n)
		}
		// The option on: the date-only task becomes an all-day event.
		on := true
		if _, err := h.w.Store.Update(h.ctx, "alice", c.ID, Patch{IncludeDateOnly: &on}); err != nil {
			t.Fatal(err)
		}
		h.cycle(h.conn(c.ID))
		if body := h.srv.Get("work", "t2.ics"); !strings.Contains(body, "DTSTART;VALUE=DATE:20261104") {
			t.Fatalf("all-day event:\n%s", body)
		}
	})
}

func TestEventMovedInCalendarMovesTask(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		h.task("alice", "t1", map[string]any{"title": "Write report", "due": map[string]string{"date": "2026-11-03", "time": "09:00"}})
		c := h.connect(false)
		h.cycle(c)
		h.clock = h.clock.Add(time.Minute)
		h.srv.Put("work", "t1.ics", event("t1", "Write the report", "DTSTART:20261104T140000", "DTEND:20261104T153000", h.clock))
		h.clock = h.clock.Add(time.Minute)
		n := h.cycle(h.conn(c.ID))
		if n.Moved != 1 || n.Renamed != 1 || n.Written != 0 {
			t.Fatalf("counts = %+v", n)
		}
		task := h.get("alice", "t1")
		if d := due(task); d["date"] != "2026-11-04" || d["time"] != "14:00" || d["tz"] != "" {
			t.Fatalf("due = %v", d)
		}
		if string(task["estimate_minutes"]) != "90" || str(task["title"]) != "Write the report" {
			t.Fatalf("task = %s %s", task["estimate_minutes"], task["title"])
		}
		var device string
		if err := h.db.QueryRow(`SELECT device FROM ops WHERE entity_id = 't1' AND field = 'due' ORDER BY seq DESC LIMIT 1`).Scan(&device); err != nil || device != Device(c.ID) {
			t.Fatalf("device = %q %v", device, err)
		}
		// Stable afterwards: nothing more to apply or write.
		if n := h.cycle(h.conn(c.ID)); n.Moved != 0 || n.Written != 0 {
			t.Fatalf("third cycle = %+v", n)
		}
	})
}

func TestEventDeletedInCalendarUnschedulesTask(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		h.task("alice", "t1", map[string]any{"title": "Call Ana", "due": map[string]string{"date": "2026-11-03", "time": "09:00"}})
		c := h.connect(false)
		h.cycle(c)
		h.srv.Delete("work", "t1.ics")
		n := h.cycle(h.conn(c.ID))
		if n.Unscheduled != 1 {
			t.Fatalf("counts = %+v", n)
		}
		task := h.get("alice", "t1")
		if string(task["due"]) != "null" || str(task["title"]) != "Call Ana" || string(task["deleted_at"]) != "null" && len(task["deleted_at"]) != 0 {
			t.Fatalf("task = %v", task)
		}
		if h.srv.Get("work", "t1.ics") != "" {
			t.Fatal("the event was written again")
		}
	})
}

func TestCompletedTaskRemovesEvent(t *testing.T) {
	h := newHarness(t)
	h.task("alice", "t1", map[string]any{"title": "Call Ana", "due": map[string]string{"date": "2026-11-03", "time": "09:00"}})
	c := h.connect(false)
	h.cycle(c)
	h.edit("alice", "t1", map[string]any{"completed_at": h.clock.UnixMilli()})
	if n := h.cycle(h.conn(c.ID)); n.Removed != 1 || len(h.srv.Members("work")) != 0 {
		t.Fatalf("counts = %+v members = %v", n, h.srv.Members("work"))
	}
}

func TestConflictNewestChangeWins(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		h.task("alice", "t1", map[string]any{"title": "Plan", "due": map[string]string{"date": "2026-11-03", "time": "09:00"}})
		h.task("alice", "t2", map[string]any{"title": "Review", "due": map[string]string{"date": "2026-11-03", "time": "11:00"}})
		c := h.connect(false)
		h.cycle(c)
		// t1: the event moves first, the task later → the task wins.
		h.clock = h.clock.Add(time.Minute)
		h.srv.Put("work", "t1.ics", event("t1", "Plan", "DTSTART:20261103T100000", "DTEND:20261103T103000", h.clock))
		h.clock = h.clock.Add(time.Minute)
		h.edit("alice", "t1", map[string]any{"due": map[string]string{"date": "2026-11-03", "time": "16:00"}})
		// t2: the task moves first, the event later → the event wins.
		h.edit("alice", "t2", map[string]any{"due": map[string]string{"date": "2026-11-03", "time": "17:00"}})
		h.clock = h.clock.Add(time.Minute)
		h.srv.Put("work", "t2.ics", event("t2", "Review", "DTSTART:20261103T080000", "DTEND:20261103T083000", h.clock))
		n := h.cycle(h.conn(c.ID))
		if n.Conflicts != 1 || n.Moved != 1 {
			t.Fatalf("counts = %+v", n)
		}
		if d := due(h.get("alice", "t1")); d["time"] != "16:00" || !strings.Contains(h.srv.Get("work", "t1.ics"), "DTSTART:20261103T160000") {
			t.Fatalf("t1 = %v\n%s", d, h.srv.Get("work", "t1.ics"))
		}
		if d := due(h.get("alice", "t2")); d["time"] != "08:00" {
			t.Fatalf("t2 = %v", d)
		}
	})
}

func TestExistingEventIsAdoptedAndServerWithoutETags(t *testing.T) {
	h := newHarness(t)
	h.srv.NoETagOnPut = true
	h.task("alice", "t1", map[string]any{"title": "Plan", "due": map[string]string{"date": "2026-11-03", "time": "09:00"}})
	// An event at the task's address already exists (a link lost in a restore).
	h.srv.Put("work", "t1.ics", event("t1", "Old", "DTSTART:20261101T090000", "DTEND:20261101T093000", h.clock.Add(-time.Hour)))
	c := h.connect(false)
	if n := h.cycle(c); n.Written != 1 || !strings.Contains(h.srv.Get("work", "t1.ics"), "SUMMARY:Plan") {
		t.Fatalf("counts = %+v\n%s", n, h.srv.Get("work", "t1.ics"))
	}
	// Without an ETag from PUT, the next cycles learn it and change nothing.
	puts := h.srv.Count("PUT")
	for i := 0; i < 2; i++ {
		if n := h.cycle(h.conn(c.ID)); n.Moved != 0 || n.Written != 0 || n.Conflicts != 0 {
			t.Fatalf("cycle %d = %+v", i, n)
		}
	}
	if h.srv.Count("PUT") != puts {
		t.Fatal("unchanged events were written again")
	}
}

func TestEncryptedAccountKeepsTitles(t *testing.T) {
	h := newHarness(t)
	if _, err := h.db.Exec(`INSERT INTO encryption_keys(user_id, version, kdf, salt, iterations, wrapped_passphrase, wrapped_recovery, created_at, updated_at)
		VALUES('alice', 1, 1, 's', 1, 'p', 'r', 1, 1)`); err != nil {
		t.Fatal(err)
	}
	h.task("alice", "t1", map[string]any{"title": "Secret plan", "due": map[string]string{"date": "2026-11-03", "time": "09:00"}})
	c := h.connect(false)
	h.cycle(c)
	if body := h.srv.Get("work", "t1.ics"); !strings.Contains(body, "SUMMARY:Encrypted item") || strings.Contains(body, "Secret") {
		t.Fatalf("event:\n%s", body)
	}
	h.clock = h.clock.Add(time.Minute)
	h.srv.Put("work", "t1.ics", event("t1", "Renamed", "DTSTART:20261103T100000", "DTEND:20261103T103000", h.clock))
	if n := h.cycle(h.conn(c.ID)); n.Renamed != 0 || n.Moved != 1 || str(h.get("alice", "t1")["title"]) != "Secret plan" {
		t.Fatalf("counts = %+v title = %s", n, h.get("alice", "t1")["title"])
	}
}

func TestFailuresBackOffAndStop(t *testing.T) {
	h := newHarness(t)
	c := h.connect(false)
	if err := h.w.Secrets.Set(c.ID, "revoked"); err != nil {
		t.Fatal(err)
	}
	if _, err := h.w.Cycle(h.ctx, c); reasonOf(err) != "" && err.(*CycleError).Reason != ReasonUnauthorized {
		t.Fatalf("err = %v", err)
	}
	if got := h.conn(c.ID); got.State() != StateReconnect || got.StoppedReason != ReasonUnauthorized {
		t.Fatalf("state = %s %q", got.State(), got.StoppedReason)
	}
	// A server that is gone: retried with a doubling wait.
	if err := h.w.Secrets.Set(c.ID, h.srv.Password); err != nil {
		t.Fatal(err)
	}
	if err := h.w.Store.Resume(h.ctx, c.ID); err != nil {
		t.Fatal(err)
	}
	h.srv.Close()
	_, _ = h.w.Cycle(h.ctx, h.conn(c.ID))
	first := h.conn(c.ID)
	if first.State() != StateFailed || first.BackoffSeconds != int64(BackoffStart/time.Second) || first.NextSyncAt != h.clock.Add(BackoffStart).UnixMilli() {
		t.Fatalf("after one failure = %+v", first)
	}
	_, _ = h.w.Cycle(h.ctx, first)
	if second := h.conn(c.ID); second.BackoffSeconds != int64(2*BackoffStart/time.Second) {
		t.Fatalf("after two failures = %d", second.BackoffSeconds)
	}
}

func TestMissingTargetStops(t *testing.T) {
	h := newHarness(t)
	c := h.connect(false)
	h.srv.RemoveCalendar("work")
	_, _ = h.w.Cycle(h.ctx, c)
	if got := h.conn(c.ID); got.StoppedReason != ReasonCalendarMissing || got.State() != StateStopped {
		t.Fatalf("state = %s %q", got.State(), got.StoppedReason)
	}
}
