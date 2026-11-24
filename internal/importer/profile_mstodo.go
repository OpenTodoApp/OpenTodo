package importer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// Microsoft To Do has no export of its own (OpenSpec change more-importers, D1):
// this profile reads the Microsoft Graph To Do shape the switch guide's PowerShell
// script writes, an array (or a `value` array) of todoTaskList objects with their
// tasks. Graph names time zones by their Windows id; zoned.WindowsZone maps them.

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

// graphDay reads a due or start dateTimeTimeZone as a floating date. To Do
// stores the local midnight of the chosen day and Graph returns it converted,
// usually to UTC: 15 April at UTC+2 comes back as 2023-04-14T22:00 UTC. A
// midnight in a named zone other than UTC is that local day as it is. Anything
// else is converted to the import's zone and, since it is a midnight somewhere,
// rounded to the nearest midnight there: exact when the import's zone is the
// account's, and right for any zone within 12 hours of it. A zone the server
// does not know falls back to the written date.
func graphDay(d obj, loc *time.Location) (string, bool) {
	t, ok, err := graphTime(map[string]any(d))
	if err != nil || !ok {
		if s := d.str("dateTime"); len(s) >= 10 && validDate(s[:10]) {
			return s[:10], true
		}
		return "", false
	}
	if t.Location() != time.UTC && t.Hour() == 0 && t.Minute() == 0 && t.Second() == 0 {
		return t.Format("2006-01-02"), true
	}
	t = t.In(loc)
	if t.Hour() >= 12 {
		t = t.AddDate(0, 0, 1)
	}
	return t.Format("2006-01-02"), true
}

func graphZone(zone string) (*time.Location, error) {
	if zone == "" || strings.EqualFold(zone, "UTC") || strings.EqualFold(zone, "tzone://Microsoft/Utc") {
		return time.UTC, nil
	}
	name := zone
	if iana, ok := zoned.WindowsZone(zone); ok {
		name = iana
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return nil, fmt.Errorf("time zone %q not recognised", zone)
	}
	return loc, nil
}

var (
	htmlComment = regexp.MustCompile(`(?s)<!--.*?(?:-->|$)`)
	htmlHidden  = []*regexp.Regexp{
		regexp.MustCompile(`(?is)<\s*head\b.*?(?:<\s*/\s*head\s*>|$)`),
		regexp.MustCompile(`(?is)<\s*style\b.*?(?:<\s*/\s*style\s*>|$)`),
		regexp.MustCompile(`(?is)<\s*script\b.*?(?:<\s*/\s*script\s*>|$)`),
		regexp.MustCompile(`(?is)<\s*template\b.*?(?:<\s*/\s*template\s*>|$)`),
	}
	htmlItem  = regexp.MustCompile(`(?i)<\s*li\b[^>]*>`)
	htmlBreak = regexp.MustCompile(`(?i)<\s*(br|/p|/div|/ul|/ol|/h[1-6]|/tr)\s*/?>`)
	htmlTag   = regexp.MustCompile(`<[^>]*>`)
	blankRuns = regexp.MustCompile(`\n{3,}`)
)

// htmlToText turns an HTML body (Outlook writes a whole document, with a head
// and a style block) into plain text: comments and the head, style, script and
// template elements go with their content, list items become "- " lines,
// breaks become new lines, every other tag goes and entities are decoded last.
// The result is only ever stored and shown as text, never as HTML.
func htmlToText(s string) string {
	s = htmlComment.ReplaceAllString(s, "")
	for _, re := range htmlHidden {
		s = re.ReplaceAllString(s, "")
	}
	s = htmlItem.ReplaceAllString(s, "\n- ")
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
		if lo.boolean("isShared") {
			out.Notes = append(out.Notes, fmt.Sprintf("the list %q is shared in To Do; it is imported as your own project, which you can share again", firstNonEmpty(name, "Tasks")))
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
				if at, err := parseTimestamp(co.str("createdDateTime"), loc); err == nil {
					sub.CreatedAt = at
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
	// To Do shows two states; Outlook's other task statuses (inProgress,
	// waitingOnOthers, deferred) are open tasks too.
	switch status := o.str("status"); strings.ToLower(status) {
	case "completed":
		row.Completed = true
		if t, ok, err := graphTime(o["completedDateTime"]); ok && err == nil {
			row.CompletedAt = t.UnixMilli()
		}
	case "", "notstarted", "inprogress", "waitingonothers", "deferred":
	default:
		row.warn("status %q not recognised; imported as an open task", status)
	}
	if at, err := parseTimestamp(o.str("createdDateTime"), loc); err == nil {
		row.CreatedAt = at
	}
	row.Labels = dedupeNames(o.names("categories"))
	if d := asObj(o["dueDateTime"]); d != nil {
		if day, ok := graphDay(d, loc); ok {
			row.Due = &Due{Date: day}
		} else {
			row.warn("due date %q not understood; imported without a due date", d.str("dateTime"))
		}
	}
	if d := asObj(o["startDateTime"]); d != nil {
		if day, ok := graphDay(d, loc); ok {
			row.Start = day
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
	// A completed task is a past occurrence: To Do moved the repeat to the open
	// task it created when this one was completed.
	if rec := asObj(o["recurrence"]); rec != nil && !row.Completed {
		due := ""
		if row.Due != nil {
			due = row.Due.Date
		}
		rule, endDropped, err := msTodoRecurrence(asObj(rec["pattern"]), asObj(rec["range"]), due)
		switch {
		case err != nil:
			row.warn("recurrence %s not supported; imported without a rule", err)
		default:
			row.Recurrence = rule
			if endDropped {
				row.warn("recurrence end dropped (the rule cannot say it)")
			}
		}
	}
	links := asList(o["linkedResources"])
	for _, lr := range links {
		lo := asObj(lr)
		if lo == nil {
			continue
		}
		if lo.str("webUrl") == "" {
			// webUrl is optional: a resource known only by its app's externalId
			// has no address to open.
			row.warn("linked resource %q dropped (it has no web address)", firstNonEmpty(lo.str("displayName"), firstNonEmpty(lo.str("applicationName"), lo.str("externalId"))))
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

// msTodoRecurrence maps a Graph patternedRecurrence onto the rule grammar by
// way of the iCalendar rule it stands for, so the grammar's own RRULE reader
// decides what it can say exactly: daily, weekly (on days), monthly on a day or
// on the nth weekday, yearly on a date or on the nth weekday of a month, each
// with its interval where the grammar has one, and the range's end date or
// count. due anchors patterns that only restate the due date. endDropped
// reports a rule kept without the range's end, which it could not say.
func msTodoRecurrence(p, rng obj, due string) (rule string, endDropped bool, err error) {
	unsupported := func() (string, bool, error) {
		b, _ := json.Marshal(p)
		return "", false, fmt.Errorf("%s", b)
	}
	if p == nil {
		return "", false, fmt.Errorf("(no pattern)")
	}
	var parts []string
	if n, err := strconv.Atoi(p.str("interval")); err == nil && n > 1 {
		parts = append(parts, "INTERVAL="+strconv.Itoa(n))
	}
	var days []string
	for _, d := range p.names("daysOfWeek") {
		code, ok := graphDays[strings.ToLower(d)]
		if !ok {
			return unsupported()
		}
		days = append(days, code)
	}
	index, ok := graphIndex[strings.ToLower(p.str("index"))]
	if !ok {
		index = "1" // Graph's default, "first"
	}
	month, _ := strconv.Atoi(p.str("month"))
	dayOfMonth, _ := strconv.Atoi(p.str("dayOfMonth"))
	// A relative pattern names one weekday (BYDAY=2TH), or Monday to Friday
	// for the nth weekday of the month (BYDAY=MO,…,FR;BYSETPOS=2).
	relative := func() (string, bool) {
		switch {
		case len(days) == 1:
			return "BYDAY=" + index + days[0], true
		case isWorkweek(days):
			return "BYDAY=" + strings.Join(days, ",") + ";BYSETPOS=" + index, true
		}
		return "", false
	}
	switch strings.ToLower(p.str("type")) {
	case "daily":
		parts = append(parts, "FREQ=DAILY")
	case "weekly":
		parts = append(parts, "FREQ=WEEKLY")
		if len(days) > 0 {
			// Graph counts the weeks of an interval from firstDayOfWeek, the
			// grammar from Monday: with Sunday among several days they differ.
			wkst := strings.ToLower(p.str("firstDayOfWeek"))
			if len(parts) > 1 && len(days) > 1 && wkst != "" && wkst != "monday" && slices.Contains(days, "SU") {
				return unsupported()
			}
			parts = append(parts, "BYDAY="+strings.Join(days, ","))
		}
	case "absolutemonthly":
		if dayOfMonth < 1 || dayOfMonth > 31 {
			return unsupported()
		}
		parts = append(parts, "FREQ=MONTHLY", "BYMONTHDAY="+strconv.Itoa(dayOfMonth))
	case "relativemonthly":
		by, ok := relative()
		if !ok {
			return unsupported()
		}
		parts = append(parts, "FREQ=MONTHLY", by)
	case "absoluteyearly":
		if month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31 {
			return unsupported()
		}
		parts = append(parts, "FREQ=YEARLY", "BYMONTH="+strconv.Itoa(month), "BYMONTHDAY="+strconv.Itoa(dayOfMonth))
	case "relativeyearly":
		by, ok := relative()
		if !ok || month < 1 || month > 12 {
			return unsupported()
		}
		parts = append(parts, "FREQ=YEARLY", "BYMONTH="+strconv.Itoa(month), by)
	default:
		return unsupported()
	}
	end := ""
	if rng != nil {
		switch strings.ToLower(rng.str("type")) {
		case "enddate":
			if d := rng.str("endDate"); validDate(d) {
				end = ";UNTIL=" + strings.ReplaceAll(d, "-", "")
			}
		case "numbered":
			if n, err := strconv.Atoi(rng.str("numberOfOccurrences")); err == nil && n > 0 {
				end = ";COUNT=" + strconv.Itoa(n)
			}
		}
	}
	base := strings.Join(parts, ";")
	if end != "" {
		if r, ok := recurrence.FromRRULE(base+end, due); ok {
			return r.Canonical(), false, nil
		}
	}
	r, ok := recurrence.FromRRULE(base, due)
	if !ok {
		return unsupported()
	}
	return r.Canonical(), end != "", nil
}

var graphDays = map[string]string{"monday": "MO", "tuesday": "TU", "wednesday": "WE", "thursday": "TH",
	"friday": "FR", "saturday": "SA", "sunday": "SU"}

var graphIndex = map[string]string{"first": "1", "second": "2", "third": "3", "fourth": "4", "last": "-1"}

// isWorkweek reports whether days are Monday to Friday, each once.
func isWorkweek(days []string) bool {
	if len(days) != 5 {
		return false
	}
	for _, d := range []string{"MO", "TU", "WE", "TH", "FR"} {
		if !slices.Contains(days, d) {
			return false
		}
	}
	return true
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
