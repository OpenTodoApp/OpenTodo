package importer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/origin"
)

// Super Productivity: the JSON from Settings → Sync & Backup → Export data
// (OpenSpec change migration-everywhere, design D2). Since version 14 the
// slices sit under "data" ({timestamp, lastUpdate, crossModelVersion, data});
// older backups have them at the top level. Tasks live in task, and archived
// ones in archiveYoung.task and archiveOld.task (taskArchive before 14).
// Verified against backups of Super Productivity 19.3.1.

const superProductivityFormat = "super-productivity-json"

// spProvider is the origin provider and source id prefix.
const spProvider = "super-productivity"

const (
	spInbox = "INBOX_PROJECT"
	spToday = "TODAY"
)

type superProductivityProfile struct{}

func (superProductivityProfile) Name() string { return superProductivityFormat }
func (superProductivityProfile) Description() string {
	return "Super Productivity: the backup from Settings → Sync & Backup → Export data"
}

// spSlices returns the object holding the slices: data, or the top level.
func spSlices(top map[string]json.RawMessage) map[string]json.RawMessage {
	if raw, ok := top["data"]; ok {
		var inner map[string]json.RawMessage
		if json.Unmarshal(raw, &inner) == nil && inner != nil {
			return inner
		}
	}
	return top
}

// Detect accepts top-level (or data-level) task and project slices, each an
// entity adapter with ids and entities.
func (superProductivityProfile) Detect(data []byte) bool {
	top, ok := topLevel(data)
	if !ok {
		return false
	}
	s := spSlices(top)
	for _, k := range []string{"task", "project"} {
		var slice map[string]json.RawMessage
		if json.Unmarshal(s[k], &slice) != nil || !isArray(slice["ids"]) {
			return false
		}
		if e := bytes.TrimSpace(slice["entities"]); len(e) == 0 || e[0] != '{' {
			return false
		}
	}
	return true
}

func (superProductivityProfile) Read(r io.Reader, opts Options) (*Parsed, error) {
	v, err := decodeJSON(r)
	if err != nil {
		return nil, err
	}
	top := asObj(v)
	if top == nil {
		return nil, &FileError{"expected a Super Productivity backup object"}
	}
	if d := asObj(top["data"]); d != nil {
		top = d
	}
	sp := &spReader{opts: opts, loc: opts.Location(), out: &Parsed{}, tags: map[string]string{}, repeat: map[string]obj{}}
	for _, t := range spEntities(top["tag"]) {
		if id := t.str("id"); id != spToday {
			sp.tags[id] = t.str("title")
		}
	}
	for _, c := range spEntities(top["taskRepeatCfg"]) {
		sp.repeat[c.str("id")] = c
	}
	sp.providers = spEntities(top["issueProvider"])
	sp.projects(top)
	var tasks []obj
	tasks = append(tasks, spEntities(top["task"])...)
	archived := len(tasks)
	for _, a := range []any{asObj(top["archiveYoung"])["task"], asObj(top["archiveOld"])["task"], top["taskArchive"]} {
		tasks = append(tasks, spEntities(a)...)
	}
	seen := map[string]bool{}
	for i, t := range tasks {
		id := t.str("id")
		if seen[id] {
			continue // the same task in both archives
		}
		seen[id] = true
		sp.line++
		sp.out.Rows = append(sp.out.Rows, sp.task(t, i >= archived))
		if len(sp.out.Rows) > MaxRows {
			return nil, ErrTooManyRows
		}
	}
	return sp.out, nil
}

// spEntities lists an entity adapter's entities in the order of its ids
// (entities missing from ids come last).
func spEntities(v any) []obj {
	slice := asObj(v)
	if slice == nil {
		return nil
	}
	entities := asObj(slice["entities"])
	var out []obj
	listed := map[string]bool{}
	for _, id := range asList(slice["ids"]) {
		s, _ := id.(string)
		if e := asObj(entities[s]); e != nil && !listed[s] {
			listed[s] = true
			out = append(out, e)
		}
	}
	for id, e := range entities {
		if o := asObj(e); o != nil && !listed[id] {
			out = append(out, o)
		}
	}
	return out
}

type spReader struct {
	opts      Options
	loc       *time.Location
	out       *Parsed
	line      int
	tags      map[string]string
	repeat    map[string]obj
	providers []obj
}

func spSource(id string) string { return spProvider + ":" + id }

// projects appends one row per project except the Inbox, with the project's
// notes (the note slice) as its description.
func (sp *spReader) projects(top obj) {
	notes := map[string][]string{}
	for _, n := range spEntities(top["note"]) {
		if text := strings.TrimSpace(n.str("content")); text != "" && n.str("projectId") != "" {
			notes[n.str("projectId")] = append(notes[n.str("projectId")], text)
		}
	}
	for _, p := range spEntities(top["project"]) {
		id := p.str("id")
		if id == spInbox {
			continue
		}
		sp.line++
		row := Row{Line: sp.line, Kind: KindProject, SourceID: spSource("project:" + id), Title: p.str("title"),
			Description: strings.Join(notes[id], "\n\n"), Archived: p.boolean("isArchived")}
		if p.boolean("isDone") && !row.Archived {
			row.Archived = true
			row.warn("done project imported as an archived project")
		}
		if row.Title == "" {
			row.fail("project title is required")
		}
		sp.out.Rows = append(sp.out.Rows, row)
	}
}

func (sp *spReader) task(t obj, archived bool) Row {
	id := t.str("id")
	row := Row{Line: sp.line, Kind: KindTask, SourceID: spSource(id), Title: t.str("title"), Description: t.str("notes")}
	row.Origin = importedOrigin(spProvider, row.SourceID)
	if row.Title == "" {
		row.fail("title is required")
	}
	if p := t.str("projectId"); p != "" && p != spInbox {
		row.ProjectSourceID = spSource("project:" + p)
	}
	if p := t.str("parentId"); p != "" {
		row.ParentSourceID = spSource(p)
	}
	row.Completed = t.boolean("isDone") || archived
	if row.Completed {
		row.CompletedAt = spMillis(t["doneOn"])
		if row.CompletedAt == 0 {
			row.CompletedAt = spMillis(t["modified"])
		}
	}
	row.CreatedAt = spMillis(t["created"])
	today := false
	for _, tag := range t.names("tagIds") {
		if tag == spToday {
			today = true
		} else if name := sp.tags[tag]; name != "" {
			row.Labels = append(row.Labels, name)
		}
	}
	row.Labels = dedupeNames(row.Labels)
	sp.schedule(&row, t, today)
	if ms := spMillis(t["timeEstimate"]); ms > 0 {
		row.EstimateMinutes = int(math.Ceil(float64(ms) / 60000))
	}
	sp.tracked(&row, t)
	if cfg := t.str("repeatCfgId"); cfg != "" && !row.Completed {
		sp.recurrence(&row, sp.repeat[cfg])
	}
	sp.issue(&row, t)
	for _, a := range asList(t["attachments"]) {
		if ao := asObj(a); ao != nil {
			row.addLink(ao.str("title"), ao.str("path", "url"))
		}
	}
	return row
}

// spMillis reads a millisecond time or duration; 0 when absent.
func spMillis(v any) int64 {
	n, ok := v.(json.Number)
	if !ok {
		return 0
	}
	f, err := n.Float64()
	if err != nil || f <= 0 {
		return 0
	}
	return int64(f)
}

// schedule reads dueDay (a date), dueWithTime or the older plannedAt (an
// instant shown in the import's time zone), remindAt and deadlineDay. A task
// of an older backup in the Today tag with no date is due on the import date.
func (sp *spReader) schedule(row *Row, t obj, today bool) {
	if d := t.str("dueDay"); d != "" {
		if _, err := time.Parse("2006-01-02", d); err == nil {
			row.Due = &Due{Date: d}
		} else {
			row.warn("due day %q not understood; imported without it", d)
		}
	}
	if at := spMillis(firstVal(t, "dueWithTime", "plannedAt")); at > 0 && row.Due == nil {
		l := time.UnixMilli(at).In(sp.loc)
		row.Due = &Due{Date: l.Format("2006-01-02"), Time: l.Format("15:04")}
	}
	if at := spMillis(t["remindAt"]); at > 0 && !row.Completed {
		row.Reminders = append(row.Reminders, Reminder{Absolute: true, At: at})
	}
	if d := t.str("deadlineDay"); d != "" {
		if _, err := time.Parse("2006-01-02", d); err == nil {
			row.Deadline = d
		}
	}
	if today && row.Due == nil && !row.Completed {
		row.Due = &Due{Date: sp.opts.exportedAt.In(sp.loc).Format("2006-01-02")}
		row.warn("in Super Productivity's Today; imported due on the import date")
	}
}

// tracked turns timeSpentOnDay ({"YYYY-MM-DD": ms}) into time entries.
func (sp *spReader) tracked(row *Row, t obj) {
	days := asObj(t["timeSpentOnDay"])
	keys := make([]string, 0, len(days))
	for d := range days {
		keys = append(keys, d)
	}
	sort.Strings(keys)
	for _, d := range keys {
		ms := spMillis(days[d])
		if minutes := int(math.Round(float64(ms) / 60000)); minutes > 0 {
			row.TimeEntries = append(row.TimeEntries, TimeEntry{Day: d, Minutes: minutes})
		}
	}
}

var spWeekdays = []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}

// recurrence maps a repeat configuration onto the rule grammar.
func (sp *spReader) recurrence(row *Row, c obj) {
	if c == nil {
		row.warn("repeat configuration not in the file; imported without it")
		return
	}
	if c.boolean("isPaused") {
		row.warn("repeat is paused in Super Productivity; imported without it")
		return
	}
	n, _ := strconv.Atoi(c.str("repeatEvery"))
	if n < 1 {
		n = 1
	}
	every := func(unit string) string {
		if n == 1 {
			return "every " + unit
		}
		return fmt.Sprintf("every %d %ss", n, unit)
	}
	after := c.boolean("repeatFromCompletionDate")
	text := ""
	switch strings.ToUpper(c.str("repeatCycle")) {
	case "DAILY":
		text = every("day")
	case "WEEKLY", "":
		var days []string
		for _, d := range spWeekdays {
			if c.boolean(d) {
				days = append(days, d)
			}
		}
		switch {
		case len(days) > 0 && n == 1 && !after:
			text = "every " + strings.Join(days, ", ")
		case len(days) > 1:
			text = every("week")
			row.warn("repeat on %s every %d weeks imported as %q", strings.Join(days, ", "), n, text)
		default:
			text = every("week")
		}
	case "MONTHLY":
		text = every("month")
	case "YEARLY":
		text = every("year")
	default:
		row.warn("repeat %q not supported; imported without it", c.str("repeatCycle"))
		return
	}
	if after && !strings.Contains(text, ",") && !strings.HasPrefix(text, "every monday") {
		text += " after completion"
	}
	due := ""
	if row.Due != nil {
		due = row.Due.Date
	}
	rule, err := parseRecurrence(text, due)
	if err != nil || rule == "" {
		row.warn("repeat rule %q not supported; imported without it", text)
		return
	}
	row.Recurrence = rule
}

// issue links a task imported from an issue tracker to the issue: a GitHub
// issue's address is built from its provider's repository and the issue id.
func (sp *spReader) issue(row *Row, t obj) {
	kind := t.str("issueType")
	if kind == "" {
		return
	}
	link := t.str("issueLink", "issueUrl")
	if link == "" && strings.EqualFold(kind, "GITHUB") {
		for _, p := range sp.providers {
			if p.str("id") != t.str("issueProviderId") {
				continue
			}
			repo := asObj(p["pluginConfig"]).str("repo")
			if repo == "" {
				repo = p.str("repo", "githubRepo")
			}
			if repo != "" && t.str("issueId") != "" {
				link = "https://github.com/" + repo + "/issues/" + t.str("issueId")
			}
		}
	}
	if o, ok := origin.Recognize(link); ok {
		row.Origin = &o
		return
	}
	if origin.ValidURL(link) && row.Origin != nil {
		// Another tracker: the import origin keeps the issue's address.
		o := *row.Origin
		o.URL = link
		if o.Validate() == nil {
			row.Origin = &o
			return
		}
	}
	row.warn("link to the %s issue dropped (the backup does not say where it is)", strings.ToLower(kind))
}
