package calsync

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/calfeed"
	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/zoned"
)

// Snapshot is an event in task terms (design D6): the due it stands for, its
// length and a hash of its title. Comparing snapshots rather than iCalendar
// text makes a server's re-serialisation harmless.
type Snapshot struct {
	Date    string `json:"date"`
	Time    string `json:"time,omitempty"`
	TZ      string `json:"tz,omitempty"`
	Minutes int    `json:"minutes,omitempty"`
	AllDay  bool   `json:"all_day,omitempty"`
	Title   string `json:"title"`
}

// SameTimes reports whether two snapshots place the event the same way.
func (s Snapshot) SameTimes(o Snapshot) bool {
	return s.Date == o.Date && s.Time == o.Time && s.TZ == o.TZ && s.AllDay == o.AllDay && s.Minutes == o.Minutes
}

// TaskSnapshot is the event a task should have.
func TaskSnapshot(t calfeed.FeedTask, encrypted bool) Snapshot {
	s := Snapshot{Date: t.Date, Title: hash16(calfeed.EventTitle(t, encrypted))}
	if t.Time == nil {
		s.AllDay = true
		return s
	}
	s.Time = *t.Time
	if t.TZ != nil {
		s.TZ = *t.TZ
	}
	s.Minutes = int(calfeed.DefaultBlock / time.Minute)
	if t.Estimate > 0 {
		s.Minutes = t.Estimate
	}
	return s
}

// EventSnapshot reads an event in task terms. prev is the snapshot last
// written: a zoned task keeps its zone; a floating task takes the wall time of
// the event's own zone, or of the calendar's zone (calZone) for UTC times.
func EventSnapshot(ev calfeed.Event, prev Snapshot, calZone *time.Location) Snapshot {
	s := Snapshot{Title: hash16(ev.Summary)}
	start := ev.Start
	if start.AllDay {
		s.Date, s.AllDay = start.T.Format("2006-01-02"), true
		return s
	}
	t := start.T
	switch {
	case prev.TZ != "" && start.Zone != "":
		if loc, err := zoned.Load(prev.TZ); err == nil {
			t, s.TZ = t.In(loc), prev.TZ
		}
	case start.Zone == "UTC" && calZone != nil:
		t = t.In(calZone)
	}
	if prev.TZ != "" && start.Zone == "" {
		s.TZ = prev.TZ // a floating time read as the task's own zone
	}
	s.Date, s.Time = t.Format("2006-01-02"), t.Format("15:04")
	s.Minutes = prev.Minutes
	if d, ok := length(ev); ok && d > 0 {
		s.Minutes = int(d / time.Minute)
	}
	return s
}

// length is a timed event's duration from DTEND or DURATION.
func length(ev calfeed.Event) (time.Duration, bool) {
	if ev.End != nil && !ev.End.AllDay {
		end := ev.End.T
		if ev.Start.Zone == "" || ev.End.Zone == "" {
			// Floating ends: compare wall times.
			y, m, d := end.Date()
			h, mi, sec := end.Clock()
			end = time.Date(y, m, d, h, mi, sec, 0, ev.Start.T.Location())
		}
		return end.Sub(ev.Start.T), true
	}
	if ev.Duration != nil {
		return *ev.Duration, true
	}
	return 0, false
}

// Due is the task's due for a snapshot.
func (s Snapshot) Due() json.RawMessage {
	d := map[string]string{"date": s.Date}
	if !s.AllDay && s.Time != "" {
		d["time"] = s.Time
		if s.TZ != "" {
			d["tz"] = s.TZ
		}
	}
	b, _ := json.Marshal(d)
	return b
}

// MaxTitle bounds a title taken from the calendar.
const MaxTitle = 500

// cleanTitle trims a SUMMARY for a task title ("" when it has nothing).
func cleanTitle(summary string) string {
	t := strings.Join(strings.Fields(summary), " ")
	if utf8.RuneCountInString(t) > MaxTitle {
		r := []rune(t)
		t = string(r[:MaxTitle])
	}
	return t
}

// Change is what applying an event does to a task.
type Change struct {
	Moved, Renamed bool
}

// opID derives an op id from the connection, the task, the field and the
// event's version, so a repeated cycle writes duplicates the log ignores.
func opID(connID, taskID, field, version string) string {
	return ids.NameID("calsync-op", connID+"\x00"+taskID+"\x00"+field+"\x00"+version)
}

// EventOps are the ops that make a task follow its event (design D8): the due
// when the event moved, the estimate when a timed event's length changed, and
// the title when the SUMMARY changed (never for an encrypted account).
func EventOps(connID, taskID, version string, from, to Snapshot, summary string, encrypted bool, ts int64) ([]opsync.Op, Change) {
	var ops []opsync.Op
	var ch Change
	add := func(field string, value json.RawMessage) {
		ops = append(ops, opsync.Op{ID: opID(connID, taskID, field, version), Entity: "task", EntityID: taskID, Field: field,
			Value: value, TS: ts, Device: Device(connID)})
	}
	if from.Date != to.Date || from.Time != to.Time || from.TZ != to.TZ || from.AllDay != to.AllDay {
		add("due", to.Due())
		ch.Moved = true
	}
	if !to.AllDay && to.Minutes > 0 && to.Minutes != from.Minutes {
		add("estimate_minutes", json.RawMessage(strconv.Itoa(to.Minutes)))
		ch.Moved = true
	}
	if !encrypted && to.Title != from.Title {
		if title := cleanTitle(summary); title != "" {
			b, _ := json.Marshal(title)
			add("title", b)
			ch.Renamed = true
		}
	}
	return ops, ch
}

// UnscheduleOps clear a task's due after its event was deleted in the calendar.
func UnscheduleOps(connID, taskID, version string, ts int64) []opsync.Op {
	return []opsync.Op{{ID: opID(connID, taskID, "due-deleted", version), Entity: "task", EntityID: taskID, Field: "due",
		Value: json.RawMessage("null"), TS: ts, Device: Device(connID)}}
}
