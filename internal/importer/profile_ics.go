package importer

import (
	"bytes"
	"fmt"
	"io"
	"slices"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// iCalendar files of tasks (OpenSpec change ics-import): a Nextcloud Tasks,
// Thunderbird or Tasks.org export is one VCALENDAR of VTODOs. Each task is read
// with the CalDAV mapping (caldav.Decode, design D1), so a task reads the same
// whether it arrives over CalDAV or from the file. One file is one project,
// named after X-WR-CALNAME; without a name the tasks go to the target.

const icsFormat = "ics"

type icsProfile struct{}

func (icsProfile) Name() string { return icsFormat }
func (icsProfile) Description() string {
	return "iCalendar tasks (.ics): Nextcloud Tasks, Thunderbird and other CalDAV apps"
}

// Detect accepts a file that starts with BEGIN:VCALENDAR.
func (icsProfile) Detect(data []byte) bool {
	t := bytes.TrimLeft(trimBOM(data), " \t\r\n")
	const begin = "BEGIN:VCALENDAR"
	return len(t) >= len(begin) && strings.EqualFold(string(t[:len(begin)]), begin)
}

// icsComponent is one top-level component of the file, as unfolded lines.
type icsComponent struct {
	name     string
	lines    []string
	complete bool
}

// icsFile is what the lenient split reads (design D1).
type icsFile struct {
	calName    string
	timezones  []string // the lines of every VTIMEZONE
	todos      []*icsComponent
	skipped    map[string]int // other components by name
	calendars  int
	unbalanced bool
}

// lineHead returns the upper-cased property name of a content line and, for
// BEGIN and END, the upper-cased component name.
func lineHead(line string) (name, value string) {
	i := strings.IndexAny(line, ":;")
	if i < 0 {
		return strings.ToUpper(strings.TrimSpace(line)), ""
	}
	name = strings.ToUpper(strings.TrimSpace(line[:i]))
	if name == "BEGIN" || name == "END" {
		if j := strings.IndexByte(line, ':'); j >= 0 {
			value = strings.ToUpper(strings.TrimSpace(line[j+1:]))
		}
	}
	return name, value
}

// splitICS reads the unfolded lines of data into top-level components. It
// never fails on a component: one that is cut off is kept incomplete, and
// caldav.Decode reports whatever else is wrong with it.
func splitICS(data []byte) (*icsFile, error) {
	f := &icsFile{skipped: map[string]int{}}
	var cur *icsComponent
	depth, inCal := 0, false
	finish := func(complete bool) {
		cur.complete = complete
		switch cur.name {
		case "VTODO":
			f.todos = append(f.todos, cur)
		case "VTIMEZONE":
			if complete {
				f.timezones = append(f.timezones, cur.lines...)
			}
		default:
			f.skipped[cur.name]++
		}
		cur = nil
	}
	for _, line := range caldav.Unfold(data) {
		if strings.TrimSpace(line) == "" {
			continue
		}
		name, value := lineHead(line)
		if cur != nil {
			switch {
			case name == "BEGIN" && value == "VTODO" && cur.name == "VTODO":
				// A VTODO never nests: the one before was cut off.
				finish(false)
			case name == "END" && value == "VCALENDAR":
				finish(false)
				inCal = false
				continue
			default:
				cur.lines = append(cur.lines, line)
				if name == "BEGIN" {
					depth++
				} else if name == "END" {
					depth--
					if depth == 0 {
						finish(true)
					}
				}
				continue
			}
		}
		switch {
		case !inCal && name == "BEGIN" && value == "VCALENDAR":
			inCal = true
			f.calendars++
		case !inCal:
			if f.calendars == 0 {
				return nil, &FileError{"not an iCalendar file: it must start with BEGIN:VCALENDAR"}
			}
			// Text after the calendar is ignored; a second calendar is read.
		case name == "BEGIN":
			cur, depth = &icsComponent{name: value, lines: []string{line}}, 1
		case name == "END" && value == "VCALENDAR":
			inCal = false
		case name == "X-WR-CALNAME" && f.calName == "":
			if p, err := caldav.ParseLine(line); err == nil {
				f.calName = strings.TrimSpace(caldav.UnescapeText(p.Value))
			}
		}
	}
	if cur != nil {
		finish(false)
	}
	if f.calendars == 0 {
		return nil, &FileError{"not an iCalendar file: it must start with BEGIN:VCALENDAR"}
	}
	f.unbalanced = inCal
	return f, nil
}

// topProp returns the value of the first property called name directly in the
// component (not in a nested VALARM), or "".
func (c *icsComponent) topProp(name string) string {
	depth := 0
	for _, line := range c.lines {
		n, _ := lineHead(line)
		switch n {
		case "BEGIN":
			depth++
		case "END":
			depth--
		case name:
			if depth == 1 {
				if p, err := caldav.ParseLine(line); err == nil {
					return strings.TrimSpace(p.Value)
				}
			}
		}
	}
	return ""
}

// icsTask is the components of one UID: a master and its overrides.
type icsTask struct {
	uid   string
	parts []*icsComponent
}

func (icsProfile) Read(r io.Reader, opts Options) (*Parsed, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	f, err := splitICS(data)
	if err != nil {
		return nil, err
	}
	out := &Parsed{}
	if f.calendars > 1 {
		out.Notes = append(out.Notes, fmt.Sprintf("the file holds %d calendars; their tasks are imported together", f.calendars))
	}
	if f.unbalanced {
		out.Notes = append(out.Notes, "the file ends without END:VCALENDAR")
	}
	names := make([]string, 0, len(f.skipped))
	for name := range f.skipped {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		out.Notes = append(out.Notes, fmt.Sprintf("%d %s component(s) not imported (only tasks, VTODO, are)", f.skipped[name], name))
	}
	project := ""
	if f.calName != "" {
		project = "ics:calendar:" + strings.ToLower(f.calName)
		out.Rows = append(out.Rows, Row{Line: 0, Kind: KindProject, SourceID: project, Title: f.calName})
	}
	// Group the VTODOs by UID, in the order each UID first appears.
	var tasks []*icsTask
	byUID := map[string]*icsTask{}
	for _, c := range f.todos {
		uid := caldav.UnescapeText(c.topProp("UID"))
		if t, ok := byUID[uid]; ok && uid != "" && c.complete && t.parts[0].complete {
			t.parts = append(t.parts, c)
			continue
		}
		t := &icsTask{uid: uid, parts: []*icsComponent{c}}
		tasks = append(tasks, t)
		if uid != "" && c.complete {
			byUID[uid] = t
		}
	}
	if len(tasks) == 0 {
		out.Notes = append(out.Notes, "the file holds no tasks (VTODO components)")
	}
	tz := strings.Join(f.timezones, "\r\n")
	for i, t := range tasks {
		out.Rows = append(out.Rows, icsRow(t, i+1, tz, project, opts.Location()))
	}
	return out, nil
}

// icsRow reads one task with the CalDAV mapping.
func icsRow(t *icsTask, n int, timezones, project string, loc *time.Location) Row {
	master := t.parts[0]
	for _, c := range t.parts {
		if c.topProp("RECURRENCE-ID") == "" {
			master = c
			break
		}
	}
	row := Row{Line: n, Kind: KindTask, ProjectSourceID: project,
		Title: caldav.UnescapeText(master.topProp("SUMMARY"))}
	row.SourceID = fmt.Sprintf("ics:line:%d", n)
	if t.uid != "" {
		row.SourceID = "ics:" + t.uid
	}
	if !master.complete {
		row.fail("the task is cut off before END:VTODO")
		return row
	}
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//OpenTodo//Import//EN\r\n")
	if timezones != "" {
		b.WriteString(timezones + "\r\n")
	}
	for _, c := range t.parts {
		b.WriteString(strings.Join(c.lines, "\r\n") + "\r\n")
	}
	b.WriteString("END:VCALENDAR\r\n")
	in, err := caldav.Decode([]byte(b.String()))
	if err != nil {
		row.fail("%s", err.Error())
		return row
	}
	row.Title = strings.TrimSpace(in.Title)
	if row.Title == "" {
		row.fail("the task has no title (SUMMARY)")
		return row
	}
	row.Origin = importedOrigin(icsFormat, row.SourceID)
	row.Description = in.Description
	row.Priority = in.Priority
	row.Labels = dedupeNames(in.Categories)
	row.Completed = in.Completed
	if in.CompletedAt != nil {
		row.CompletedAt = *in.CompletedAt
	}
	if in.CreatedAt != nil {
		row.CreatedAt = *in.CreatedAt
	}
	if in.ParentUID != "" && in.ParentUID != t.uid {
		row.ParentSourceID = "ics:" + in.ParentUID
	}
	for _, uid := range in.DependsOn {
		row.BlockedBySourceIDs = append(row.BlockedBySourceIDs, "ics:"+uid)
	}
	if in.EstimateMinutes != nil {
		row.EstimateMinutes = *in.EstimateMinutes
	}
	icsDates(&row, in, master, loc)
	if in.Evening != nil {
		row.Evening = *in.Evening
	}
	if in.Energy != nil {
		row.Energy = *in.Energy
	}
	row.Recurrence = in.Rule
	if in.RRULE != "" && in.Rule == "" {
		row.warn("repeat rule %q cannot be imported", in.RRULE)
	}
	if in.HasExDate {
		row.warn("skipped occurrences (EXDATE) are not imported")
	}
	if len(in.Overrides) > 0 {
		row.warn("changes to single occurrences (RECURRENCE-ID) are not imported")
	}
	icsAlarms(&row, in, loc)
	return row
}

// icsDates maps the date shape Decode reports (design D2).
func icsDates(row *Row, in *caldav.Inbound, master *icsComponent, loc *time.Location) {
	row.Due = icsFloating(in.Due, loc)
	row.Deadline = in.Deadline
	switch {
	case in.Start != nil:
		row.Start = *in.Start
	case in.Shape == caldav.ShapeStartAlone:
		// CalDAV keeps a DTSTART alone as client data; here it is the start date.
		v := master.topProp("DTSTART")
		if len(v) >= 8 {
			if d, err := time.Parse("20060102", v[:8]); err == nil {
				row.Start = d.Format("2006-01-02")
			}
		}
	}
}

// icsFloating turns a CalDAV due value into a floating one: a zoned or UTC
// time becomes the wall time in loc.
func icsFloating(d *caldav.Due, loc *time.Location) *Due {
	if d == nil {
		return nil
	}
	if d.Time == nil {
		return &Due{Date: d.Date}
	}
	if d.TZ == nil {
		return &Due{Date: d.Date, Time: *d.Time}
	}
	at, ok := icsInstant(d, loc)
	if !ok {
		return &Due{Date: d.Date, Time: *d.Time}
	}
	date, clock := zoned.Local(time.UnixMilli(at), loc)
	return &Due{Date: date, Time: clock}
}

// icsInstant is the instant of a CalDAV due value; a floating value is read in
// loc, a date alone at midnight.
func icsInstant(d *caldav.Due, loc *time.Location) (int64, bool) {
	clock := "00:00"
	if d.Time != nil {
		clock = *d.Time
	}
	zone := loc
	if d.TZ != nil {
		l, err := zoned.Load(*d.TZ)
		if err != nil {
			return 0, false
		}
		zone = l
	}
	t, err := zoned.Instant(d.Date, clock, zone)
	if err != nil {
		return 0, false
	}
	return t.UnixMilli(), true
}

// icsAlarms maps the task's VALARMs onto reminders (design D3).
func icsAlarms(row *Row, in *caldav.Inbound, loc *time.Location) {
	startIsDue := in.Shape == caldav.ShapeStartDue || in.Shape == caldav.ShapeStartDueEqual || in.Shape == caldav.ShapeStartDuration
	dropped, mapped := 0, 0
	for _, a := range in.Alarms {
		if !a.Mappable || mapped >= caldav.MaxMappedAlarms {
			dropped++
			continue
		}
		switch {
		case a.At != nil:
			at, ok := icsInstant(a.At, loc)
			if !ok {
				dropped++
				continue
			}
			row.Reminders = append(row.Reminders, Reminder{Absolute: true, At: at})
		case a.Offset == nil:
			dropped++
			continue
		case a.Related == "START" && startIsDue, a.Related != "START" && in.Shape != caldav.ShapeStartDue && row.Due != nil:
			// Anchored on the task's due date.
			row.Reminders = append(row.Reminders, Reminder{Offset: *a.Offset})
		case a.Related != "START" && in.SentDue != nil:
			// Anchored on DUE, which is the deadline here: at its instant.
			at, ok := icsInstant(in.SentDue, loc)
			if !ok {
				dropped++
				continue
			}
			row.Reminders = append(row.Reminders, Reminder{Absolute: true, At: at + int64(*a.Offset)*60_000})
		default:
			dropped++
			continue
		}
		mapped++
	}
	if dropped > 0 {
		row.warn("%d alarm(s) dropped (only display alarms with one trigger on the task's dates are imported)", dropped)
	}
}
