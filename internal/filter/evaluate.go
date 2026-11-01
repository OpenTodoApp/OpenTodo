package filter

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/daypart"
	"github.com/OpenTodoApp/opentodo/internal/flow"
)

// The filter evaluator on the server (OpenSpec change routines-engine,
// "Evaluation on the server for routines"): a parsed query compiled into a
// predicate over materialised task rows, the same as compile in
// web/src/lib/filter/evaluate.ts. Both run web/src/lib/filter/evaluate.vectors.json.

// Node kinds.
const (
	KindOr        = "or"
	KindAnd       = "and"
	KindNot       = "not"
	KindLabel     = "label"
	KindProject   = "project"
	KindPriority  = "priority"
	KindDate      = "date"
	KindKeyword   = "keyword"
	KindSearch    = "search"
	KindNotes     = "notes"
	KindOrigin    = "origin"
	KindEnergy    = "energy"
	KindWorkspace = "workspace"
	KindField     = "field"
	KindNoField   = "nofield"
	KindTracked   = "tracked"
)

// Node is one term of a parsed query.
type Node struct {
	Kind        string
	Items       []*Node
	Item        *Node
	Name        string
	Descendants bool
	Priority    int
	// Field is due, created, completed, deadline or start for a date term.
	Field   string
	Op      string
	Date    DateExpr
	Keyword string
	Text    string
	Value   FieldValue
	Minutes int
}

// DateExpr is a date of the grammar: iso, relative (days from today), weekday
// (0 Sunday) or period (unit week or month, offset from this one).
type DateExpr struct {
	Type   string
	ISO    string
	Days   int
	Day    int
	Unit   string
	Offset int
}

// FieldValue is the value of a custom field term.
type FieldValue struct {
	Type   string // text, number, bool, date
	Text   string
	Number float64
	Bool   bool
	Date   DateExpr
}

// Row is a materialised entity row.
type Row = map[string]json.RawMessage

// Context is what evaluating reads besides the task.
type Context struct {
	// Today is the viewer's logical today; WeekStart the first day of the week (0 Sunday).
	Today     string
	WeekStart int
	// Zone and DayStart (minutes) place created and completed instants on days.
	Zone     *time.Location
	DayStart int
	// Live labels, projects, sections and custom field definitions, and every
	// task (for blocked and available).
	Labels, Projects, Sections, Fields, Tasks []Row
	// Tracked is the minutes tracked per task.
	Tracked map[string]int
}

func str(r Row, f string) string {
	var s string
	_ = json.Unmarshal(r[f], &s)
	return s
}

func isNull(raw json.RawMessage) bool { return len(raw) == 0 || string(raw) == "null" }

func shiftISO(iso string, days int) string {
	t, err := time.Parse("2006-01-02", iso)
	if err != nil {
		return iso
	}
	return t.AddDate(0, 0, days).Format("2006-01-02")
}

func weekdayOf(iso string) int {
	t, _ := time.Parse("2006-01-02", iso)
	return int(t.Weekday())
}

func monthStart(iso string, months int) string {
	t, _ := time.Parse("2006-01-02", iso)
	return time.Date(t.Year(), t.Month()+time.Month(months), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
}

// ResolveRange is the days a date expression denotes, as resolveRange.
func ResolveRange(d DateExpr, today string, weekStart int) (string, string) {
	switch d.Type {
	case "iso":
		return d.ISO, d.ISO
	case "relative":
		x := shiftISO(today, d.Days)
		return x, x
	case "weekday":
		x := shiftISO(today, (d.Day-weekdayOf(today)+7)%7)
		return x, x
	}
	if d.Unit == "week" {
		start := shiftISO(today, -((weekdayOf(today)-weekStart+7)%7)+7*d.Offset)
		return start, shiftISO(start, 6)
	}
	return monthStart(today, d.Offset), shiftISO(monthStart(today, d.Offset+1), -1)
}

func compareISO(d, op, start, end string) bool {
	switch op {
	case "<":
		return d < start
	case "<=":
		return d <= end
	case "=":
		return d >= start && d <= end
	case ">=":
		return d >= start
	case ">":
		return d > end
	}
	return false
}

func nameKey(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

func lowerText(s string) string { return strings.ToLower(s) }

// Pred is a compiled query.
type Pred func(Row) bool

func never(Row) bool { return false }

// MentionsState reports a query that names completed or open, or compares
// the completion date: otherwise only open tasks match.
func MentionsState(n *Node) bool {
	switch n.Kind {
	case KindOr, KindAnd:
		for _, x := range n.Items {
			if MentionsState(x) {
				return true
			}
		}
		return false
	case KindNot:
		return MentionsState(n.Item)
	case KindKeyword:
		return n.Keyword == "completed" || n.Keyword == "open"
	case KindDate:
		return n.Field == "completed"
	}
	return false
}

// Evaluate parses a query and compiles it; an empty query matches nothing.
// Warnings name unknown labels, projects, fields and workspaces.
func Evaluate(query string, c Context) (Pred, []string, error) {
	ast, err := ParseQuery(query)
	if err != nil || ast == nil {
		return never, nil, err
	}
	return Compile(ast, c)
}

type compiler struct {
	c        Context
	warnings []string
	labels   map[string][]string
	projects map[string][]string
	children map[string][]string
	parent   map[string]string
	fields   map[string][]Row
	blocked  map[string]bool
	flow     flow.States
	tomorrow string
}

func (k *compiler) warn(msg string) {
	for _, w := range k.warnings {
		if w == msg {
			return
		}
	}
	k.warnings = append(k.warnings, msg)
}

// Compile compiles a parsed query, as compile in evaluate.ts. Deleted tasks
// never match; only open ones unless the query mentions state.
func Compile(ast *Node, c Context) (Pred, []string, error) {
	if c.Zone == nil {
		c.Zone = time.UTC
	}
	k := &compiler{c: c, labels: map[string][]string{}, projects: map[string][]string{}, children: map[string][]string{}, parent: map[string]string{},
		fields: map[string][]Row{}, tomorrow: shiftISO(c.Today, 1)}
	for _, l := range c.Labels {
		if isNull(l["deleted_at"]) {
			k.labels[nameKey(str(l, "name"))] = append(k.labels[nameKey(str(l, "name"))], str(l, "id"))
		}
	}
	for _, p := range c.Projects {
		if isNull(p["deleted_at"]) {
			id := str(p, "id")
			k.projects[nameKey(str(p, "name"))] = append(k.projects[nameKey(str(p, "name"))], id)
			k.parent[id] = str(p, "parent_id")
			k.children[str(p, "parent_id")] = append(k.children[str(p, "parent_id")], id)
		}
	}
	for _, f := range c.Fields {
		if isNull(f["deleted_at"]) {
			k.fields[nameKey(str(f, "name"))] = append(k.fields[nameKey(str(f, "name"))], f)
		}
	}
	pred, err := k.build(ast)
	if err != nil {
		return nil, nil, err
	}
	openOnly := !MentionsState(ast)
	test := func(t Row) bool {
		if !isNull(t["deleted_at"]) {
			return false
		}
		if openOnly {
			return isNull(t["completed_at"]) && pred(t)
		}
		return string(t["skipped"]) != "true" && pred(t)
	}
	return test, k.warnings, nil
}

func (k *compiler) build(n *Node) (Pred, error) {
	switch n.Kind {
	case KindOr, KindAnd:
		ps := make([]Pred, 0, len(n.Items))
		for _, x := range n.Items {
			p, err := k.build(x)
			if err != nil {
				return nil, err
			}
			ps = append(ps, p)
		}
		if n.Kind == KindOr {
			return func(t Row) bool {
				for _, p := range ps {
					if p(t) {
						return true
					}
				}
				return false
			}, nil
		}
		return func(t Row) bool {
			for _, p := range ps {
				if !p(t) {
					return false
				}
			}
			return true
		}, nil
	case KindNot:
		p, err := k.build(n.Item)
		if err != nil {
			return nil, err
		}
		return func(t Row) bool { return !p(t) }, nil
	case KindLabel:
		ids := k.labels[nameKey(n.Name)]
		if ids == nil {
			k.warn(`No label named "` + n.Name + `"`)
			return never, nil
		}
		return func(t Row) bool { return anyIn(listOf(t["labels"]), ids) }, nil
	case KindProject:
		ids := k.projects[nameKey(n.Name)]
		if ids == nil {
			k.warn(`No project named "` + n.Name + `"`)
			return never, nil
		}
		set := map[string]bool{}
		for _, id := range ids {
			set[id] = true
			if n.Descendants {
				k.descend(id, set)
			}
		}
		return func(t Row) bool { return set[str(t, "project_id")] }, nil
	case KindPriority:
		want := n.Priority
		return func(t Row) bool { return priorityOf(t) == want }, nil
	case KindDate:
		return k.datePred(n), nil
	case KindField:
		return k.fieldTerm(n)
	case KindNoField:
		defs := k.fields[nameKey(n.Name)]
		if defs == nil {
			k.warn(`No field named "` + n.Name + `"`)
			return never, nil
		}
		return func(t Row) bool {
			for _, d := range defs {
				if k.applies(t, d) {
					if v := t["fields."+str(d, "id")]; isNull(v) || string(v) == `""` {
						return true
					}
				}
			}
			return false
		}, nil
	case KindSearch:
		needle := lowerText(n.Text)
		return func(t Row) bool {
			return strings.Contains(lowerText(str(t, "title")), needle) || strings.Contains(lowerText(str(t, "description")), needle)
		}, nil
	case KindNotes:
		needle := lowerText(n.Text)
		return func(t Row) bool { return strings.Contains(lowerText(str(t, "description")), needle) }, nil
	case KindOrigin:
		want := lowerText(n.Text)
		return func(t Row) bool { ok, key := originOf(t); return ok && lowerText(key) == want }, nil
	case KindEnergy:
		want := n.Text
		return func(t Row) bool { return energyOf(t) == want }, nil
	case KindWorkspace:
		k.warn(`No workspace named "` + n.Name + `"`)
		return never, nil
	case KindTracked:
		op, want := n.Op, n.Minutes
		return func(t Row) bool { return cmpInt(k.c.Tracked[str(t, "id")], op, want) }, nil
	case KindKeyword:
		return k.keyword(n.Keyword), nil
	}
	return never, nil
}

func (k *compiler) descend(id string, set map[string]bool) {
	for _, c := range k.children[id] {
		if !set[c] {
			set[c] = true
			k.descend(c, set)
		}
	}
}

func listOf(raw json.RawMessage) []string {
	var l []string
	_ = json.Unmarshal(raw, &l)
	return l
}

func anyIn(list, ids []string) bool {
	for _, a := range list {
		for _, b := range ids {
			if a == b {
				return true
			}
		}
	}
	return false
}

func priorityOf(t Row) int {
	var p int
	_ = json.Unmarshal(t["priority"], &p)
	return p
}

func cmpInt(a int, op string, b int) bool {
	switch op {
	case "<":
		return a < b
	case "<=":
		return a <= b
	case "=":
		return a == b
	case ">=":
		return a >= b
	}
	return a > b
}

// dueOf is a task's due date and whether it has a time ("" without a due).
func dueOf(t Row, zone *time.Location) (string, bool) {
	if isNull(t["due"]) {
		return "", false
	}
	var d struct {
		Date string  `json:"date"`
		Time *string `json:"time"`
		TZ   *string `json:"tz"`
	}
	if json.Unmarshal(t["due"], &d) != nil {
		return "", false
	}
	if d.TZ != nil && d.Time != nil {
		if loc, err := time.LoadLocation(*d.TZ); err == nil {
			if at, err := time.ParseInLocation("2006-01-02 15:04", d.Date+" "+*d.Time, loc); err == nil {
				return at.In(zone).Format("2006-01-02"), true
			}
		}
	}
	return d.Date, d.Time != nil && *d.Time != ""
}

// startOfDay is the first instant of a logical day in the viewer's zone.
func (k *compiler) startOfDay(iso string) int64 {
	t, _ := time.ParseInLocation("2006-01-02", iso, k.c.Zone)
	return t.Add(time.Duration(k.c.DayStart) * time.Minute).UnixMilli()
}

func (k *compiler) datePred(n *Node) Pred {
	start, end := ResolveRange(n.Date, k.c.Today, k.c.WeekStart)
	op := n.Op
	switch n.Field {
	case "created", "completed":
		field := n.Field + "_at"
		lo, next := k.startOfDay(start), k.startOfDay(shiftISO(end, 1))
		return func(t Row) bool {
			if isNull(t[field]) {
				return false
			}
			var ms float64
			if json.Unmarshal(t[field], &ms) != nil {
				return false
			}
			m := int64(ms)
			switch op {
			case "<":
				return m < lo
			case "<=":
				return m < next
			case "=":
				return m >= lo && m < next
			case ">=":
				return m >= lo
			}
			return m >= next
		}
	case "deadline":
		return func(t Row) bool { d := str(t, "deadline"); return d != "" && compareISO(d, op, start, end) }
	case "start":
		return func(t Row) bool {
			d := str(t, "start")
			return d != "" && d != "someday" && compareISO(d, op, start, end)
		}
	}
	return func(t Row) bool {
		d, _ := dueOf(t, k.c.Zone)
		return d != "" && compareISO(d, op, start, end)
	}
}

// applies reports whether a field definition applies to the task's project:
// its own project and the sub-projects (inherited-custom-fields).
func (k *compiler) applies(t Row, def Row) bool {
	pid, want := str(t, "project_id"), str(def, "project_id")
	for i := 0; pid != "" && i < 64; i++ {
		if pid == want {
			return true
		}
		pid = k.parent[pid]
	}
	return false
}

func (k *compiler) fieldTerm(n *Node) (Pred, error) {
	defs := k.fields[nameKey(n.Name)]
	if defs == nil {
		k.warn(`No field named "` + n.Name + `"`)
		return never, nil
	}
	var ps []Pred
	var first error
	for _, d := range defs {
		p, err := k.fieldPred(d, n)
		if err != nil {
			if first == nil {
				first = err
			}
			continue
		}
		ps = append(ps, p)
	}
	if len(ps) == 0 {
		return nil, first
	}
	return func(t Row) bool {
		for _, p := range ps {
			if p(t) {
				return true
			}
		}
		return false
	}, nil
}

func (k *compiler) fieldPred(def Row, n *Node) (Pred, error) {
	key := "fields." + str(def, "id")
	op := n.Op
	value := func(t Row) json.RawMessage {
		if !k.applies(t, def) {
			return nil
		}
		return t[key]
	}
	switch str(def, "type") {
	case "number":
		if n.Value.Type != "number" {
			return nil, &SyntaxError{Message: `Field "` + n.Name + `" holds numbers`}
		}
		want := n.Value.Number
		return func(t Row) bool {
			var v float64
			if raw := value(t); raw == nil || json.Unmarshal(raw, &v) != nil {
				return false
			}
			switch op {
			case "<":
				return v < want
			case "<=":
				return v <= want
			case "=":
				return v == want
			case ">=":
				return v >= want
			}
			return v > want
		}, nil
	case "date":
		if n.Value.Type != "date" {
			return nil, &SyntaxError{Message: `Field "` + n.Name + `" holds dates`}
		}
		start, end := ResolveRange(n.Value.Date, k.c.Today, k.c.WeekStart)
		return func(t Row) bool {
			var v string
			if raw := value(t); raw == nil || json.Unmarshal(raw, &v) != nil || !isoDate.MatchString(v) {
				return false
			}
			return compareISO(v, op, start, end)
		}, nil
	case "checkbox":
		if op != "=" || n.Value.Type != "bool" {
			return nil, &SyntaxError{Message: `Checkbox fields support "= true" or "= false" only`}
		}
		want := n.Value.Bool
		return func(t Row) bool {
			if !k.applies(t, def) {
				return false
			}
			checked := string(t[key]) == "true"
			return checked == want
		}, nil
	}
	if op != "=" {
		return nil, &SyntaxError{Message: `Text fields support "=" only`}
	}
	want := lowerText(fieldValueText(n.Value))
	return func(t Row) bool {
		var v string
		if raw := value(t); raw == nil || json.Unmarshal(raw, &v) != nil {
			return false
		}
		return lowerText(v) == want
	}, nil
}

// fieldValueText is a field term's value as query text.
func fieldValueText(v FieldValue) string {
	switch v.Type {
	case "text":
		return v.Text
	case "bool":
		if v.Bool {
			return "true"
		}
		return "false"
	case "number":
		return strconv.FormatFloat(v.Number, 'f', -1, 64)
	}
	return printDate(v.Date)
}

var weekdayNames = []string{"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"}

func printDate(d DateExpr) string {
	switch d.Type {
	case "iso":
		return d.ISO
	case "weekday":
		return weekdayNames[d.Day]
	case "period":
		switch d.Offset {
		case 0:
			return "this " + d.Unit
		case -1:
			return "last " + d.Unit
		case 1:
			return "next " + d.Unit
		}
		return itoa(-d.Offset) + " " + d.Unit + "s ago"
	}
	switch d.Days {
	case 0:
		return "today"
	case 1:
		return "tomorrow"
	case -1:
		return "yesterday"
	}
	if d.Days < 0 {
		return itoa(-d.Days) + " days ago"
	}
	return itoa(d.Days) + " days"
}

func itoa(n int) string { return strconv.Itoa(n) }

// originOf reports a task's origin and its key (the provider, else the kind).
func originOf(t Row) (bool, string) {
	raw := t["origin"]
	if isNull(raw) {
		return false, ""
	}
	var o struct {
		Kind     string `json:"kind"`
		Provider string `json:"provider"`
	}
	if json.Unmarshal(raw, &o) != nil || o.Kind == "" {
		return false, ""
	}
	if o.Provider != "" {
		return true, o.Provider
	}
	return true, o.Kind
}

// energyOf is deep, medium or low, or "" (a value this build does not know reads as none).
func energyOf(t Row) string {
	switch e := str(t, "energy"); e {
	case "deep", "medium", "low":
		return e
	}
	return ""
}

func (k *compiler) isBlocked(t Row) bool {
	if k.blocked == nil {
		k.blocked = map[string]bool{}
		open := map[string]bool{}
		for _, x := range k.c.Tasks {
			if isNull(x["deleted_at"]) && isNull(x["completed_at"]) {
				open[str(x, "id")] = true
			}
		}
		for _, x := range k.c.Tasks {
			for _, b := range listOf(x["blocked_by"]) {
				if open[b] && b != str(x, "id") {
					k.blocked[str(x, "id")] = true
				}
			}
		}
	}
	return k.blocked[str(t, "id")]
}

func (k *compiler) available(t Row) bool {
	if k.flow == nil {
		in := flow.Input{Today: k.c.Today}
		for _, x := range k.c.Tasks {
			in.Tasks = append(in.Tasks, flow.TaskOf(x))
		}
		for _, p := range k.c.Projects {
			in.Projects = append(in.Projects, flow.ProjectOf(p))
		}
		for _, s := range k.c.Sections {
			in.Sections = append(in.Sections, flow.SectionOf(s))
		}
		k.flow = flow.Compute(in)
	}
	return k.flow.Available(str(t, "id"))
}

func (k *compiler) keyword(w string) Pred {
	today, c := k.c.Today, k.c
	due := func(t Row) string { d, _ := dueOf(t, c.Zone); return d }
	desc := func(t Row) string { return strings.TrimSpace(str(t, "description")) }
	switch w {
	case "overdue":
		return func(t Row) bool { d := due(t); return d != "" && d < today }
	case "today":
		return func(t Row) bool { return due(t) == today }
	case "tomorrow":
		return func(t Row) bool { return due(t) == k.tomorrow }
	case "no date":
		return func(t Row) bool { return isNull(t["due"]) }
	case "no time":
		return func(t Row) bool { d, timed := dueOf(t, c.Zone); return d != "" && !timed }
	case "no project":
		return func(t Row) bool { return str(t, "project_id") == "" }
	case "no labels":
		return func(t Row) bool { return len(listOf(t["labels"])) == 0 }
	case "no deadline":
		return func(t Row) bool { return str(t, "deadline") == "" }
	case "no start":
		return func(t Row) bool { return str(t, "start") == "" }
	case "someday":
		return func(t Row) bool { return str(t, "start") == "someday" }
	case "deferred":
		return func(t Row) bool { s := str(t, "start"); return s != "" && s != "someday" && s > today }
	case "evening":
		return func(t Row) bool { return string(t["evening"]) == "true" }
	case "morning", "afternoon":
		return func(t Row) bool { return daypart.OfRow(t) == w }
	case "completed":
		return func(t Row) bool { return !isNull(t["completed_at"]) && string(t["skipped"]) != "true" }
	case "open":
		return func(t Row) bool { return isNull(t["completed_at"]) }
	case "subtask":
		return func(t Row) bool { return str(t, "parent_id") != "" }
	case "habit":
		return func(t Row) bool { return string(t["habit"]) == "true" }
	case "origin":
		return func(t Row) bool { ok, _ := originOf(t); return ok }
	case "no origin":
		return func(t Row) bool { ok, _ := originOf(t); return !ok }
	case "energy":
		return func(t Row) bool { return energyOf(t) != "" }
	case "no energy":
		return func(t Row) bool { return energyOf(t) == "" }
	case "notes":
		return func(t Row) bool { return desc(t) != "" }
	case "no notes":
		return func(t Row) bool { return desc(t) == "" }
	case "tracked":
		return func(t Row) bool { return c.Tracked[str(t, "id")] >= 1 }
	case "blocked":
		return k.isBlocked
	case "unblocked":
		return func(t Row) bool { return !k.isBlocked(t) }
	case "available":
		return k.available
	}
	return never
}
