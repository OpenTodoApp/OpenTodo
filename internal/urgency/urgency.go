// Package urgency is the urgency score of a task (OpenSpec change urgency-sort,
// design D2): one number from its due day, deadline, priority, the tasks it
// blocks, its age, a running timer and the blocked, deferred and Someday terms.
// Derived, never stored, and reading no content, so it is the same on an
// encrypted account. The TypeScript twin is web/src/lib/urgency.ts; both run
// web/src/lib/urgency.vectors.json. Used by the list_tasks agent tool and
// `ot list --sort urgency`.
package urgency

import (
	"math"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// Task is the part of a task the score reads.
type Task struct {
	ID        string
	Priority  int
	Due       *zoned.Due
	Deadline  string
	Start     string // "", a date or "someday"
	CreatedAt int64  // Unix ms
	Completed bool
	Deleted   bool
	BlockedBy []string
}

// Context is what the score needs besides the task.
type Context struct {
	// Today is the viewer's logical today (Today), Loc the viewer's zone and
	// DayStart the account's day start in minutes after midnight.
	Today    string
	Loc      *time.Location
	DayStart int
	// Blocks is the number of open, live tasks waiting for the task, Blocked
	// whether it waits for an open, live task, Timer whether the viewer's
	// running time entry is on it.
	Blocks  int
	Blocked bool
	Timer   bool
}

// Part is one component: its stable key and its rounded value.
type Part struct {
	Key   string  `json:"key"`
	Value float64 `json:"value"`
}

// Result is a task's score and its non-zero components in a fixed order.
type Result struct {
	Score float64 `json:"score"`
	Parts []Part  `json:"parts"`
}

var priorities = [5]float64{0, 6, 3.9, 1.8, 0}

// round2 is two decimals, a half away from zero.
func round2(x float64) float64 { return math.Copysign(math.Round(math.Abs(x)*100), x) / 100 }

// Ramp is the proximity ramp: 1 a week or more late, 0.2 two weeks or more
// ahead, linear between.
func Ramp(d int) float64 {
	if d <= -7 {
		return 1
	}
	if d >= 14 {
		return 0.2
	}
	return 0.2 + 0.8*float64(14-d)/21
}

// Today is the logical day of t in loc: the day before while the wall clock is
// before the day start (date-time-preferences "Logical today").
func Today(t time.Time, loc *time.Location, dayStart int) string {
	if loc == nil {
		loc = time.UTC
	}
	l := t.In(loc)
	if dayStart > 0 && l.Hour()*60+l.Minute() < dayStart {
		y, m, d := l.Date()
		return time.Date(y, m, d-1, 12, 0, 0, 0, loc).Format(time.DateOnly)
	}
	return l.Format(time.DateOnly)
}

func days(from, to string) (int, bool) {
	a, err := time.Parse(time.DateOnly, from)
	if err != nil {
		return 0, false
	}
	b, err := time.Parse(time.DateOnly, to)
	if err != nil {
		return 0, false
	}
	return int(math.Round(b.Sub(a).Hours() / 24)), true
}

// localDate is the due's date in loc: a zoned due is converted, a floating one
// is the same everywhere.
func localDate(d *zoned.Due, loc *time.Location) string {
	if d.TZ == nil || d.Time == nil {
		return d.Date
	}
	zl, err := zoned.Load(*d.TZ)
	if err != nil {
		return d.Date
	}
	at, err := zoned.Instant(d.Date, *d.Time, zl)
	if err != nil {
		return d.Date
	}
	date, _ := zoned.Local(at, loc)
	return date
}

// Score is the urgency of an open task; ok is false for a completed or deleted one.
func Score(t Task, c Context) (Result, bool) {
	if t.Completed || t.Deleted {
		return Result{}, false
	}
	loc := c.Loc
	if loc == nil {
		loc = time.UTC
	}
	r := Result{Parts: []Part{}}
	add := func(key string, raw float64) {
		if v := round2(raw); v != 0 {
			r.Parts = append(r.Parts, Part{Key: key, Value: v})
		}
	}
	if t.Due != nil && t.Due.Date != "" {
		if d, ok := days(c.Today, localDate(t.Due, loc)); ok {
			add("due", 12*Ramp(d))
		}
	}
	if t.Deadline != "" {
		if d, ok := days(c.Today, t.Deadline); ok {
			add("deadline", 8*Ramp(d))
		}
	}
	if t.Priority >= 1 && t.Priority <= 4 {
		add("priority", priorities[t.Priority])
	}
	if c.Blocks > 0 {
		add("blocks", 8)
	}
	if age, ok := days(Today(time.UnixMilli(t.CreatedAt), loc, c.DayStart), c.Today); ok && age > 0 {
		add("age", 2*float64(min(age, 365))/365)
	}
	if c.Timer {
		add("timer", 4)
	}
	if c.Blocked {
		add("blocked", -5)
	}
	if t.Start == "someday" {
		add("someday", -6)
	} else if t.Start != "" && t.Start > c.Today {
		add("deferred", -3)
	}
	sum := 0.0
	for _, p := range r.Parts {
		sum += p.Value
	}
	r.Score = round2(sum)
	return r, true
}

// Graph holds the derived blocking facts of a set of tasks, worked out in one
// pass so each score is O(1).
type Graph struct {
	open   map[string]bool
	blocks map[string]int
}

// NewGraph indexes tasks: which are open and live, and how many open, live
// tasks wait for each.
func NewGraph(tasks []Task) Graph {
	g := Graph{open: make(map[string]bool, len(tasks)), blocks: map[string]int{}}
	for _, t := range tasks {
		g.open[t.ID] = !t.Completed && !t.Deleted
	}
	for _, t := range tasks {
		if t.Completed || t.Deleted {
			continue
		}
		seen := map[string]bool{}
		for _, id := range t.BlockedBy {
			if id != t.ID && !seen[id] {
				seen[id] = true
				g.blocks[id]++
			}
		}
	}
	return g
}

// Blocks is the number of open, live tasks waiting for id.
func (g Graph) Blocks(id string) int { return g.blocks[id] }

// Blocked reports whether t waits for an open, live task known to the graph
// (the rule of internal/flow and the web's blocked state).
func (g Graph) Blocked(t Task) bool {
	for _, id := range t.BlockedBy {
		if g.open[id] {
			return true
		}
	}
	return false
}

// Less orders two scored tasks highest first (or lowest first when asc), equal
// scores by the tie chain the caller gives.
func Less(a, b float64, asc bool, tie func() bool) bool {
	if a != b {
		if asc {
			return a < b
		}
		return a > b
	}
	return tie()
}
