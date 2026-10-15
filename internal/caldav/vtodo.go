package caldav

import (
	"bytes"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/recurrence"
	"github.com/pixari/opentodo/internal/zoned"
)

// Errors returned by Decode besides ErrInvalid (unparseable data).
var (
	// ErrUnsupportedComponent: the object holds a VEVENT or VJOURNAL instead of a
	// VTODO (CALDAV:supported-calendar-component).
	ErrUnsupportedComponent = errors.New("only VTODO components are supported")
	// ErrInvalidObject: no UID, several UIDs, or no VTODO at all
	// (CALDAV:valid-calendar-object-resource).
	ErrInvalidObject = errors.New("invalid calendar object resource")
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
	Categories  []string
	ParentUID   string
	CreatedAt   int64
	CompletedAt *int64
	Recurrence  string // canonical rule or ""
	Extra       string // ical_extra: unmapped content lines, unfolded, CRLF separated
	Modified    int64  // greatest field timestamp: LAST-MODIFIED and DTSTAMP
}

// Inbound is what a client's VTODO says about the mapped fields.
type Inbound struct {
	UID         string
	Title       string
	Description string
	Priority    int // app priority 1..4
	Due         *Due
	// Deadline is the date of DUE when the client sent a DTSTART that differs
	// from it (design D6); then Due is the DTSTART. DueOnly reports a DUE
	// without any DTSTART: the caller decides whether it is the due date or,
	// on a task that has a deadline, the deadline.
	Deadline    string
	DueOnly     bool
	Completed   bool
	CompletedAt *int64 // the COMPLETED time when the client sent one
	Categories  []string
	ParentUID   string
	CreatedAt   *int64
	// RRULE is the raw rule value ("" when none). Rule is its canonical
	// OpenTodo form, or "" when the grammar cannot express it; then the RRULE
	// line is part of Extra and the task keeps no rule of its own.
	RRULE string
	Rule  string
	Extra string
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
	case d.TZ != nil:
		return Prop{Name: name, Params: []Param{{Name: "TZID", Values: []string{*d.TZ}}}, Value: dateValue(d.Date) + "T" + clockValue(*d.Time)}
	}
	return Prop{Name: name, Value: dateValue(d.Date) + "T" + clockValue(*d.Time)}
}

// Encode renders a task as a complete VCALENDAR object.
func Encode(t Task) []byte {
	cal := &Component{Name: "VCALENDAR", Props: []Prop{
		{Name: "VERSION", Value: "2.0"},
		{Name: "PRODID", Value: ProdID},
		{Name: "CALSCALE", Value: "GREGORIAN"},
	}}
	if t.Due != nil && t.Due.TZ != nil && t.Due.Time != nil {
		if tz := vtimezone(*t.Due.TZ, t.Due.Date, *t.Due.Time); tz != nil {
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
		if t.Due != nil {
			todo.Props = append(todo.Props, dueProp("DTSTART", t.Due))
			extra = dropTopLevel(extra, "DTSTART")
		}
	} else if t.Due != nil {
		todo.Props = append(todo.Props, dueProp("DUE", t.Due))
		// A recurring VTODO is anchored at DTSTART; restate the due date unless
		// the client keeps its own DTSTART in the preserved remainder.
		if t.Recurrence != "" && !hasTopLevel(extra, "DTSTART") {
			todo.Props = append(todo.Props, dueProp("DTSTART", t.Due))
		}
	}
	if t.Recurrence != "" {
		if r, err := recurrence.Parse(t.Recurrence); err == nil {
			add("RRULE", r.RRULE())
		}
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
	lines := cal.Lines()
	lines = lines[:len(lines)-1] // reopen VCALENDAR to append the VTODO
	todoLines := todo.Lines()
	todoLines = todoLines[:len(todoLines)-1]
	lines = append(lines, todoLines...)
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

// Decode reads a client's VCALENDAR body and maps its VTODO onto task fields.
func Decode(body []byte) (*Inbound, error) {
	cal, err := Parse(body)
	if err != nil {
		return nil, err
	}
	var master *Component
	uid := ""
	for _, c := range cal.Children {
		switch c.Name {
		case "VTIMEZONE":
			continue
		case "VTODO":
		case "VEVENT", "VJOURNAL", "VFREEBUSY":
			return nil, ErrUnsupportedComponent
		default:
			continue
		}
		u := c.Prop("UID")
		if u == nil || strings.TrimSpace(UnescapeText(u.Value)) == "" {
			return nil, fmt.Errorf("%w: VTODO without UID", ErrInvalidObject)
		}
		if uid != "" && strings.TrimSpace(UnescapeText(u.Value)) != uid {
			return nil, fmt.Errorf("%w: more than one UID", ErrInvalidObject)
		}
		uid = strings.TrimSpace(UnescapeText(u.Value))
		// Per-occurrence overrides (RECURRENCE-ID) are not modelled; the
		// master component carries the task.
		if c.Prop("RECURRENCE-ID") == nil && master == nil {
			master = c
		}
	}
	if uid == "" {
		return nil, fmt.Errorf("%w: no VTODO", ErrInvalidObject)
	}
	if master == nil {
		return nil, fmt.Errorf("%w: only occurrence overrides, no master VTODO", ErrInvalidObject)
	}
	in := &Inbound{UID: uid, Priority: 4}
	var extra []string
	var dtstart *Prop
	var rrule *Prop
	status := ""
	for i := range master.Props {
		p := master.Props[i]
		switch p.Name {
		case "UID", "DTSTAMP", "LAST-MODIFIED", "SEQUENCE":
		case "SUMMARY":
			in.Title = UnescapeText(p.Value)
		case "DESCRIPTION":
			in.Description = UnescapeText(p.Value)
		case "PRIORITY":
			n, err := strconv.Atoi(strings.TrimSpace(p.Value))
			if err != nil {
				extra = append(extra, p.Line())
				continue
			}
			in.Priority = ICalToAppPriority(n)
		case "DUE":
			d, err := parseDue(p)
			if err != nil || in.Due != nil {
				extra = append(extra, p.Line())
				continue
			}
			in.Due = d
		case "DTSTART":
			dtstart = &master.Props[i]
		case "RRULE":
			if rrule != nil {
				extra = append(extra, p.Line())
				continue
			}
			rrule = &master.Props[i]
		case "STATUS":
			status = strings.ToUpper(strings.TrimSpace(p.Value))
			if status == "IN-PROCESS" {
				extra = append(extra, p.Line())
			}
		case "COMPLETED":
			if ms, err := instantOf(p); err == nil {
				in.CompletedAt = &ms
			}
		case "PERCENT-COMPLETE":
			if strings.TrimSpace(p.Value) != "100" {
				extra = append(extra, p.Line())
			}
		case "CATEGORIES":
			for _, c := range SplitText(p.Value) {
				if c = strings.TrimSpace(c); c != "" {
					in.Categories = append(in.Categories, c)
				}
			}
		case "RELATED-TO":
			rt := strings.ToUpper(p.Param("RELTYPE"))
			if (rt == "" || rt == "PARENT") && in.ParentUID == "" && strings.TrimSpace(p.Value) != "" {
				in.ParentUID = UnescapeText(strings.TrimSpace(p.Value))
				continue
			}
			extra = append(extra, p.Line())
		case "CREATED":
			if ms, err := instantOf(p); err == nil {
				in.CreatedAt = &ms
			}
		default:
			extra = append(extra, p.Line())
		}
	}
	in.Completed = status == "COMPLETED" || status == "CANCELLED" || (status == "" && in.CompletedAt != nil)
	if !in.Completed {
		in.CompletedAt = nil
	}
	// DTSTART and DUE (design D6): differing ones are the planned day and the
	// deadline (the date of DUE, any time dropped). Equal ones set the due date
	// only; the DTSTART is the anchor this server writes on recurring tasks
	// (Encode) and is kept as client data only when the rule stays unmapped.
	// A DTSTART without a DUE, or one that does not parse, is client data.
	in.DueOnly = in.Due != nil && dtstart == nil
	startEqual := false
	if dtstart != nil && in.Due != nil {
		if d, err := parseDue(*dtstart); err == nil {
			if sameDue(d, in.Due) {
				startEqual = true
			} else {
				in.Deadline = in.Due.Date
				in.Due = d
			}
		}
	}
	if rrule != nil {
		in.RRULE = strings.TrimSpace(rrule.Value)
		due := ""
		if in.Due != nil {
			due = in.Due.Date
		}
		if r, ok := recurrence.FromRRULE(in.RRULE, due); ok {
			in.Rule = r.Canonical()
		} else {
			extra = append(extra, rrule.Line())
		}
	}
	if dtstart != nil && in.Deadline == "" && !(startEqual && in.Rule != "") {
		extra = append([]string{dtstart.Line()}, extra...)
	}
	for _, ch := range master.Children {
		extra = append(extra, ch.Lines()...)
	}
	in.Extra = strings.Join(extra, "\r\n")
	return in, nil
}

func sameDue(a, b *Due) bool {
	eq := func(x, y *string) bool { return (x == nil && y == nil) || (x != nil && y != nil && *x == *y) }
	return a.Date == b.Date && eq(a.Time, b.Time) && eq(a.TZ, b.TZ)
}

// parseDue maps a DUE (or DTSTART) property onto a due value: VALUE=DATE is a
// floating date, a date-time without zone is floating, TZID with a known IANA
// zone (or a known suffix of a vendor path such as /mozilla.org/…/Europe/Berlin)
// is zoned, a UTC time is zoned in UTC, and an unknown TZID falls back to the
// floating wall time. Seconds are dropped.
func parseDue(p Prop) (*Due, error) {
	v := strings.TrimSpace(p.Value)
	if len(v) == 8 || strings.EqualFold(p.Param("VALUE"), "DATE") {
		if len(v) < 8 {
			return nil, fmt.Errorf("%w: bad date", ErrInvalid)
		}
		d, err := isoDate(v[:8])
		if err != nil {
			return nil, err
		}
		return &Due{Date: d}, nil
	}
	if len(v) < 13 || v[8] != 'T' {
		return nil, fmt.Errorf("%w: bad date-time", ErrInvalid)
	}
	d, err := isoDate(v[:8])
	if err != nil {
		return nil, err
	}
	hh, mm := v[9:11], v[11:13]
	if !digits(hh) || !digits(mm) || hh > "23" || mm > "59" {
		return nil, fmt.Errorf("%w: bad time", ErrInvalid)
	}
	clock := hh + ":" + mm
	due := &Due{Date: d, Time: &clock}
	switch {
	case strings.HasSuffix(v, "Z"):
		utc := "UTC"
		due.TZ = &utc
	case p.Param("TZID") != "":
		if tz := ianaZone(p.Param("TZID")); tz != "" {
			due.TZ = &tz
		}
	}
	return due, nil
}

// ianaZone resolves a TZID to an IANA zone name, or "" when unknown.
func ianaZone(tzid string) string {
	tzid = strings.Trim(strings.TrimSpace(tzid), "/")
	if zoned.Valid(tzid) {
		return tzid
	}
	parts := strings.Split(tzid, "/")
	for i := 1; i < len(parts); i++ {
		if cand := strings.Join(parts[i:], "/"); zoned.Valid(cand) {
			return cand
		}
	}
	return ""
}

// instantOf reads a DATE-TIME property (COMPLETED, CREATED) as Unix
// milliseconds: UTC, a TZID wall time, or a floating time read as UTC.
func instantOf(p Prop) (int64, error) {
	d, err := parseDue(p)
	if err != nil {
		return 0, err
	}
	clock := "00:00"
	if d.Time != nil {
		clock = *d.Time
	}
	loc := time.UTC
	if d.TZ != nil {
		if l, err := zoned.Load(*d.TZ); err == nil {
			loc = l
		}
	}
	t, err := zoned.Instant(d.Date, clock, loc)
	if err != nil {
		return 0, err
	}
	sec := 0
	v := strings.TrimSpace(p.Value)
	if len(v) >= 15 && digits(v[13:15]) {
		sec, _ = strconv.Atoi(v[13:15])
	}
	return t.UnixMilli() + int64(sec)*1000, nil
}

func isoDate(v string) (string, error) {
	if !digits(v) || len(v) != 8 {
		return "", fmt.Errorf("%w: bad date", ErrInvalid)
	}
	d := v[:4] + "-" + v[4:6] + "-" + v[6:8]
	if _, err := time.Parse("2006-01-02", d); err != nil {
		return "", fmt.Errorf("%w: bad date", ErrInvalid)
	}
	return d, nil
}

func digits(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return s != ""
}

// vtimezone describes a zone around the given wall time: the observance in force
// at the start of that year plus every transition within it, which is enough
// for any client to resolve the due time. Clients that know the IANA name (all
// target clients do) use their own rules.
func vtimezone(tz, date, clock string) *Component {
	loc, err := zoned.Load(tz)
	if err != nil {
		return nil
	}
	at, err := zoned.Instant(date, clock, loc)
	if err != nil {
		return nil
	}
	year := at.Year()
	start := time.Date(year, 1, 1, 0, 0, 0, 0, loc)
	end := time.Date(year+1, 1, 1, 0, 0, 0, 0, loc)
	c := &Component{Name: "VTIMEZONE", Props: []Prop{{Name: "TZID", Value: tz}}}
	observance := func(t time.Time, from int, dtstart string) {
		name, off := t.Zone()
		kind := "STANDARD"
		if t.IsDST() {
			kind = "DAYLIGHT"
		}
		c.Children = append(c.Children, &Component{Name: kind, Props: []Prop{
			{Name: "DTSTART", Value: dtstart},
			{Name: "TZOFFSETFROM", Value: offsetText(from)},
			{Name: "TZOFFSETTO", Value: offsetText(off)},
			{Name: "TZNAME", Value: EscapeText(name)},
		}})
	}
	_, off0 := start.Zone()
	observance(start, off0, "19700101T000000")
	t := start
	for i := 0; i < 8; i++ {
		_, next := t.ZoneBounds()
		if next.IsZero() || !next.Before(end) {
			break
		}
		_, before := next.Add(-time.Second).Zone()
		wall := next.In(time.FixedZone("", before))
		observance(next, before, wall.Format("20060102T150405"))
		t = next
	}
	return c
}

func offsetText(sec int) string {
	sign := '+'
	if sec < 0 {
		sign, sec = '-', -sec
	}
	return fmt.Sprintf("%c%02d%02d", sign, sec/3600, (sec%3600)/60)
}
