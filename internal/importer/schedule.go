package importer

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/recurrence"
	"github.com/pixari/opentodo/internal/zoned"
)

// Recurrence and reminders from other formats (OpenSpec change
// `import-completeness`, design D4/D5). Export files from popular commercial task
// apps spell repetition in many ways; the importer accepts the rule grammar of
// internal/recurrence, RRULEs and the small, documented set of common spellings
// below (docs/import.md), and reports anything else as a row warning.

// Reminder is a reminder read from a file: an absolute instant (At, Unix ms) or
// an offset in minutes from the task's due time (negative = before).
type Reminder struct {
	Absolute bool
	At       int64
	Offset   int
}

var errUnsupportedRule = errors.New("unsupported recurrence")

// clockSuffix matches a trailing time of day ("4pm", "at 9:30", "16:00"): the
// due date-time already carries it, the rule only says on which days.
var clockSuffix = regexp.MustCompile(`\s+(?:at\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})$|\s+at\s+\d{1,2}$`)

// spellings rewrites whole phrases with one obvious meaning into the grammar.
var spellings = map[string]string{
	"daily": "every day", "weekly": "every week", "monthly": "every month",
	"yearly": "every year", "annually": "every year", "every annually": "every year",
	"biweekly": "every 2 weeks", "fortnightly": "every 2 weeks", "every fortnight": "every 2 weeks",
	"weekdays": "every weekday", "workdays": "every weekday", "every workday": "every weekday",
	"every work day": "every weekday", "every business day": "every weekday",
	"every weekend": "every saturday, sunday", "weekends": "every saturday, sunday",
	"every hour": "", "hourly": "",
}

var units = map[string]string{
	"day": "day", "days": "day", "daily": "day",
	"week": "week", "weeks": "week", "weekly": "week",
	"month": "month", "months": "month", "monthly": "month", "absolutemonthly": "month", "relativemonthly": "month",
	"year": "year", "years": "year", "yearly": "year", "annually": "year", "absoluteyearly": "year", "relativeyearly": "year",
}

var dayCodes = map[string]string{"mo": "monday", "tu": "tuesday", "we": "wednesday", "th": "thursday", "fr": "friday", "sa": "saturday", "su": "sunday"}

// parseRecurrence turns a recurrence string into a canonical rule. dueDate
// ("YYYY-MM-DD" or "") anchors RRULEs that restate the due date's weekday.
func parseRecurrence(text, dueDate string) (string, error) {
	s := strings.TrimSpace(text)
	if s == "" {
		return "", nil
	}
	if r, err := recurrence.Canonicalize(s); err == nil {
		return r, nil
	}
	low := strings.ToLower(strings.Join(strings.Fields(s), " "))
	if i := strings.Index(low, "rrule:"); i >= 0 {
		low = strings.TrimSpace(low[i+len("rrule:"):])
		if j := strings.IndexByte(low, ' '); j >= 0 {
			low = low[:j]
		}
	}
	if strings.Contains(low, "freq=") {
		if r, ok := recurrence.FromRRULE(low, dueDate); ok {
			return r.Canonical(), nil
		}
		return "", errUnsupportedRule
	}
	after := false
	if rest, ok := strings.CutPrefix(low, "every!"); ok {
		// "every!" repeats from the completion date.
		after, low = true, "every"+rest
	}
	if rest, ok := strings.CutPrefix(low, "each "); ok {
		low = "every " + rest
	}
	if rest, ok := strings.CutPrefix(low, "ev "); ok {
		low = "every " + rest
	}
	low = strings.TrimSpace(clockSuffix.ReplaceAllString(low, ""))
	if v, ok := spellings[low]; ok {
		if v == "" {
			return "", errUnsupportedRule
		}
		low = v
	}
	if rest, ok := strings.CutPrefix(low, "every other "); ok {
		if u, ok := units[rest]; ok {
			low = "every 2 " + u + "s"
		}
	}
	if after && !strings.Contains(low, "after completion") {
		cut := len(low)
		for _, kw := range []string{" until ", " for "} {
			if i := strings.Index(low, kw); i >= 0 && i < cut {
				cut = i
			}
		}
		low = low[:cut] + " after completion" + low[cut:]
	}
	r, err := recurrence.Canonicalize(low)
	if err != nil {
		return "", errUnsupportedRule
	}
	return r, nil
}

// recurrenceFrom reads a recurrence value: a string, an array of strings (for
// example ["RRULE:FREQ=WEEKLY"]) or a structured {frequency, interval, days}
// object, possibly under "pattern". It returns the rule and a display form of
// the source value for warnings.
func recurrenceFrom(v any, dueDate string) (rule, display string, err error) {
	switch t := v.(type) {
	case string:
		r, err := parseRecurrence(t, dueDate)
		return r, t, err
	case []any:
		var parts []string
		for _, e := range t {
			if s, ok := e.(string); ok && strings.TrimSpace(s) != "" {
				parts = append(parts, s)
			}
		}
		for _, p := range parts {
			if strings.Contains(strings.ToLower(p), "freq=") {
				r, err := parseRecurrence(p, dueDate)
				return r, p, err
			}
		}
		if len(parts) == 1 {
			r, err := parseRecurrence(parts[0], dueDate)
			return r, parts[0], err
		}
		b, _ := json.Marshal(t)
		return "", string(b), errUnsupportedRule
	case map[string]any:
		b, _ := json.Marshal(t)
		r, err := structuredRule(obj(t), dueDate)
		return r, string(b), err
	}
	b, _ := json.Marshal(v)
	return "", string(b), errUnsupportedRule
}

func structuredRule(o obj, dueDate string) (string, error) {
	if p := asObj(o["pattern"]); p != nil {
		o = p
	}
	if s := o.str("rrule", "rule", "string", "text"); s != "" {
		return parseRecurrence(s, dueDate)
	}
	unit, ok := units[strings.ToLower(o.str("frequency", "freq", "type", "unit"))]
	if !ok {
		return "", errUnsupportedRule
	}
	interval := 1
	if s := o.str("interval", "every"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 {
			return "", errUnsupportedRule
		}
		interval = n
	}
	var days []string
	for _, d := range o.names("days", "daysOfWeek", "days_of_week", "byday", "byDay", "weekdays") {
		d = strings.ToLower(d)
		if full, ok := dayCodes[d]; ok {
			d = full
		}
		days = append(days, d)
	}
	var text string
	switch {
	case len(days) > 0 && unit == "week" && interval == 1:
		text = "every " + strings.Join(days, ", ")
	case len(days) > 0:
		return "", errUnsupportedRule
	case interval == 1:
		text = "every " + unit
	default:
		text = fmt.Sprintf("every %d %ss", interval, unit)
	}
	r, err := recurrence.Canonicalize(text)
	if err != nil {
		return "", errUnsupportedRule
	}
	return r, nil
}

// setRecurrence parses the row's recurrence source after its due date is known
// and records the rule or a warning naming what was dropped.
func setRecurrence(row *Row, v any) {
	if v == nil {
		return
	}
	if b, ok := v.(bool); ok {
		if b {
			row.warn("recurrence dropped (no rule given)")
		}
		return
	}
	due := ""
	if row.Due != nil {
		due = row.Due.Date
	}
	rule, display, err := recurrenceFrom(v, due)
	if err != nil {
		row.warn("recurrence %q not supported; imported without a rule", display)
		return
	}
	row.Recurrence = rule
}

var (
	isoDuration = regexp.MustCompile(`^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$`)
	humanOffset = regexp.MustCompile(`^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)(?:\s+before)?$`)
)

func unitMinutes(u string) int {
	switch u[0] {
	case 'h':
		return 60
	case 'd':
		return 1440
	case 'w':
		return 10080
	}
	return 1
}

// reminderFromString reads "2026-10-20T09:00" (absolute), "30" / "30m" / "1 hour
// before" (minutes before the due time) or an ISO 8601 duration ("-PT15M").
func reminderFromString(s string, loc *time.Location) (Reminder, error) {
	s = strings.TrimSpace(s)
	if n, err := strconv.Atoi(s); err == nil {
		return Reminder{Offset: -n}, nil
	}
	if m := isoDuration.FindStringSubmatch(strings.ToUpper(s)); m != nil && len(s) > 1 {
		mins := 0
		for i, mult := range []int{10080, 1440, 60, 1} {
			if m[i+2] != "" {
				n, _ := strconv.Atoi(m[i+2])
				mins += n * mult
			}
		}
		if m[6] != "" {
			n, _ := strconv.Atoi(m[6])
			mins += n / 60
		}
		if m[1] == "-" {
			mins = -mins
		}
		return Reminder{Offset: mins}, nil
	}
	if m := humanOffset.FindStringSubmatch(strings.ToLower(s)); m != nil {
		n, _ := strconv.Atoi(m[1])
		return Reminder{Offset: -n * unitMinutes(m[2])}, nil
	}
	at, err := instantOf(s, loc)
	if err != nil {
		return Reminder{}, fmt.Errorf("reminder %q dropped (not recognised)", s)
	}
	return Reminder{Absolute: true, At: at}, nil
}

// instantOf reads a date or date-time as an instant: zoned values as given,
// floating ones in loc, a plain date at 09:00.
func instantOf(s string, loc *time.Location) (int64, error) {
	d, err := parseDue(s, loc)
	if err != nil || d == nil {
		return 0, fmt.Errorf("invalid date-time %q", s)
	}
	clock := d.Time
	if clock == "" {
		clock = "09:00"
	}
	t, err := zoned.Instant(d.Date, clock, loc)
	if err != nil {
		return 0, err
	}
	return t.UnixMilli(), nil
}

// reminderFrom reads one reminder value: a number (minutes before the due
// time), a string (see reminderFromString) or an object with an offset or an
// instant. Location reminders cannot be represented.
func reminderFrom(v any, loc *time.Location) (Reminder, error) {
	switch t := v.(type) {
	case json.Number:
		n, err := strconv.Atoi(t.String())
		if err != nil {
			return Reminder{}, fmt.Errorf("reminder %s dropped (not recognised)", t)
		}
		return Reminder{Offset: -n}, nil
	case string:
		return reminderFromString(t, loc)
	case map[string]any:
		o := obj(t)
		kind := strings.ToLower(o.str("type", "kind"))
		if kind == "location" || o.present("loc_trigger", "location", "geofence") {
			return Reminder{}, errors.New("location reminder dropped (not supported)")
		}
		offset := func() (Reminder, bool, error) {
			if s := o.str("offset_minutes"); s != "" {
				n, err := strconv.Atoi(s)
				return Reminder{Offset: n}, true, err
			}
			if s := o.str("minute_offset", "minutes_before", "minutesBefore", "before_minutes", "mm_offset"); s != "" {
				n, err := strconv.Atoi(s)
				return Reminder{Offset: -n}, true, err
			}
			if s := o.str("offset", "trigger", "before"); s != "" {
				r, err := reminderFromString(s, loc)
				return r, err == nil && !r.Absolute, err
			}
			return Reminder{}, false, nil
		}
		absolute := func() (Reminder, bool, error) {
			s := o.str("datetime", "dateTime", "date_time", "at", "fire_at", "remind_at", "reminderDateTime", "time", "date")
			if s == "" {
				if d := asObj(o["due"]); d != nil {
					s = d.str("datetime", "dateTime", "date")
				} else {
					s = o.str("due")
				}
			}
			if s == "" {
				return Reminder{}, false, nil
			}
			at, err := instantOf(s, loc)
			return Reminder{Absolute: true, At: at}, true, err
		}
		order := []func() (Reminder, bool, error){offset, absolute}
		if kind == "absolute" {
			order = []func() (Reminder, bool, error){absolute, offset}
		}
		for _, f := range order {
			if r, ok, err := f(); ok || err != nil {
				if err != nil {
					b, _ := json.Marshal(t)
					return Reminder{}, fmt.Errorf("reminder %s dropped (not recognised)", b)
				}
				return r, nil
			}
		}
	}
	b, _ := json.Marshal(v)
	return Reminder{}, fmt.Errorf("reminder %s dropped (not recognised)", b)
}

// addReminders reads a reminder value or list of values into the row; values
// that cannot be represented become warnings.
func addReminders(row *Row, v any, loc *time.Location) {
	var list []any
	switch t := v.(type) {
	case nil:
		return
	case []any:
		list = t
	case bool:
		if t {
			row.warn("reminder dropped (no time given)")
		}
		return
	default:
		list = []any{v}
	}
	for _, e := range list {
		r, err := reminderFrom(e, loc)
		if err != nil {
			row.warn("%s", err.Error())
			continue
		}
		if !r.Absolute && (r.Offset < -maxReminderOffset || r.Offset > maxReminderOffset) {
			row.warn("reminder offset of %d minutes dropped (more than a year)", r.Offset)
			continue
		}
		row.Reminders = append(row.Reminders, r)
	}
}

const maxReminderOffset = 525600
