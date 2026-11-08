package caldav

import (
	"bytes"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	"github.com/OpenTodoApp/opentodo/internal/sector"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// Errors returned by Decode besides ErrInvalid (unparseable data).
var (
	// ErrUnsupportedComponent: the object holds a VJOURNAL or VFREEBUSY
	// instead of a VTODO or a VEVENT (CALDAV:supported-calendar-component).
	ErrUnsupportedComponent = errors.New("only VTODO and VEVENT components are supported")
	// ErrInvalidObject: no UID, several UIDs, no VTODO or VEVENT at all, or
	// both kinds in one object (CALDAV:valid-calendar-object-resource).
	ErrInvalidObject = errors.New("invalid calendar object resource")
	// ErrInvalidValue: a property the mapping consumes has a value outside
	// what the task field accepts, e.g. an ESTIMATED-DURATION beyond one week
	// (CALDAV:valid-calendar-data, 403).
	ErrInvalidValue = errors.New("invalid calendar data value")
)

// Due mirrors the task due value: a floating date, a floating date and time, or
// a wall time in a named IANA zone (absolute-datetimes).
type Due struct {
	Date string  `json:"date"`
	Time *string `json:"time,omitempty"`
	TZ   *string `json:"tz,omitempty"`
}

// ProdID identifies the server in generated objects.
const ProdID = "-//OpenTodo//CalDAV//EN"

// Task is the outbound view of a task: everything one VTODO carries.
type Task struct {
	UID         string
	Title       string
	Description string
	Priority    int // app priority 1..4
	Due         *Due
	Deadline    string // "YYYY-MM-DD" or "" (OpenSpec change deadlines)
	Start       string // "someday", "YYYY-MM-DD" or "" (OpenSpec change someday-and-evening)
	Evening     bool
	// Span draws the task from Start to its due date (OpenSpec change
	// multi-day-tasks), served as X-OPENTODO-SPAN:TRUE; false serves nothing.
	Span bool
	// DayPart is "morning" or "afternoon" (OpenSpec change day-parts), served
	// as X-OPENTODO-DAY-PART; Evening stays X-OPENTODO-EVENING only.
	DayPart string
	// Energy is "deep", "medium" or "low" (OpenSpec change task-energy),
	// served as X-OPENTODO-ENERGY; empty serves nothing.
	Energy string
	// Sector is the time sector (OpenSpec change time-sectors), served as
	// X-OPENTODO-SECTOR; empty serves nothing.
	Sector     string
	Categories []string
	ParentUID  string
	// DependsOn are the UIDs of the task's blockers in the same calendar
	// (OpenSpec change task-dependencies, design D10).
	DependsOn   []string
	CreatedAt   int64
	CompletedAt *int64
	Recurrence  string // canonical rule or ""
	Extra       string // ical_extra: unmapped content lines, unfolded, CRLF separated
	Modified    int64  // greatest field timestamp: LAST-MODIFIED and DTSTAMP
	// EstimateMinutes is served as ESTIMATED-DURATION when positive, and
	// Reminders as VALARMs (OpenSpec change caldav-interop).
	EstimateMinutes int
	Reminders       []Reminder
	// Exceptions of a series (OpenSpec change series-exceptions, design D10):
	// ExDates are its exception dates from the current occurrence on, served
	// as one EXDATE; Until, when set, replaces a `for N times` COUNT with the
	// date of the last remaining occurrence. SiblingUID is the series' UID on
	// an open occurrence record (RELATED-TO;RELTYPE=SIBLING).
	ExDates    []string
	Until      string
	SiblingUID string
}

// DateShape is the shape of an inbound VTODO's date properties (OpenSpec
// change caldav-interop, "Inbound date shapes"); the caller decides what each
// shape writes, from the task's current state.
type DateShape int

const (
	// ShapeNone: neither DTSTART nor DUE, no duration.
	ShapeNone DateShape = iota
	// ShapeDueOnly: DUE without DTSTART.
	ShapeDueOnly
	// ShapeStartDueEqual: DTSTART and DUE that are the same value.
	ShapeStartDueEqual
	// ShapeStartDue: DTSTART and DUE that differ (the due date and the deadline).
	ShapeStartDue
	// ShapeStartDuration: DTSTART and a duration (ESTIMATED-DURATION or
	// DURATION) without DUE: a scheduled time.
	ShapeStartDuration
	// ShapeStartAlone: DTSTART without DUE and without a duration (client data).
	ShapeStartAlone
)

// Inbound is what a client's VTODO says about the mapped fields.
type Inbound struct {
	UID         string
	Title       string
	Description string
	Priority    int // app priority 1..4
	Due         *Due
	// Deadline is the date of DUE when the client sent a DTSTART that differs
	// from it (design D6); then Due is the DTSTART. With ShapeStartDuration Due
	// is the DTSTART. Shape tells the caller which row of the inbound date
	// table applies (a DUE alone is the deadline on a task that has one).
	Deadline string
	Shape    DateShape
	// SentDue is the DUE as the client sent it, whatever the shape made of it
	// (nil without DUE): the caller tells an echo of the served DUE from a
	// deadline the client set (caldav-interop, "Echoed DUE").
	SentDue *Due
	// EstimateMinutes is ESTIMATED-DURATION in whole minutes (nil when the
	// client did not send it); HasDuration reports ESTIMATED-DURATION or
	// DURATION, which makes a DTSTART without DUE a scheduled time.
	EstimateMinutes *int
	HasDuration     bool
	// Alarms are the VTODO's VALARMs; ServedAlarms is the X-OPENTODO-ALARMS
	// count this server served and the client echoed (nil when absent).
	Alarms       []Alarm
	ServedAlarms *int
	// Start and Evening come from X-OPENTODO-START and X-OPENTODO-EVENING
	// (someday-and-evening D7); nil means the client did not send the property,
	// which leaves the field alone.
	Start   *string
	Evening *bool
	// Sector comes from X-OPENTODO-SECTOR (time-sectors): a valid period, else
	// nil, which leaves the sector alone (a client without the property never
	// clears it).
	Sector *string
	// Span comes from X-OPENTODO-SPAN (multi-day-tasks D7): TRUE or FALSE;
	// nil when the client did not send a known value.
	Span *bool
	// DayPart comes from X-OPENTODO-DAY-PART (day-parts): "morning" or
	// "afternoon"; nil when the client did not send a known value.
	DayPart *string
	// Energy comes from X-OPENTODO-ENERGY (task-energy): a known level, else
	// nil. EnergySent is true when the property was there at all, so a VTODO
	// without it can clear a served energy while an unknown value leaves it.
	Energy      *string
	EnergySent  bool
	Completed   bool
	CompletedAt *int64 // the COMPLETED time when the client sent one
	Categories  []string
	ParentUID   string
	// DependsOn are the UIDs of RELATED-TO;RELTYPE=DEPENDS-ON lines (task-dependencies D10).
	DependsOn []string
	CreatedAt *int64
	// RRULE is the raw rule value ("" when none). Rule is its canonical
	// OpenTodo form, or "" when the grammar cannot express it; then the RRULE
	// line is part of Extra and the task keeps no rule of its own.
	RRULE string
	Rule  string
	Extra string
	// Overrides are the RECURRENCE-ID overrides the client sent beside the
	// series (Thunderbird completes one occurrence of a repeating task that
	// way); ExDates are the dates of its EXDATE lines and HasExDate reports
	// that it sent one at all (OpenSpec change series-exceptions, design D10).
	// The caller turns them into occurrence records; neither is stored.
	Overrides []Override
	ExDates   []string
	HasExDate bool
}

// CompletedOccurrences are the dates of the overrides the client sent completed.
func (in *Inbound) CompletedOccurrences() []string {
	var out []string
	for _, o := range in.Overrides {
		if o.Completed {
			out = append(out, o.Date)
		}
	}
	return out
}

// AppToICalPriority is the outbound priority table (design D3): 1→1, 2→5, 3→9,
// 4 (none)→0.
func AppToICalPriority(p int) int {
	switch p {
	case 1:
		return 1
	case 2:
		return 5
	case 3:
		return 9
	}
	return 0
}

// ICalToAppPriority is the inbound table: 1–3→1, 4–6→2, 7–9→3, 0 or anything
// else→4.
func ICalToAppPriority(p int) int {
	switch {
	case p >= 1 && p <= 3:
		return 1
	case p >= 4 && p <= 6:
		return 2
	case p >= 7 && p <= 9:
		return 3
	}
	return 4
}

func utcStamp(ms int64) string { return time.UnixMilli(ms).UTC().Format("20060102T150405Z") }

func dateValue(d string) string { return strings.ReplaceAll(d, "-", "") }

func clockValue(c string) string { return strings.ReplaceAll(c, ":", "") + "00" }

// dueProp renders a due value as a property with the given name (DUE or DTSTART).
func dueProp(name string, d *Due) Prop {
	switch {
	case d.Time == nil:
		return Prop{Name: name, Params: []Param{{Name: "VALUE", Values: []string{"DATE"}}}, Value: dateValue(d.Date)}
	case isUTC(d):
		return Prop{Name: name, Value: dateValue(d.Date) + "T" + clockValue(*d.Time) + "Z"}
	case d.TZ != nil:
		return Prop{Name: name, Params: []Param{{Name: "TZID", Values: []string{*d.TZ}}}, Value: dateValue(d.Date) + "T" + clockValue(*d.Time)}
	}
	return Prop{Name: name, Value: dateValue(d.Date) + "T" + clockValue(*d.Time)}
}

// isUTC reports a due time in UTC, written as a UTC date-time (`…Z`).
func isUTC(d *Due) bool { return d.Time != nil && d.TZ != nil && *d.TZ == "UTC" }

// servedDue is the due a VTODO carries (issue #1028). A zoned due time on a
// task that does not repeat is one instant: it is served as that instant in
// UTC (RFC 5545 §3.3.5, form #2), which every client reads without a
// VTIMEZONE; Apple Reminders showed a TZID time with this server's time zone
// definition in a "GMT" zone of its own, an hour off in summer. A repeating
// task keeps its TZID, since its occurrences follow the zone's daylight saving
// time (§3.8.5.3). Reading back, Inbound.KeepZone puts the UTC time in the
// task's zone again.
func servedDue(t Task) *Due {
	d := t.Due
	if d == nil || d.Time == nil || d.TZ == nil || t.Recurrence != "" || isUTC(d) {
		return d
	}
	loc, err := zoned.Load(*d.TZ)
	if err != nil {
		return d
	}
	at, err := zoned.Instant(d.Date, *d.Time, loc)
	if err != nil {
		return d
	}
	date, clock := zoned.Local(at, time.UTC)
	utc := "UTC"
	return &Due{Date: date, Time: &clock, TZ: &utc}
}

// Encode renders a task as a complete VCALENDAR object.
func Encode(t Task) []byte {
	cal := &Component{Name: "VCALENDAR", Props: []Prop{
		{Name: "VERSION", Value: "2.0"},
		{Name: "PRODID", Value: ProdID},
		{Name: "CALSCALE", Value: "GREGORIAN"},
	}}
	due := servedDue(t)
	// The zone's definition precedes the VTODO that names it.
	if due != nil && due.TZ != nil && due.Time != nil && !isUTC(due) {
		if tz := vtimezone(*due.TZ, due.Date, *due.Time); tz != nil {
			cal.Children = append(cal.Children, tz)
		}
	}
	todo := &Component{Name: "VTODO"}
	add := func(name, value string) { todo.Props = append(todo.Props, Prop{Name: name, Value: value}) }
	add("UID", EscapeText(t.UID))
	stamp := t.Modified
	if stamp <= 0 {
		stamp = t.CreatedAt
	}
	add("DTSTAMP", utcStamp(stamp))
	if t.CreatedAt > 0 {
		add("CREATED", utcStamp(t.CreatedAt))
	}
	add("LAST-MODIFIED", utcStamp(stamp))
	add("SUMMARY", EscapeText(t.Title))
	if t.Description != "" {
		add("DESCRIPTION", EscapeText(t.Description))
	}
	extra := extraLines(t.Extra)
	if t.Deadline != "" {
		// With a deadline, DUE is the deadline (a date) and DTSTART the planned
		// day (OpenSpec change deadlines, design D6).
		todo.Props = append(todo.Props, Prop{Name: "DUE", Params: []Param{{Name: "VALUE", Values: []string{"DATE"}}}, Value: dateValue(t.Deadline)})
		if due != nil {
			todo.Props = append(todo.Props, dueProp("DTSTART", due))
			extra = dropTopLevel(extra, "DTSTART")
		}
	} else if due != nil {
		todo.Props = append(todo.Props, dueProp("DUE", due))
		switch {
		case due.Time != nil:
			// A due time is a scheduled moment: clients that schedule by DTSTART
			// (Mitra, issue #248) only see it as such with DTSTART = DUE. The
			// server's own start replaces any copy a client echoed into the remainder.
			todo.Props = append(todo.Props, dueProp("DTSTART", due))
			extra = dropTopLevel(extra, "DTSTART")
		case t.Recurrence != "" && !hasTopLevel(extra, "DTSTART"):
			// A recurring VTODO is anchored at DTSTART; restate the due date unless
			// the client keeps its own DTSTART in the preserved remainder.
			todo.Props = append(todo.Props, dueProp("DTSTART", due))
		}
	}
	if t.Recurrence != "" {
		if r, err := recurrence.Parse(t.Recurrence); err == nil {
			add("RRULE", r.RRULEUntil(t.Until))
		}
		// The series' exceptions are the server's (series-exceptions D10); an
		// EXDATE stays client data only beside a rule the server does not map.
		extra = dropTopLevel(extra, "EXDATE")
	}
	if len(t.ExDates) > 0 && due != nil {
		todo.Props = append(todo.Props, exdateProp(due, t.ExDates))
	}
	if t.EstimateMinutes > 0 {
		add("ESTIMATED-DURATION", DurationText(t.EstimateMinutes))
	}
	extra = dropTopLevel(extra, "ESTIMATED-DURATION", "X-OPENTODO-ALARMS")
	// How many alarms the client was shown: an echo tells the server the client
	// saw them, so a missing one was removed on purpose (design D3). Without
	// alarms there is nothing to remove, so nothing is served.
	if len(t.Reminders) > 0 {
		add("X-OPENTODO-ALARMS", strconv.Itoa(len(t.Reminders)))
	}
	// iCalendar has no deferral or evening bucket: OpenTodo's own properties.
	switch {
	case t.Start == "someday":
		add("X-OPENTODO-START", "SOMEDAY")
	case t.Start != "":
		add("X-OPENTODO-START", dateValue(t.Start))
	}
	if t.Span {
		add("X-OPENTODO-SPAN", "TRUE")
	}
	if sector.Valid(t.Sector) {
		add("X-OPENTODO-SECTOR", t.Sector)
	}
	if t.Evening {
		add("X-OPENTODO-EVENING", "TRUE")
	} else if t.DayPart == "morning" || t.DayPart == "afternoon" {
		add("X-OPENTODO-DAY-PART", strings.ToUpper(t.DayPart))
	}
	if t.Energy == "deep" || t.Energy == "medium" || t.Energy == "low" {
		add("X-OPENTODO-ENERGY", strings.ToUpper(t.Energy))
	}
	if p := AppToICalPriority(t.Priority); p != 0 {
		add("PRIORITY", strconv.Itoa(p))
	}
	completed := t.CompletedAt != nil
	if completed {
		add("STATUS", "COMPLETED")
		add("COMPLETED", utcStamp(*t.CompletedAt))
		add("PERCENT-COMPLETE", "100")
		extra = dropTopLevel(extra, "STATUS", "COMPLETED", "PERCENT-COMPLETE")
	} else if !hasTopLevel(extra, "STATUS") {
		add("STATUS", "NEEDS-ACTION")
	}
	if len(t.Categories) > 0 {
		esc := make([]string, len(t.Categories))
		for i, c := range t.Categories {
			esc[i] = EscapeText(c)
		}
		add("CATEGORIES", strings.Join(esc, ","))
	}
	if t.ParentUID != "" {
		add("RELATED-TO", EscapeText(t.ParentUID))
	}
	if t.SiblingUID != "" {
		// The series of an occurrence record (series-exceptions D10); the copy
		// a client echoed into the remainder is this one, not client data.
		sibling := Prop{Name: "RELATED-TO", Params: []Param{{Name: "RELTYPE", Values: []string{"SIBLING"}}}, Value: EscapeText(t.SiblingUID)}
		extra = slices.DeleteFunc(extra, func(l string) bool { return l == sibling.Line() })
		todo.Props = append(todo.Props, sibling)
	}
	for _, uid := range t.DependsOn {
		todo.Props = append(todo.Props, Prop{Name: "RELATED-TO", Params: []Param{{Name: "RELTYPE", Values: []string{"DEPENDS-ON"}}}, Value: EscapeText(uid)})
	}
	lines := cal.Lines()
	lines = lines[:len(lines)-1] // reopen VCALENDAR to append the VTODO
	todoLines := todo.Lines()
	todoLines = todoLines[:len(todoLines)-1]
	lines = append(lines, todoLines...)
	for _, r := range t.Reminders {
		alarm := alarmComponent(r, t.Title, t.Deadline != "").Lines()
		lines = append(lines, alarm...)
	}
	lines = append(lines, extra...)
	lines = append(lines, "END:VTODO", "END:VCALENDAR")
	var b bytes.Buffer
	for _, l := range lines {
		writeFolded(&b, l)
	}
	return b.Bytes()
}

// extraLines splits the stored remainder into content lines.
func extraLines(extra string) []string {
	if extra == "" {
		return nil
	}
	var out []string
	for _, l := range strings.Split(strings.ReplaceAll(extra, "\r\n", "\n"), "\n") {
		if l != "" {
			out = append(out, l)
		}
	}
	return out
}

// hasTopLevel reports whether a property of the given name appears outside any
// nested component (VALARM) of the remainder.
func hasTopLevel(lines []string, name string) bool {
	depth := 0
	for _, l := range lines {
		n := lineName(l)
		switch {
		case n == "BEGIN":
			depth++
		case n == "END":
			depth--
		case depth == 0 && n == name:
			return true
		}
	}
	return false
}

func dropTopLevel(lines []string, names ...string) []string {
	depth := 0
	out := lines[:0:0]
	for _, l := range lines {
		n := lineName(l)
		switch n {
		case "BEGIN":
			depth++
		case "END":
			depth--
		}
		drop := false
		if depth == 0 && n != "END" {
			for _, x := range names {
				if n == x {
					drop = true
				}
			}
		}
		if !drop {
			out = append(out, l)
		}
	}
	return out
}

func lineName(l string) string {
	i := strings.IndexAny(l, ";:")
	if i < 0 {
		return strings.ToUpper(l)
	}
	return strings.ToUpper(l[:i])
}
