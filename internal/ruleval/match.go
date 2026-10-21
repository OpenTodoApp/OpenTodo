package ruleval

import (
	"encoding/json"
	"slices"
	"strconv"
	"time"
)

// Task is the part of a task a condition reads: ids, scheduling fields and
// enumerations only, all plaintext for every account (spec "Conditions").
type Task struct {
	ID         string
	ProjectID  string
	SectionID  string
	Labels     []string
	Priority   int
	DueDate    string // the due's date in the user's zone ("" without a due)
	Deadline   string
	Start      string // "", "someday" or a date
	Evening    bool
	BlockedBy  []string
	AssigneeID string
	// OriginKind is the origin's kind, "" without an origin, "?" for an
	// encrypted origin (it matches neither a kind nor "none").
	OriginKind string
	Habit      bool
	Estimate   *int
}

// Context is what a condition is evaluated against.
type Context struct {
	UserID string
	// Today is the user's logical today (zone and day start applied, see LogicalDate).
	Today string
	// Parent maps a live project id to its parent id ("" for a top-level project).
	Parent map[string]string
	// Open reports whether a task id is a live, open task (for `blocked`).
	Open func(id string) bool
	// Tracked returns the minutes tracked on a task (every member's live entries).
	Tracked func(id string) int
}

// LogicalDate is the user's calendar date at now (Unix ms) in a fixed offset
// (minutes east of UTC), where a day starts at dayStart ("HH:MM", 00:00 to
// 06:00; anything else reads as midnight), as the day-boundary change defines it.
func LogicalDate(nowMs int64, offsetMinutes int, dayStart string) string {
	shift := dayStartMinutes(dayStart)
	t := time.UnixMilli(nowMs).In(time.FixedZone("", offsetMinutes*60)).Add(-time.Duration(shift) * time.Minute)
	return t.Format("2006-01-02")
}

func dayStartMinutes(s string) int {
	if len(s) != 5 || s[2] != ':' {
		return 0
	}
	h, err1 := strconv.Atoi(s[:2])
	m, err2 := strconv.Atoi(s[3:])
	if err1 != nil || err2 != nil || h < 0 || m < 0 || m > 59 || h*60+m > 6*60 {
		return 0
	}
	return h*60 + m
}

// AddDays adds n days to a YYYY-MM-DD date.
func AddDays(date string, n int) string {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return date
	}
	return t.AddDate(0, 0, n).Format("2006-01-02")
}

// OriginKindOf reads a stored origin value: "" when there is none, its kind
// when it is an object, "?" for a ciphertext string (it matches no kind, and
// not "none" either).
func OriginKindOf(raw []byte) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var o struct {
		Kind string `json:"kind"`
	}
	if json.Unmarshal(raw, &o) == nil && o.Kind != "" {
		return o.Kind
	}
	return "?"
}

// Matches reports whether t satisfies every predicate of c (a nil condition
// matches every task).
func Matches(c *Condition, t Task, ctx Context) bool {
	if c == nil {
		return true
	}
	checks := []func() bool{
		func() bool { return c.Project == nil || matchProject(c.Project, t, ctx) },
		func() bool { return c.Section == nil || matchSection(c.Section, t) },
		func() bool { return c.Labels == nil || matchLabels(c.Labels, t.Labels) },
		func() bool { return len(c.Priority) == 0 || slices.Contains(c.Priority, t.Priority) },
		func() bool { return c.Due == nil || matchDate(c.Due, t.DueDate, ctx.Today) },
		func() bool { return c.Deadline == nil || matchDate(c.Deadline, t.Deadline, ctx.Today) },
		func() bool { return c.Start == "" || matchStart(c.Start, t.Start, ctx.Today) },
		func() bool { return c.Evening == nil || *c.Evening == t.Evening },
		func() bool { return c.Blocked == nil || *c.Blocked == isBlocked(t, ctx) },
		func() bool { return c.Assignee == "" || matchAssignee(c.Assignee, t.AssigneeID, ctx.UserID) },
		func() bool { return c.Origin == nil || matchOrigin(c.Origin, t.OriginKind) },
		func() bool { return c.Habit == nil || *c.Habit == t.Habit },
		func() bool { return c.Estimate == nil || matchMinutes(c.Estimate, t.Estimate) },
		func() bool { return c.Tracked == nil || matchTracked(c.Tracked, t, ctx) },
	}
	for _, ok := range checks {
		if !ok() {
			return false
		}
	}
	return true
}

func matchProject(p *ProjectPred, t Task, ctx Context) bool {
	if p.None {
		return t.ProjectID == ""
	}
	if t.ProjectID == "" {
		return false
	}
	if slices.Contains(p.In, t.ProjectID) {
		return true
	}
	if !p.Descendants {
		return false
	}
	// Walk up the tree (bounded, so a cycle in synced data ends).
	cur := t.ProjectID
	for i := 0; i < 64; i++ {
		parent, ok := ctx.Parent[cur]
		if !ok || parent == "" {
			return false
		}
		if slices.Contains(p.In, parent) {
			return true
		}
		cur = parent
	}
	return false
}

func matchSection(p *SectionPred, t Task) bool {
	if p.None {
		return t.SectionID == ""
	}
	return t.SectionID != "" && slices.Contains(p.In, t.SectionID)
}

func matchLabels(p *LabelsPred, labels []string) bool {
	if len(p.Any) > 0 && !slices.ContainsFunc(p.Any, func(id string) bool { return slices.Contains(labels, id) }) {
		return false
	}
	for _, id := range p.All {
		if !slices.Contains(labels, id) {
			return false
		}
	}
	for _, id := range p.None {
		if slices.Contains(labels, id) {
			return false
		}
	}
	return true
}

// matchDate reads a due or deadline date against the logical today: overdue is
// before today, within N days is from today to today+N.
func matchDate(p *DatePred, date, today string) bool {
	switch p.Word {
	case "none":
		return date == ""
	case "set":
		return date != ""
	case "today":
		return date != "" && date == today
	case "overdue":
		return date != "" && date < today
	case "within":
		return date != "" && date >= today && date <= AddDays(today, p.Within)
	}
	return false
}

func matchStart(want, start, today string) bool {
	switch want {
	case "someday":
		return start == "someday"
	case "deferred":
		return start != "" && start != "someday" && start > today
	case "none":
		return start == ""
	}
	return false
}

func isBlocked(t Task, ctx Context) bool {
	for _, id := range t.BlockedBy {
		if ctx.Open != nil && ctx.Open(id) {
			return true
		}
	}
	return false
}

func matchAssignee(want, assignee, me string) bool {
	switch want {
	case "me":
		return assignee != "" && assignee == me
	case "none":
		return assignee == ""
	case "anyone":
		return assignee != ""
	}
	return false
}

func matchOrigin(p *OriginPred, kind string) bool {
	if p.None {
		return kind == ""
	}
	return kind == p.Kind
}

func matchMinutes(p *MinutesPred, v *int) bool {
	if p.None {
		return v == nil || *v == 0
	}
	if v == nil {
		return false
	}
	if p.Min != nil && *v < *p.Min {
		return false
	}
	if p.Max != nil && *v > *p.Max {
		return false
	}
	return true
}

func matchTracked(p *MinutesPred, t Task, ctx Context) bool {
	m := 0
	if ctx.Tracked != nil {
		m = ctx.Tracked(t.ID)
	}
	if p.None {
		return m == 0
	}
	return p.Min != nil && m >= *p.Min
}
