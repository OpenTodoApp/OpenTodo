package digest

import (
	"time"

	"github.com/pixari/opentodo/internal/zoned"
)

// The Go port of web/src/lib/stats.ts (stats-and-review D1): the same rules,
// with days in the user's stored time zone instead of the device's. The shared
// fixture testdata/stats_fixture.json pins both to the same counts.

// Due is a task's floating or zoned due.
type Due struct {
	Date string
	Time string
	TZ   string
}

// Task is the part of a task the statistics read.
type Task struct {
	ID, Title, ProjectID, AssigneeID  string
	Due                               *Due
	CreatedAt, CompletedAt, DeletedAt int64 // Unix ms; 0 = none
}

// Period is [StartMs, EndMs) with its first and last local days.
type Period struct {
	Start, Last    string
	StartMs, EndMs int64
	Running        bool
}

// Counts are the numbers of a period.
type Counts struct {
	Completed, Created, Late, Slipped, Overdue int
}

func localDate(ms int64, loc *time.Location) string {
	return time.UnixMilli(ms).In(loc).Format("2006-01-02")
}

func midnight(day string, loc *time.Location) int64 {
	t, _ := time.ParseInLocation("2006-01-02", day, loc)
	return t.UnixMilli()
}

func addDays(day string, n int) string {
	t, _ := time.Parse("2006-01-02", day)
	return t.AddDate(0, 0, n).Format("2006-01-02")
}

func weekStartOf(day string, weekStart int) string {
	t, _ := time.Parse("2006-01-02", day)
	back := (int(t.Weekday()) - weekStart + 7) % 7
	return addDays(day, -back)
}

// ThisWeek runs from the start of the current week to now.
func ThisWeek(now time.Time, loc *time.Location, weekStart int) Period {
	today := now.In(loc).Format("2006-01-02")
	start := weekStartOf(today, weekStart)
	return Period{Start: start, Last: today, StartMs: midnight(start, loc), EndMs: now.UnixMilli(), Running: true}
}

// LastFullWeek is the week before the current one.
func LastFullWeek(now time.Time, loc *time.Location, weekStart int) Period {
	this := weekStartOf(now.In(loc).Format("2006-01-02"), weekStart)
	start := addDays(this, -7)
	return Period{Start: start, Last: addDays(this, -1), StartMs: midnight(start, loc), EndMs: midnight(this, loc)}
}

// DueDate is the due's day as seen in loc (a zoned due converted, a floating one as is).
func DueDate(d *Due, loc *time.Location) string {
	if d == nil {
		return ""
	}
	if d.TZ != "" && d.Time != "" {
		if zl, err := zoned.Load(d.TZ); err == nil {
			if t, err := time.ParseInLocation("2006-01-02 15:04", d.Date+" "+d.Time, zl); err == nil {
				return t.In(loc).Format("2006-01-02")
			}
		}
	}
	return d.Date
}

// Counts reports whether a task is the user's: live, and in a shared project
// not assigned to someone else.
func countsFor(t Task, shared map[string]bool, me string) bool {
	if t.DeletedAt != 0 {
		return false
	}
	if t.ProjectID != "" && shared[t.ProjectID] && t.AssigneeID != "" && t.AssigneeID != me {
		return false
	}
	return true
}

// Compute counts a period. `shared` holds the ids of the user's shared projects.
func Compute(tasks []Task, shared map[string]bool, me string, p Period, today string, loc *time.Location) Counts {
	var c Counts
	in := func(ms int64) bool { return ms != 0 && ms >= p.StartMs && ms < p.EndMs }
	slipEnd := addDays(p.Last, 1)
	if p.Running {
		slipEnd = today
	}
	for _, t := range tasks {
		if !countsFor(t, shared, me) {
			continue
		}
		due := DueDate(t.Due, loc)
		if in(t.CreatedAt) {
			c.Created++
		}
		if t.CompletedAt == 0 && due != "" && due < today {
			c.Overdue++
		}
		if in(t.CompletedAt) {
			c.Completed++
			if due != "" && localDate(t.CompletedAt, loc) > due {
				c.Late++
			}
		}
		if due != "" && due >= p.Start && due < slipEnd && (t.CompletedAt == 0 || t.CompletedAt >= p.EndMs) {
			c.Slipped++
		}
	}
	return c
}
