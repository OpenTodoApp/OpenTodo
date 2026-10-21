package importer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/recurrence"
)

// Microsoft To Do has no export of its own (OpenSpec change more-importers, D1):
// this profile reads the Microsoft Graph To Do shape the switch guide's PowerShell
// script writes, an array (or a `value` array) of todoTaskList objects with their
// tasks. Graph names time zones by their Windows id; windowszones.go maps them.

const msTodoFormat = "microsoft-todo-json"

type msTodoProfile struct{}

func (msTodoProfile) Name() string { return msTodoFormat }
func (msTodoProfile) Description() string {
	return "Microsoft To Do: the JSON the switch guide's script writes"
}

// msTodoLists returns the lists of a document: a top-level array, or the
// `value` (or `lists`) array of an object.
func msTodoLists(v any) []any {
	if l, ok := v.([]any); ok {
		return l
	}
	o := asObj(v)
	if o == nil {
		return nil
	}
	if l := asList(o["value"]); l != nil {
		return l
	}
	return asList(o["lists"])
}

func (msTodoProfile) Detect(data []byte) bool {
	data = bytes.TrimSpace(data)
	if len(data) == 0 || (data[0] != '[' && data[0] != '{') {
		return false
	}
	var v any
	if json.Unmarshal(data, &v) != nil {
		return false
	}
	for _, l := range msTodoLists(v) {
		lo := asObj(l)
		if lo == nil {
			continue
		}
		if _, ok := lo["wellknownListName"]; ok {
			return true
		}
		for _, t := range asList(lo["tasks"]) {
			to := asObj(t)
			if _, ok := to["importance"]; ok {
				_, due := to["dueDateTime"]
				_, reminder := to["isReminderOn"] // Graph always writes it
				if due || reminder {
					return true
				}
			}
		}
	}
	return false
}

// graphTime reads a Graph dateTimeTimeZone object ({dateTime, timeZone}) as an
// instant; the zone is a Windows id, an IANA name or UTC.
func graphTime(v any) (time.Time, bool, error) {
	o := asObj(v)
	if o == nil {
		return time.Time{}, false, nil
	}
	s := o.str("dateTime")
	if s == "" {
		return time.Time{}, false, nil
	}
	zone := o.str("timeZone")
	loc, err := graphZone(zone)
	if err != nil {
		return time.Time{}, true, err
	}
	for _, l := range []string{"2006-01-02T15:04:05.9999999", "2006-01-02T15:04:05", "2006-01-02T15:04"} {
		if t, err := time.ParseInLocation(l, s, loc); err == nil {
			return t, true, nil
		}
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t, true, nil
	}
	return time.Time{}, true, fmt.Errorf("date-time %q not understood", s)
}

func graphZone(zone string) (*time.Location, error) {
	if zone == "" || strings.EqualFold(zone, "UTC") || strings.EqualFold(zone, "tzone://Microsoft/Utc") {
		return time.UTC, nil
	}
	name := zone
	if iana, ok := windowsZones[zone]; ok {
		name = iana
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return nil, fmt.Errorf("time zone %q not recognised", zone)
	}
	return loc, nil
}

var (
	htmlBreak = regexp.MustCompile(`(?i)<\s*(br|/p|/div|/li)\s*/?>`)
	htmlTag   = regexp.MustCompile(`<[^>]*>`)
	blankRuns = regexp.MustCompile(`\n{3,}`)
)

// htmlToText turns an HTML body into plain text: breaks become new lines, tags
// go, entities are decoded.
func htmlToText(s string) string {
	s = htmlBreak.ReplaceAllString(s, "\n")
	s = htmlTag.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	lines := strings.Split(strings.ReplaceAll(s, "\r", ""), "\n")
	for i := range lines {
		lines[i] = strings.TrimSpace(lines[i])
	}
	return strings.TrimSpace(blankRuns.ReplaceAllString(strings.Join(lines, "\n"), "\n\n"))
}

func (msTodoProfile) Read(r io.Reader, opts Options) (*Parsed, error) {
	v, err := decodeJSON(r)
	if err != nil {
		return nil, err
	}
	lists := msTodoLists(v)
	if lists == nil {
		return nil, &FileError{"expected an array of To Do lists"}
	}
	out := &Parsed{}
	loc := opts.Location()
	n := 0
	for li, l := range lists {
		lo := asObj(l)
		if lo == nil {
			out.Rows = append(out.Rows, Row{Line: li + 1, Kind: KindProject, Err: fmt.Sprintf("list #%d is not an object", li+1)})
			continue
		}
		name := lo.str("displayName")
		projSource := ""
		switch lo.str("wellknownListName") {
		case "defaultList":
			out.Notes = append(out.Notes, fmt.Sprintf("the list %q is your default list; its tasks go to the target project (the Inbox unless you choose one)", firstNonEmpty(name, "Tasks")))
		case "flaggedEmails":
			name = "Flagged emails"
			fallthrough
		default:
			projSource = "microsoft-todo:list:" + firstNonEmpty(lo.str("id"), fmt.Sprintf("#%d", li+1))
			prow := Row{Line: li + 1, Kind: KindProject, SourceID: projSource, Title: name}
			if name == "" {
				prow.fail("list #%d has no name", li+1)
			}
			out.Rows = append(out.Rows, prow)
		}
		for ti, t := range asList(lo["tasks"]) {
			n++
			o := asObj(t)
			row := Row{Line: n, Kind: KindTask, ProjectSourceID: projSource}
			if o == nil {
				row.fail("list %q, task %d is not an object", name, ti+1)
				out.Rows = append(out.Rows, row)
				continue
			}
			row.SourceID = "microsoft-todo:" + firstNonEmpty(o.str("id"), fmt.Sprintf("line:%d", n))
			row.Origin = importedOrigin("microsoft-todo", row.SourceID)
			row.Title = o.str("title")
			if row.Title == "" {
				row.fail("title is required (list %q, task %d)", firstNonEmpty(name, "untitled"), ti+1)
			}
			msTodoTask(&row, o, loc)
			out.Rows = append(out.Rows, row)
			for ci, c := range asList(o["checklistItems"]) {
				co := asObj(c)
				if co == nil {
					continue
				}
				n++
				sub := Row{Line: n, Kind: KindTask, ProjectSourceID: projSource, ParentSourceID: row.SourceID,
					SourceID: "microsoft-todo:check:" + firstNonEmpty(co.str("id"), fmt.Sprintf("%s:%d", o.str("id"), ci)),
					Title:    co.str("displayName"), Completed: co.boolean("isChecked")}
				if sub.Title == "" {
					sub.fail("checklist item %d of %q has no name", ci+1, row.Title)
				}
				if at, err := parseTimestamp(co.str("checkedDateTime"), loc); err == nil && sub.Completed {
					sub.CompletedAt = at
				}
				out.Rows = append(out.Rows, sub)
			}
			if len(out.Rows) > MaxRows {
				return nil, ErrTooManyRows
			}
		}
	}
	return out, nil
}

// msTodoTask reads a todoTask's attributes into row.
func msTodoTask(row *Row, o obj, loc *time.Location) {
	if body := asObj(o["body"]); body != nil {
		content := body.str("content")
		if strings.EqualFold(body.str("contentType"), "html") {
			content = htmlToText(content)
		}
		row.Description = strings.TrimSpace(content)
	}
	switch strings.ToLower(o.str("importance")) {
	case "high":
		row.Priority = 1
	case "normal", "low", "":
		row.Priority = 4
	default:
		row.warn("importance %q not recognised; imported as p4", o.str("importance"))
	}
	if strings.EqualFold(o.str("status"), "completed") {
		row.Completed = true
		if t, ok, err := graphTime(o["completedDateTime"]); ok && err == nil {
			row.CompletedAt = t.UnixMilli()
		}
	}
	if at, err := parseTimestamp(o.str("createdDateTime"), loc); err == nil {
		row.CreatedAt = at
	}
	row.Labels = dedupeNames(o.names("categories"))
	// Graph writes due and start dates as midnight in the zone it names: the date
	// part is the day, whatever the import's zone.
	if d := asObj(o["dueDateTime"]); d != nil {
		if s := d.str("dateTime"); len(s) >= 10 && validDate(s[:10]) {
			row.Due = &Due{Date: s[:10]}
		} else {
			row.warn("due date %q not understood; imported without a due date", s)
		}
	}
	if d := asObj(o["startDateTime"]); d != nil {
		if s := d.str("dateTime"); len(s) >= 10 && validDate(s[:10]) {
			row.Start = s[:10]
		}
	}
	if o.boolean("isReminderOn") {
		t, ok, err := graphTime(o["reminderDateTime"])
		switch {
		case err != nil:
			row.warn("reminder dropped (%v)", err)
		case ok:
			row.Reminders = append(row.Reminders, Reminder{Absolute: true, At: t.UnixMilli()})
		}
	}
	if rec := asObj(o["recurrence"]); rec != nil {
		rule, err := msTodoRecurrence(asObj(rec["pattern"]))
		if err != nil {
			row.warn("recurrence %s not supported; imported without a rule", err)
		} else {
			row.Recurrence = rule
		}
		if rng := asObj(rec["range"]); rng != nil {
			switch rng.str("type") {
			case "endDate", "numbered":
				row.warn("recurrence end dropped (rules repeat without an end)")
			}
		}
	}
	links := asList(o["linkedResources"])
	for _, lr := range links {
		lo := asObj(lr)
		if lo == nil || lo.str("webUrl") == "" {
			continue
		}
		row.addLink(firstNonEmpty(lo.str("displayName"), lo.str("applicationName")), lo.str("webUrl"))
	}
	if len(row.Links) == 1 && row.Origin != nil {
		withURL := *row.Origin
		withURL.URL = row.Links[0].URL
		if withURL.Validate() == nil {
			row.Origin = &withURL
		}
	}
	if o.boolean("hasAttachments") || len(asList(o["attachments"])) > 0 {
		row.warn("file attachments dropped (they are not in the file; only links are imported)")
	}
}

// msTodoRecurrence maps a Graph recurrencePattern onto the rule grammar where it
// can say the same thing: daily, weekly (on days), monthly on a day, yearly.
func msTodoRecurrence(p obj) (string, error) {
	if p == nil {
		return "", fmt.Errorf("(no pattern)")
	}
	interval := 1
	if s := p.str("interval"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			interval = n
		}
	}
	every := func(unit string) string {
		if interval == 1 {
			return "every " + unit
		}
		return fmt.Sprintf("every %d %ss", interval, unit)
	}
	var text string
	switch strings.ToLower(p.str("type")) {
	case "daily":
		text = every("day")
	case "weekly":
		days := p.names("daysOfWeek")
		switch {
		case interval == 1 && len(days) > 0:
			text = "every " + strings.ToLower(strings.Join(days, ", "))
		case len(days) <= 1:
			text = every("week")
		}
	case "absolutemonthly":
		day, _ := strconv.Atoi(p.str("dayOfMonth"))
		switch {
		case interval == 1 && day >= 1 && day <= 31:
			text = fmt.Sprintf("every %d%s", day, ordinal(day))
		default:
			text = every("month")
		}
	case "absoluteyearly":
		text = every("year")
	}
	if text == "" {
		b, _ := json.Marshal(p)
		return "", fmt.Errorf("%s", b)
	}
	rule, err := recurrence.Canonicalize(text)
	if err != nil {
		b, _ := json.Marshal(p)
		return "", fmt.Errorf("%s", b)
	}
	return rule, nil
}

func ordinal(n int) string {
	if n%100 >= 11 && n%100 <= 13 {
		return "th"
	}
	switch n % 10 {
	case 1:
		return "st"
	case 2:
		return "nd"
	case 3:
		return "rd"
	}
	return "th"
}
