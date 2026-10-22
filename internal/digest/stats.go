// Package digest is the opt-in weekly email digest (OpenSpec change
// `stats-and-review`, design D5–D7): per-user settings, the scheduler on the jobs
// leader, and the content built from the user's materialized rows with the same
// definitions as the device's Statistics screen.
package digest

import (
	"encoding/json"
	"sort"
	"strings"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// This file is the Go port of web/src/lib/stats.ts (design D1). Both evaluate
// testdata/stats_fixture.json and must agree; change them together.

// Task is the part of a task row the statistics read.
type Task struct {
	ID          string
	Title       string
	ProjectID   string // "" for the Inbox
	ParentID    string
	CreatedAt   int64
	CompletedAt *int64
	Deleted     bool
	Due         string // the due date, YYYY-MM-DD, or ""
	SeriesID    string
	AssigneeID  string
	CompletedBy string
	Skipped     bool
	// Sample marks a start guide sample task (OpenSpec change
	// moments-and-onboarding, design D3): never counted.
	Sample   bool
	Position float64
	Priority int
	// Start is "someday", a start date (YYYY-MM-DD) or "" (start-dates).
	Start string
	// BlockedBy lists the ids of the tasks this one waits for (task-dependencies).
	BlockedBy []string
}

// Project is the part of a project row the statistics read.
type Project struct {
	ID       string
	Name     string
	Archived bool
	Deleted  bool
	Position float64
}

// Period is an inclusive range of local days.
type Period struct{ Start, End string }

// Input is what Compute needs.
type Input struct {
	Tasks    []Task
	Projects []Project
	// Shared maps the ids of shared projects onto the user's role there.
	Shared map[string]string
	Me     string
	// Today is the user's local day, YYYY-MM-DD.
	Today string
	// Loc converts instants to local days.
	Loc *time.Location
	// DayStart is the user's day start in minutes after midnight (OpenSpec
	// change day-boundary, design D6): an instant whose local time is before it
	// belongs to the previous day. 0 is midnight.
	DayStart int
}

// Stats are the numbers of one period.
type Stats struct {
	Completed, Created, Late, Slipped, Overdue int
	PerDay                                     []int
	OverdueTasks                               []Task
}

const day = "2006-01-02"

func parseDay(s string) time.Time {
	t, _ := time.Parse(day, s)
	return t
}

// ShiftDay adds days to a floating date (calendar arithmetic, no zone).
func ShiftDay(s string, n int) string { return parseDay(s).AddDate(0, 0, n).Format(day) }

// WeekPeriod is the week `offset` weeks from the one holding today (0 this
// week, -1 last week), starting on weekStart (0 = Sunday); the filter grammar's
// `this week` / `last week` (web/src/lib/filter/parse.ts resolveRange).
func WeekPeriod(today string, weekStart, offset int) Period {
	wd := int(parseDay(today).Weekday())
	start := ShiftDay(today, -((wd-weekStart+7)%7)+7*offset)
	return Period{Start: start, End: ShiftDay(start, 6)}
}

// ThisWeek is the current week up to today.
func ThisWeek(today string, weekStart int) Period {
	return Period{Start: WeekPeriod(today, weekStart, 0).Start, End: today}
}

// WeekStart reads a user_prefs week_start value; "system" and unknown values
// have no browser to ask on the server and read as Monday (design D6).
func WeekStart(pref string) int {
	switch pref {
	case "sun":
		return 0
	case "sat":
		return 6
	}
	return 1
}

// DayStart reads a user_prefs day_start value ("HH:MM", 00:00 to 06:00) as
// minutes after midnight; empty, malformed or out-of-range values read as 0,
// midnight (date-time-preferences "Day start out of range").
func DayStart(pref string) int {
	if len(pref) != 5 || pref[2] != ':' {
		return 0
	}
	h, m := 0, 0
	for i, c := range pref {
		if i == 2 {
			continue
		}
		if c < '0' || c > '9' {
			return 0
		}
		if i < 2 {
			h = h*10 + int(c-'0')
		} else {
			m = m*10 + int(c-'0')
		}
	}
	if m > 59 || h*60+m > 6*60 {
		return 0
	}
	return h*60 + m
}

// LogicalDay is the day an instant belongs to for a user whose day starts
// dayStart minutes after midnight: its local calendar date, or the previous
// date while the local wall time is before the day start (day-boundary D2, the
// same rule as logicalDay in web/src/lib/dates.ts). It compares the wall clock,
// so on a daylight-saving night the boundary stays at the stated local time.
func LogicalDay(t time.Time, loc *time.Location, dayStart int) string {
	if loc == nil {
		loc = time.UTC
	}
	l := t.In(loc)
	if l.Hour()*60+l.Minute() < dayStart {
		y, m, d := l.Date()
		return time.Date(y, m, d-1, 12, 0, 0, 0, loc).Format(day)
	}
	return l.Format(day)
}

func (in Input) dayOf(ms int64) string {
	return LogicalDay(time.UnixMilli(ms), in.Loc, in.DayStart)
}

// mine: every row outside shared projects; in a shared project the account
// that completed it when recorded, otherwise the assignee, or the user when
// unassigned.
func (in Input) mine(t Task) bool {
	if _, shared := in.Shared[t.ProjectID]; t.ProjectID == "" || !shared {
		return true
	}
	if t.CompletedAt != nil && t.CompletedBy != "" {
		return t.CompletedBy == in.Me
	}
	return t.AssigneeID == "" || t.AssigneeID == in.Me
}

// Counted are the rows statistics see: live, not in a trashed project, not a
// skipped habit occurrence, not a start guide sample, and the user's.
func (in Input) Counted() []Task {
	trashed := map[string]bool{}
	for _, p := range in.Projects {
		if p.Deleted {
			trashed[p.ID] = true
		}
	}
	var out []Task
	for _, t := range in.Tasks {
		if t.Deleted || (t.ProjectID != "" && trashed[t.ProjectID]) || t.Skipped || t.Sample || !in.mine(t) {
			continue
		}
		out = append(out, t)
	}
	return out
}

// OverdueOf lists open tasks due before today outside archived projects, oldest due first.
func (in Input) OverdueOf(counted []Task) []Task {
	archived := map[string]bool{}
	for _, p := range in.Projects {
		if p.Archived {
			archived[p.ID] = true
		}
	}
	var out []Task
	for _, t := range counted {
		if t.CompletedAt == nil && t.Due != "" && t.Due < in.Today && !archived[t.ProjectID] {
			out = append(out, t)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Due != out[j].Due {
			return out[i].Due < out[j].Due
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// Compute evaluates the definitions for one period.
func Compute(in Input, p Period) Stats {
	counted := in.Counted()
	inPeriod := func(d string) bool { return d >= p.Start && d <= p.End }
	var days []string
	for d := p.Start; d <= p.End; d = ShiftDay(d, 1) {
		days = append(days, d)
	}
	perDay := map[string]int{}
	var s Stats
	for _, t := range counted {
		done := ""
		if t.CompletedAt != nil {
			done = in.dayOf(*t.CompletedAt)
		}
		if done != "" && inPeriod(done) {
			s.Completed++
			perDay[done]++
			if t.Due != "" && done > t.Due {
				s.Late++
			}
		}
		if t.SeriesID == "" && inPeriod(in.dayOf(t.CreatedAt)) {
			s.Created++
		}
		if t.Due != "" && inPeriod(t.Due) && t.Due < in.Today && (done == "" || done > p.End) {
			s.Slipped++
		}
	}
	for _, d := range days {
		s.PerDay = append(s.PerDay, perDay[d])
	}
	s.OverdueTasks = in.OverdueOf(counted)
	s.Overdue = len(s.OverdueTasks)
	return s
}

// Ahead lists open tasks due today and in the next six days, outside archived projects.
func (in Input) Ahead(counted []Task) []Task {
	until := ShiftDay(in.Today, 6)
	archived := map[string]bool{}
	for _, p := range in.Projects {
		if p.Archived {
			archived[p.ID] = true
		}
	}
	var out []Task
	for _, t := range counted {
		if t.CompletedAt == nil && t.Due != "" && t.Due >= in.Today && t.Due <= until && !archived[t.ProjectID] {
			out = append(out, t)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Due != out[j].Due {
			return out[i].Due < out[j].Due
		}
		return out[i].Priority < out[j].Priority
	})
	return out
}

// WithoutNextAction lists the live, unarchived projects the user may edit tasks
// in (not a viewer) that have no actionable, no waiting and no deferred open
// top-level task: the Go port of withoutNextAction in
// web/src/lib/method/rules.ts (OpenSpec change open-loops-method, design D3).
// Both evaluate testdata/next_action_fixture.json; change them together.
func (in Input) WithoutNextAction() []Project {
	byID := make(map[string]Task, len(in.Tasks))
	for _, t := range in.Tasks {
		byID[t.ID] = t
	}
	open := func(t Task) bool { return !t.Deleted && t.CompletedAt == nil }
	blocked := func(t Task) bool {
		for _, id := range t.BlockedBy {
			if b, ok := byID[id]; ok && open(b) {
				return true
			}
		}
		return false
	}
	deferred := func(t Task) bool { return t.Start != "" && t.Start != "someday" && t.Start > in.Today }
	delegated := func(t Task) bool { return t.AssigneeID != "" && t.AssigneeID != in.Me }
	planned := map[string]bool{} // something actionable, waiting or deferred
	for _, t := range in.Tasks {
		if !open(t) || t.ParentID != "" || t.ProjectID == "" {
			continue
		}
		waiting := blocked(t) || delegated(t)
		actionable := !waiting && t.Start != "someday" && !deferred(t)
		if actionable || waiting || deferred(t) {
			planned[t.ProjectID] = true
		}
	}
	var out []Project
	for _, p := range in.Projects {
		if p.Deleted || p.Archived || planned[p.ID] || in.Shared[p.ID] == "viewer" {
			continue
		}
		out = append(out, p)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Position != out[j].Position {
			return out[i].Position < out[j].Position
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out
}

// TaskOf reads a materialized task row.
func TaskOf(e opsync.Entity) Task {
	var t Task
	t.ID = str(e, "id")
	t.Title = str(e, "title")
	t.ProjectID = str(e, "project_id")
	t.ParentID = str(e, "parent_id")
	t.CreatedAt = int64(num(e, "created_at"))
	if v, ok := e["completed_at"]; ok && string(v) != "null" {
		ms := int64(num(e, "completed_at"))
		t.CompletedAt = &ms
	}
	t.Deleted = e.Deleted()
	var due struct {
		Date string `json:"date"`
	}
	if v, ok := e["due"]; ok && string(v) != "null" {
		_ = json.Unmarshal(v, &due)
	}
	t.Due = due.Date
	t.SeriesID = str(e, "series_id")
	t.AssigneeID = str(e, "assignee_id")
	t.CompletedBy = str(e, "completed_by")
	if v, ok := e["skipped"]; ok {
		_ = json.Unmarshal(v, &t.Skipped)
	}
	if v, ok := e["sample"]; ok {
		_ = json.Unmarshal(v, &t.Sample)
	}
	t.Position = num(e, "position")
	t.Start = str(e, "start")
	if v, ok := e["blocked_by"]; ok && string(v) != "null" {
		_ = json.Unmarshal(v, &t.BlockedBy)
	}
	t.Priority = int(num(e, "priority"))
	if t.Priority == 0 {
		t.Priority = 4
	}
	return t
}

// ProjectOf reads a materialized project row.
func ProjectOf(e opsync.Entity) Project {
	p := Project{ID: str(e, "id"), Name: str(e, "name"), Deleted: e.Deleted(), Position: num(e, "position")}
	if v, ok := e["archived"]; ok {
		_ = json.Unmarshal(v, &p.Archived)
	}
	return p
}

func str(e opsync.Entity, f string) string {
	var s string
	if v, ok := e[f]; ok {
		_ = json.Unmarshal(v, &s)
	}
	return s
}

func num(e opsync.Entity, f string) float64 {
	var n float64
	if v, ok := e[f]; ok {
		_ = json.Unmarshal(v, &n)
	}
	return n
}
