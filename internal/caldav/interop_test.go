package caldav

import (
	"errors"
	"os"
	"strings"
	"testing"
)

// OpenSpec change caldav-interop: durations, estimates, date shapes and alarms.

func TestParseDuration(t *testing.T) {
	for _, c := range []struct {
		in   string
		want int64
	}{
		{"PT45M", 45 * 60}, {"PT1H30M", 90 * 60}, {"P1D", 86400}, {"P2W", 14 * 86400},
		{"PT20M30S", 20*60 + 30}, {"-PT1H", -3600}, {"+PT5M", 300}, {"P1DT2H", 86400 + 7200}, {"PT0M", 0},
	} {
		got, err := ParseDuration(c.in)
		if err != nil || got != c.want {
			t.Fatalf("%s: %d %v, want %d", c.in, got, err, c.want)
		}
	}
	for _, bad := range []string{"soon", "", "P", "PT", "P1DT", "PT1D", "P1H", "1H", "PTH", "P-1D"} {
		if _, err := ParseDuration(bad); !errors.Is(err, ErrInvalid) {
			t.Fatalf("%q accepted", bad)
		}
	}
	for minutes, want := range map[int]string{45: "PT45M", 90: "PT1H30M", 120: "PT2H", -30: "-PT30M", 1440: "PT24H", 0: "PT0M"} {
		if got := DurationText(minutes); got != want {
			t.Fatalf("DurationText(%d) = %s, want %s", minutes, got, want)
		}
	}
	for minutes, want := range map[int]string{-1440: "-P1D", 2880: "P2D", -30: "-PT30M", -1500: "-PT25H"} {
		if got := TriggerText(minutes); got != want {
			t.Fatalf("TriggerText(%d) = %s, want %s", minutes, got, want)
		}
	}
}

func TestEstimateEncode(t *testing.T) {
	out := string(Encode(Task{UID: "u", Priority: 4, EstimateMinutes: 90}))
	if !strings.Contains(out, "\r\nESTIMATED-DURATION:PT1H30M\r\n") {
		t.Fatalf("estimate served: %s", out)
	}
	if out = string(Encode(Task{UID: "u", Priority: 4})); strings.Contains(out, "ESTIMATED-DURATION") {
		t.Fatalf("no estimate: %s", out)
	}
	// A stale line from before the mapping is not served twice.
	out = string(Encode(Task{UID: "u", Priority: 4, EstimateMinutes: 45, Extra: "ESTIMATED-DURATION:PT2H"}))
	if strings.Count(out, "ESTIMATED-DURATION") != 1 || !strings.Contains(out, "ESTIMATED-DURATION:PT45M") {
		t.Fatalf("stale estimate: %s", out)
	}
}

func TestEstimateDecode(t *testing.T) {
	for line, want := range map[string]int{"ESTIMATED-DURATION:PT2H": 120, "ESTIMATED-DURATION:PT20M30S": 21, "ESTIMATED-DURATION:P1D": 1440, "ESTIMATED-DURATION:PT45M": 45} {
		in, err := Decode(vtodo(line))
		if err != nil || in.EstimateMinutes == nil || *in.EstimateMinutes != want || !in.HasDuration || strings.Contains(in.Extra, "ESTIMATED") {
			t.Fatalf("%s: %+v %v", line, in, err)
		}
	}
	for _, bad := range []string{"ESTIMATED-DURATION:P2W", "ESTIMATED-DURATION:-PT1H", "ESTIMATED-DURATION:soon", "ESTIMATED-DURATION:PT0M"} {
		if _, err := Decode(vtodo(bad)); !errors.Is(err, ErrInvalidValue) {
			t.Fatalf("%s: %v", bad, err)
		}
	}
	in, _ := Decode(vtodo("SUMMARY:x"))
	if in.EstimateMinutes != nil || in.HasDuration {
		t.Fatalf("absent: %+v", in)
	}
	// DURATION is only a signal and stays client data.
	in, _ = Decode(vtodo("DTSTART:20261020T140000", "DURATION:PT30M"))
	if in.EstimateMinutes != nil || !in.HasDuration || !strings.Contains(in.Extra, "DURATION:PT30M") || in.Shape != ShapeStartDuration {
		t.Fatalf("DURATION: %+v", in)
	}
}

func TestDateShapes(t *testing.T) {
	for _, c := range []struct {
		lines []string
		shape DateShape
		due   string
	}{
		{nil, ShapeNone, ""},
		{[]string{"DUE;VALUE=DATE:20261017"}, ShapeDueOnly, "2026-10-17"},
		{[]string{"DTSTART;VALUE=DATE:20261013", "DUE;VALUE=DATE:20261013"}, ShapeStartDueEqual, "2026-10-13"},
		{[]string{"DTSTART;VALUE=DATE:20261013", "DUE;VALUE=DATE:20261017"}, ShapeStartDue, "2026-10-13"},
		{[]string{"DTSTART:20261020T140000", "ESTIMATED-DURATION:PT30M"}, ShapeStartDuration, "2026-10-20"},
		{[]string{"DTSTART;VALUE=DATE:20261013"}, ShapeStartAlone, ""},
	} {
		in, err := Decode(vtodo(append([]string{"SUMMARY:x"}, c.lines...)...))
		if err != nil || in.Shape != c.shape {
			t.Fatalf("%v: shape %d %v, want %d", c.lines, in.Shape, err, c.shape)
		}
		got := ""
		if in.Due != nil {
			got = in.Due.Date
		}
		if got != c.due {
			t.Fatalf("%v: due %q, want %q", c.lines, got, c.due)
		}
	}
	// A scheduled time consumes its DTSTART; a bare one stays client data.
	in, _ := Decode(vtodo("DTSTART:20261020T140000", "ESTIMATED-DURATION:PT30M"))
	if strings.Contains(in.Extra, "DTSTART") || in.Due.Time == nil || *in.Due.Time != "14:00" {
		t.Fatalf("scheduled: %+v", in)
	}
}

// TestMitraFixtures: the shapes of issue #196, each one object as Mitra writes it.
func TestMitraFixtures(t *testing.T) {
	read := func(name string) *Inbound {
		raw, err := os.ReadFile("testdata/mitra/" + name)
		if err != nil {
			t.Fatal(err)
		}
		in, err := Decode(raw)
		if err != nil {
			t.Fatal(err)
		}
		return in
	}
	if in := read("scheduled-undated.ics"); in.Shape != ShapeStartDuration || in.Due == nil || in.Due.Date != "2026-10-20" || *in.EstimateMinutes != 30 {
		t.Fatalf("scheduled: %+v", in)
	}
	if in := read("deadline-moved.ics"); in.Shape != ShapeStartDuration || in.Due.Date != "2026-10-15" || in.Deadline != "" || *in.EstimateMinutes != 120 {
		t.Fatalf("deadline moved: %+v", in)
	}
	if in := read("recurring-moved.ics"); in.Shape != ShapeStartDuration || in.Due.Date != "2026-10-14" || in.Rule != "every week" {
		t.Fatalf("recurring moved: %+v", in)
	}
	if in := read("due-cleared.ics"); in.Shape != ShapeNone || in.Due != nil {
		t.Fatalf("cleared: %+v", in)
	}
	if in := read("estimate-only.ics"); in.Shape != ShapeNone || *in.EstimateMinutes != 45 {
		t.Fatalf("estimate only: %+v", in)
	}
	// Mitra since its fix for issue #196 echoes the served DUE when it moves a
	// task (issue #248): the decoder reports the pair as start and deadline and
	// hands the DUE as sent to the caller, which recognises the echo.
	in := read("timed-moved-echoed-due.ics")
	if in.Shape != ShapeStartDue || in.Due.Date != "2026-10-23" || *in.Due.Time != "10:00" || in.Deadline != "2026-10-22" ||
		in.SentDue == nil || in.SentDue.Date != "2026-10-22" || *in.SentDue.Time != "14:00" || *in.EstimateMinutes != 30 {
		t.Fatalf("timed moved: %+v sent %+v", in, in.SentDue)
	}
	if in = read("recurring-moved-echoed-due.ics"); in.Shape != ShapeStartDue || in.Due.Date != "2026-10-14" || in.Rule != "every week" || in.SentDue.Date != "2026-10-13" {
		t.Fatalf("recurring moved: %+v", in)
	}
	if in = read("dated-scheduled-echoed-due.ics"); in.Shape != ShapeStartDue || *in.Due.Time != "15:00" || in.SentDue.Time != nil || in.SentDue.Date != "2026-10-22" {
		t.Fatalf("dated scheduled: %+v", in)
	}
	// The served DTSTART of a timed task echoed back is not client data.
	if in, _ = Decode(vtodo("DTSTART:20261020T140000", "DUE:20261020T140000")); in.Shape != ShapeStartDueEqual || strings.Contains(in.Extra, "DTSTART") {
		t.Fatalf("echoed start: %+v", in)
	}
	if in, _ = Decode(vtodo("DTSTART;VALUE=DATE:20261020", "DUE;VALUE=DATE:20261020")); in.Shape != ShapeStartDueEqual || !strings.Contains(in.Extra, "DTSTART") {
		t.Fatalf("started date task: %+v", in)
	}
}

func TestAlarmEncode(t *testing.T) {
	due := &Due{Date: "2026-10-13", Time: strp("09:30")}
	out := string(Encode(Task{UID: "u", Title: "Call", Priority: 4, Due: due, Reminders: []Reminder{
		{ID: "r1", Kind: "relative", Offset: -30},
		{ID: "r2", Kind: "absolute", FireAt: 1_791_828_000_000}, // 2026-10-12 18:00 UTC
	}}))
	for _, want := range []string{
		"BEGIN:VALARM\r\nUID:r1\r\nX-WR-ALARMUID:r1\r\nACTION:DISPLAY\r\nDESCRIPTION:Call\r\nTRIGGER;RELATED=END:-PT30M\r\nEND:VALARM",
		"UID:r2\r\nX-WR-ALARMUID:r2\r\nACTION:DISPLAY\r\nDESCRIPTION:Call\r\nTRIGGER;VALUE=DATE-TIME:20261012T180000Z\r\nEND:VALARM",
		"\r\nX-OPENTODO-ALARMS:2\r\n",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("lacks %q:\n%s", want, out)
		}
	}
	// On a deadline task DUE is the deadline: a relative reminder is RELATED=START
	// (the DTSTART due date), a deadline reminder RELATED=END with its marker.
	out = string(Encode(Task{UID: "u", Title: "Report", Priority: 4, Due: due, Deadline: "2026-11-06", Reminders: []Reminder{
		{ID: "r3", Kind: "relative", Offset: -60}, {ID: "r4", Kind: "deadline", Offset: -1440},
	}}))
	for _, want := range []string{"TRIGGER;RELATED=START:-PT1H\r\nX-OPENTODO-KIND:RELATIVE", "TRIGGER;RELATED=END:-P1D\r\nX-OPENTODO-KIND:DEADLINE"} {
		if !strings.Contains(out, want) {
			t.Fatalf("deadline task lacks %q:\n%s", want, out)
		}
	}
	// No reminders: no alarm and no marker.
	if out = string(Encode(Task{UID: "u", Priority: 4})); strings.Contains(out, "VALARM") || strings.Contains(out, "X-OPENTODO-ALARMS") {
		t.Fatalf("no reminders: %s", out)
	}
	// A relative reminder of a task without a due date is still served.
	if out = string(Encode(Task{UID: "u", Priority: 4, Reminders: []Reminder{{ID: "r5", Kind: "relative", Offset: -60}}})); !strings.Contains(out, "TRIGGER;RELATED=END:-PT1H") {
		t.Fatalf("undated: %s", out)
	}
}

func TestAlarmDecode(t *testing.T) {
	alarm := func(lines ...string) Alarm {
		t.Helper()
		in, err := Decode(vtodo(append(append([]string{"SUMMARY:x", "BEGIN:VALARM"}, lines...), "END:VALARM")...))
		if err != nil || len(in.Alarms) != 1 || strings.Contains(in.Extra, "VALARM") {
			t.Fatalf("%v: %+v %v", lines, in, err)
		}
		return in.Alarms[0]
	}
	a := alarm("ACTION:DISPLAY", "TRIGGER:-PT15M")
	if !a.Mappable || a.Offset == nil || *a.Offset != -15 || a.Related != "" || a.At != nil {
		t.Fatalf("relative: %+v", a)
	}
	a = alarm("X-WR-ALARMUID:abc", "ACTION:DISPLAY", "TRIGGER;RELATED=START:-PT1H", "X-OPENTODO-KIND:RELATIVE")
	if !a.Mappable || a.UID != "abc" || a.Related != "START" || a.Kind != "RELATIVE" || *a.Offset != -60 {
		t.Fatalf("related start: %+v", a)
	}
	a = alarm("UID:r4", "TRIGGER;RELATED=END:-P1D", "X-OPENTODO-KIND:DEADLINE")
	if !a.Mappable || a.UID != "r4" || a.Kind != "DEADLINE" || *a.Offset != -1440 {
		t.Fatalf("deadline: %+v", a)
	}
	a = alarm("ACTION:DISPLAY", "TRIGGER;VALUE=DATE-TIME:20261011T073000Z")
	if !a.Mappable || a.At == nil || a.At.Date != "2026-10-11" || *a.At.Time != "07:30" || *a.At.TZ != "UTC" {
		t.Fatalf("absolute: %+v", a)
	}
	// Seconds round toward the anchor.
	if a = alarm("TRIGGER:-PT20M30S"); *a.Offset != -20 {
		t.Fatalf("seconds: %+v", a)
	}
	for _, lines := range [][]string{
		{"ACTION:AUDIO", "TRIGGER:-PT15M"},
		{"ACTION:EMAIL", "TRIGGER:-PT15M"},
		{"ACTION:PROCEDURE", "TRIGGER:-PT15M"},
		{"ACTION:DISPLAY", "TRIGGER:-PT15M", "REPEAT:2", "DURATION:PT5M"},
		{"ACTION:DISPLAY", "TRIGGER:soon"},
		{"ACTION:DISPLAY", "TRIGGER:-P400D"},
		{"ACTION:DISPLAY"},
	} {
		if a := alarm(lines...); a.Mappable || len(a.Lines) != len(lines)+2 {
			t.Fatalf("%v mapped: %+v", lines, a)
		}
	}
	// The served count is consumed, never kept.
	in, _ := Decode(vtodo("SUMMARY:x", "X-OPENTODO-ALARMS:2"))
	if in.ServedAlarms == nil || *in.ServedAlarms != 2 || strings.Contains(in.Extra, "X-OPENTODO-ALARMS") {
		t.Fatalf("marker: %+v", in)
	}
	// Apple's fixture: one absolute alarm with its X-WR-ALARMUID.
	raw, _ := os.ReadFile("testdata/apple-reminders.ics")
	apple, _ := Decode(raw)
	if len(apple.Alarms) != 1 || apple.Alarms[0].UID == "" || apple.Alarms[0].At == nil || !apple.Alarms[0].Mappable {
		t.Fatalf("apple: %+v", apple.Alarms)
	}
}
