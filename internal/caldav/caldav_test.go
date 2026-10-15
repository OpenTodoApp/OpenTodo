package caldav

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/recurrence"
)

func strp(s string) *string { return &s }

// toTask stores an inbound VTODO the way the server does and returns the
// outbound view of the result.
func toTask(in *Inbound) Task {
	t := Task{UID: in.UID, Title: in.Title, Description: in.Description, Priority: in.Priority, Due: in.Due, Deadline: in.Deadline,
		Categories: in.Categories, ParentUID: in.ParentUID, Recurrence: in.Rule, Extra: in.Extra, Modified: 1_760_000_000_000}
	if in.CreatedAt != nil {
		t.CreatedAt = *in.CreatedAt
	}
	if in.Completed {
		c := int64(1_760_000_000_000)
		if in.CompletedAt != nil {
			c = *in.CompletedAt
		}
		t.CompletedAt = &c
	}
	return t
}

func TestICalRoundTripFixtures(t *testing.T) {
	files, _ := filepath.Glob("testdata/*.ics")
	if len(files) < 3 {
		t.Fatalf("fixtures missing: %v", files)
	}
	for _, f := range files {
		t.Run(filepath.Base(f), func(t *testing.T) {
			raw, err := os.ReadFile(f)
			if err != nil {
				t.Fatal(err)
			}
			first, err := Decode(raw)
			if err != nil {
				t.Fatalf("decode: %v", err)
			}
			out := Encode(toTask(first))
			for _, l := range strings.Split(string(out), "\r\n") {
				if len(l) > 75 {
					t.Fatalf("line not folded (%d octets): %q", len(l), l)
				}
			}
			second, err := Decode(out)
			if err != nil {
				t.Fatalf("decode of our own output: %v\n%s", err, out)
			}
			if second.CreatedAt != nil && first.CreatedAt != nil && *second.CreatedAt != *first.CreatedAt {
				t.Fatalf("created changed")
			}
			second.CreatedAt, first.CreatedAt = nil, nil
			if recurrence.SameRRULE(first.RRULE, second.RRULE) {
				second.RRULE = first.RRULE // written in our canonical spelling
			}
			if !reflect.DeepEqual(first, second) {
				t.Fatalf("round trip differs\nfirst:  %+v\nsecond: %+v\n%s", first, second, out)
			}
		})
	}
}

func TestFixtureMappings(t *testing.T) {
	read := func(name string) *Inbound {
		raw, err := os.ReadFile("testdata/" + name)
		if err != nil {
			t.Fatal(err)
		}
		in, err := Decode(raw)
		if err != nil {
			t.Fatal(err)
		}
		return in
	}
	apple := read("apple-reminders.ics")
	if apple.Title != "Water the tomatoes" || apple.Priority != 1 || apple.Description != "Use the rain barrel, not the tap.\nTwo cans each." {
		t.Fatalf("apple basics: %+v", apple)
	}
	if apple.Due == nil || apple.Due.Date != "2026-10-11" || *apple.Due.Time != "09:30" || apple.Due.TZ == nil || *apple.Due.TZ != "Europe/Berlin" {
		t.Fatalf("apple due: %+v", apple.Due)
	}
	if apple.Rule != "every week" {
		t.Fatalf("apple rule %q", apple.Rule)
	}
	if !strings.Contains(apple.Extra, "BEGIN:VALARM") || !strings.Contains(apple.Extra, "X-APPLE-SORT-ORDER:731") {
		t.Fatalf("apple extra lost the alarm: %q", apple.Extra)
	}
	if strings.Contains(apple.Extra, "DTSTART") || strings.Contains(apple.Extra, "RRULE") {
		t.Fatalf("derived DTSTART/RRULE kept as extra: %q", apple.Extra)
	}
	tb := read("thunderbird.ics")
	if !tb.Completed || tb.CompletedAt == nil || tb.Priority != 2 || !reflect.DeepEqual(tb.Categories, []string{"Finance", "Home"}) {
		t.Fatalf("thunderbird: %+v", tb)
	}
	if *tb.Due.TZ != "America/New_York" || !strings.Contains(tb.Extra, "CLASS:PRIVATE") || !strings.Contains(tb.Extra, "URL:https://example.com/taxes") {
		t.Fatalf("thunderbird extra/due: %+v", tb)
	}
	dx := read("davx5-tasks.ics")
	if dx.Completed || dx.Priority != 3 || dx.ParentUID != "5732178916520913821" || dx.Due.Time != nil || dx.Due.Date != "2026-10-20" {
		t.Fatalf("davx5: %+v", dx)
	}
	if !strings.Contains(dx.Extra, "STATUS:IN-PROCESS") || !strings.Contains(dx.Extra, "PERCENT-COMPLETE:40") || !strings.Contains(dx.Extra, "GEO:52.520008;13.404954") {
		t.Fatalf("davx5 extra: %q", dx.Extra)
	}
	// Our own STATUS is not duplicated next to the preserved IN-PROCESS.
	if n := strings.Count(string(Encode(toTask(dx))), "STATUS:"); n != 1 {
		t.Fatalf("STATUS lines = %d", n)
	}
}

func TestMapPriorityRoundTrip(t *testing.T) {
	for app := 1; app <= 4; app++ {
		if got := ICalToAppPriority(AppToICalPriority(app)); got != app {
			t.Fatalf("app %d -> %d -> %d", app, AppToICalPriority(app), got)
		}
	}
	want := map[int]int{0: 4, 1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4, -1: 4}
	for in, app := range want {
		if got := ICalToAppPriority(in); got != app {
			t.Fatalf("PRIORITY %d -> %d, want %d", in, got, app)
		}
	}
	if AppToICalPriority(2) != 5 {
		t.Fatal("priority 2 must be served as 5")
	}
}

func vtodo(lines ...string) []byte {
	return []byte("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VTODO\r\nUID:x1\r\n" + strings.Join(lines, "\r\n") + "\r\nEND:VTODO\r\nEND:VCALENDAR\r\n")
}

func TestDueMapping(t *testing.T) {
	cases := []struct {
		line string
		want Due
	}{
		{"DUE;VALUE=DATE:20261011", Due{Date: "2026-10-11"}},
		{"DUE:20261011", Due{Date: "2026-10-11"}},
		{"DUE:20261011T093000", Due{Date: "2026-10-11", Time: strp("09:30")}},
		{"DUE:20261011T093045Z", Due{Date: "2026-10-11", Time: strp("09:30"), TZ: strp("UTC")}},
		{"DUE;TZID=Europe/Rome:20261011T093000", Due{Date: "2026-10-11", Time: strp("09:30"), TZ: strp("Europe/Rome")}},
		{"DUE;TZID=/mozilla.org/20050126_1/Europe/Paris:20261011T093000", Due{Date: "2026-10-11", Time: strp("09:30"), TZ: strp("Europe/Paris")}},
		{`DUE;TZID="W. Europe Standard Time":20261011T093000`, Due{Date: "2026-10-11", Time: strp("09:30")}},
	}
	for _, c := range cases {
		in, err := Decode(vtodo(c.line))
		if err != nil {
			t.Fatalf("%s: %v", c.line, err)
		}
		if in.Due == nil || !sameDue(in.Due, &c.want) {
			t.Fatalf("%s: got %+v", c.line, in.Due)
		}
	}
	// Outbound forms.
	enc := func(d Due) string { return string(Encode(Task{UID: "u", Due: &d, Priority: 4})) }
	if out := enc(Due{Date: "2026-10-11", Time: strp("09:30")}); !strings.Contains(out, "\r\nDUE:20261011T093000\r\n") || strings.Contains(out, "VTIMEZONE") {
		t.Fatalf("floating: %s", out)
	}
	if out := enc(Due{Date: "2026-10-11"}); !strings.Contains(out, "\r\nDUE;VALUE=DATE:20261011\r\n") {
		t.Fatalf("date: %s", out)
	}
	out := enc(Due{Date: "2026-10-11", Time: strp("09:30"), TZ: strp("Europe/Berlin")})
	if !strings.Contains(out, "DUE;TZID=Europe/Berlin:20261011T093000") || !strings.Contains(out, "BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin") ||
		!strings.Contains(out, "TZOFFSETTO:+0200") || !strings.Contains(out, "TZOFFSETTO:+0100") {
		t.Fatalf("zoned: %s", out)
	}
	if _, err := Parse([]byte(out)); err != nil {
		t.Fatal(err)
	}
}

func TestUnmappedPropertiesPreserved(t *testing.T) {
	in, err := Decode(vtodo("SUMMARY:A", "X-CUSTOM;FOO=\"a:b\":value;with;semis", "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", "END:VALARM",
		"RRULE:FREQ=HOURLY", "RELATED-TO;RELTYPE=SIBLING:other"))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`X-CUSTOM;FOO="a:b":value;with;semis`, "BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nEND:VALARM", "RRULE:FREQ=HOURLY", "RELATED-TO;RELTYPE=SIBLING:other"} {
		if !strings.Contains(in.Extra, want) {
			t.Fatalf("extra lacks %q: %q", want, in.Extra)
		}
	}
	if in.Rule != "" || in.RRULE != "FREQ=HOURLY" {
		t.Fatalf("hourly rule must stay unmapped: %+v", in)
	}
	// A title edit elsewhere keeps the alarm on the next fetch.
	task := toTask(in)
	task.Title = "B"
	again, err := Decode(Encode(task))
	if err != nil || again.Title != "B" || again.Extra != in.Extra {
		t.Fatalf("after edit: %+v %v", again, err)
	}
}

func TestDecodeRejects(t *testing.T) {
	if _, err := Decode([]byte("not ical")); err == nil {
		t.Fatal("garbage accepted")
	}
	if _, err := Decode([]byte("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:e\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")); err != ErrUnsupportedComponent {
		t.Fatalf("VEVENT: %v", err)
	}
	if _, err := Decode([]byte("BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nSUMMARY:x\r\nEND:VTODO\r\nEND:VCALENDAR\r\n")); err == nil {
		t.Fatal("missing UID accepted")
	}
}

func TestFoldingKeepsUTF8(t *testing.T) {
	title := strings.Repeat("Grüße 🌱 ", 30)
	out := Encode(Task{UID: "u", Title: title, Priority: 4})
	in, err := Decode(out)
	if err != nil || in.Title != title {
		t.Fatalf("folded title differs: %v", err)
	}
}

func FuzzParseICal(f *testing.F) {
	files, _ := filepath.Glob("testdata/*.ics")
	for _, p := range files {
		b, _ := os.ReadFile(p)
		f.Add(b)
	}
	f.Add([]byte("BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nUID:;\r\n DUE:2\r\nEND:VTODO\r\nEND:VCALENDAR"))
	f.Fuzz(func(t *testing.T, data []byte) {
		in, err := Decode(data)
		if err != nil {
			return
		}
		// Whatever we accept we can serialise and read back.
		if _, err := Decode(Encode(toTask(in))); err != nil {
			t.Fatalf("re-decode: %v", err)
		}
	})
}

// task-dependencies: DEPENDS-ON lines are their own field; an untyped RELATED-TO is the parent.
func TestDependsOnRoundTrip(t *testing.T) {
	out := string(Encode(Task{UID: "b", Title: "Book flights", ParentUID: "trip", DependsOn: []string{"a1", "a,2"}, Modified: 1}))
	if !strings.Contains(out, "RELATED-TO:trip\r\n") || !strings.Contains(out, "RELATED-TO;RELTYPE=DEPENDS-ON:a1\r\n") || !strings.Contains(out, `RELATED-TO;RELTYPE=DEPENDS-ON:a\,2`) {
		t.Fatalf("encoded:\n%s", out)
	}
	in, err := Decode([]byte(out))
	if err != nil {
		t.Fatal(err)
	}
	if in.ParentUID != "trip" || len(in.DependsOn) != 2 || in.DependsOn[1] != "a,2" || strings.Contains(in.Extra, "DEPENDS-ON") {
		t.Fatalf("decoded %+v", in)
	}
}
