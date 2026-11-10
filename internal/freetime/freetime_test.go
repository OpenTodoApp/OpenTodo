package freetime

import (
	"encoding/json"
	"flag"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/frames"
)

// The shared vectors (docs/contracts.md "Free time") are written from the
// cases below by `go test ./internal/freetime -update`, read here and by
// web/src/lib/freeTime.test.ts. The spec's scenarios are pinned by hand in
// TestScenarios so a regenerated file cannot drift from them unnoticed.

var update = flag.Bool("update", false, "rewrite the shared vectors")

const vectorsPath = "../../web/src/lib/freeTime.vectors.json"

type vectorCase struct {
	Name  string `json:"name"`
	Input Input  `json:"input"`
	Days  []Day  `json:"days"`
}

type vectorFile struct {
	Comment string       `json:"_comment"`
	Cases   []vectorCase `json:"cases"`
}

func at(date, clock string) When      { return When{Date: date, Time: clock} }
func atZ(date, clock, tz string) When { return When{Date: date, Time: clock, TZ: tz} }
func ptr[T any](v T) *T               { return &v }

// workday is 08:00-18:00 on Thursday 2026-10-15 unless a case says otherwise.
func base(name string, mod func(*Input)) vectorCase {
	in := Input{From: "2026-10-15", To: "2026-10-15", Zone: "UTC", DayStart: 8 * 60, DayEnd: 18 * 60, MinMinutes: 30,
		Events: []Event{}, Frames: []frames.Frame{}, Slots: []Slot{}, Tasks: []Task{}}
	mod(&in)
	return vectorCase{Name: name, Input: in}
}

func cases() []vectorCase {
	meeting := func(date, s, e string) Event { return Event{Start: at(date, s), End: at(date, e)} }
	return []vectorCase{
		base("an empty day is free from start to end", func(in *Input) {}),
		base("two meetings, two hours at least (the spec's scenario)", func(in *Input) {
			in.MinMinutes = 120
			in.Events = []Event{meeting("2026-10-15", "09:00", "11:00"), meeting("2026-10-15", "13:00", "15:00")}
		}),
		base("two meetings, half an hour at least", func(in *Input) {
			in.Events = []Event{meeting("2026-10-15", "09:00", "11:00"), meeting("2026-10-15", "13:00", "15:00")}
		}),
		base("overlapping and touching events merge", func(in *Input) {
			in.Events = []Event{meeting("2026-10-15", "10:00", "11:30"), meeting("2026-10-15", "11:00", "12:00"), meeting("2026-10-15", "12:00", "12:30")}
		}),
		base("free and all-day events take no time", func(in *Input) {
			in.Events = []Event{
				{Start: at("2026-10-15", "09:00"), End: at("2026-10-15", "12:00"), Free: true},
				{Start: When{Date: "2026-10-15"}, End: When{Date: "2026-10-16"}, AllDay: true},
			}
		}),
		base("a zero-length event takes no time", func(in *Input) {
			in.Events = []Event{meeting("2026-10-15", "10:00", "10:00")}
		}),
		base("an event across midnight takes the start of the next day", func(in *Input) {
			in.From, in.To = "2026-10-14", "2026-10-15"
			in.Events = []Event{{Start: at("2026-10-14", "17:00"), End: at("2026-10-15", "09:30")}}
		}),
		base("an event ending at midnight leaves the next day free", func(in *Input) {
			in.From, in.To = "2026-10-15", "2026-10-16"
			in.Events = []Event{{Start: at("2026-10-15", "16:00"), End: at("2026-10-16", "00:00")}}
		}),
		base("a zoned event is read in the viewer's zone", func(in *Input) {
			in.Zone = "Europe/Berlin"
			// 07:00-08:00 in New York is 13:00-14:00 in Berlin (both on summer time).
			in.Events = []Event{{Start: atZ("2026-10-15", "07:00", "America/New_York"), End: atZ("2026-10-15", "08:00", "America/New_York")}}
		}),
		base("a zoned event moves to the viewer's previous day", func(in *Input) {
			in.Zone = "America/Los_Angeles"
			in.From, in.To = "2026-10-14", "2026-10-15"
			// 08:00-10:00 in Tokyo is 16:00-18:00 the day before in Los Angeles.
			in.Events = []Event{{Start: atZ("2026-10-15", "08:00", "Asia/Tokyo"), End: atZ("2026-10-15", "10:00", "Asia/Tokyo")}}
		}),
		base("an event without an end takes no time", func(in *Input) {
			in.Events = []Event{{Start: at("2026-10-15", "09:00"), End: When{Date: "2026-10-15"}}}
		}),
		base("timed tasks take their estimate, or half an hour", func(in *Input) {
			in.Tasks = []Task{
				{Due: ptr(at("2026-10-15", "09:00")), Estimate: ptr(90)},
				{Due: ptr(at("2026-10-15", "14:00"))},
				{Due: ptr(at("2026-10-15", "16:00")), Estimate: ptr(0)},
			}
		}),
		base("done, untimed and other days' tasks take no time", func(in *Input) {
			in.Tasks = []Task{
				{Due: ptr(at("2026-10-15", "09:00")), Estimate: ptr(60), Done: true},
				{Due: ptr(When{Date: "2026-10-15"}), Estimate: ptr(120)},
				{Due: ptr(at("2026-10-16", "09:00")), Estimate: ptr(60)},
				{Due: nil, Estimate: ptr(60)},
			}
		}),
		base("a zoned task is placed in the viewer's zone", func(in *Input) {
			in.Zone = "Europe/London"
			in.Tasks = []Task{{Due: ptr(atZ("2026-10-15", "12:00", "Europe/Rome")), Estimate: ptr(60)}}
		}),
		base("a task late in the evening is cut at midnight", func(in *Input) {
			in.DayStart, in.DayEnd = 20*60, 24*60
			in.Tasks = []Task{{Due: ptr(at("2026-10-15", "23:00")), Estimate: ptr(180)}}
		}),
		base("slots take their minutes", func(in *Input) {
			in.Slots = []Slot{{Date: "2026-10-15", Start: "16:00", Minutes: 45}, {Date: "2026-10-15", Start: "08:00", Minutes: 15}, {Date: "2026-10-16", Start: "10:00", Minutes: 60},
				{Date: "2026-10-15", Start: "bad", Minutes: 60}, {Date: "2026-10-15", Start: "12:00", Minutes: 0}}
		}),
		base("frames take their window on their weekdays", func(in *Input) {
			in.From, in.To = "2026-10-15", "2026-10-17"
			in.Frames = []frames.Frame{
				{ID: "f1", Weekdays: "1,2,3,4,5", Start: "09:00", End: "11:00", Position: 1},
				{ID: "f2", Weekdays: "6", Start: "10:00", End: "12:30", Position: 2, FromDate: ptr("2026-10-17")},
				{ID: "f3", Weekdays: "4", Start: "15:00", End: "14:00", Position: 3},
				{ID: "f4", Weekdays: "4", Start: "16:00", End: "17:00", Position: 4, DeletedAt: ptr(9.0)},
			}
		}),
		base("everything together over a week", func(in *Input) {
			in.From, in.To = "2026-10-12", "2026-10-18"
			in.MinMinutes = 60
			in.Events = []Event{meeting("2026-10-12", "09:00", "10:00"), meeting("2026-10-14", "13:00", "17:30"),
				{Start: atZ("2026-10-16", "15:00", "UTC"), End: atZ("2026-10-16", "16:00", "UTC")}}
			in.Frames = []frames.Frame{{ID: "deep", Weekdays: "2,4", Start: "08:00", End: "10:00", Position: 1}}
			in.Slots = []Slot{{Date: "2026-10-13", Start: "16:00", Minutes: 45}}
			in.Tasks = []Task{{Due: ptr(at("2026-10-15", "11:00")), Estimate: ptr(240)}, {Due: ptr(at("2026-10-18", "10:00"))}}
		}),
		base("a stretch shorter than the minimum is left out", func(in *Input) {
			in.MinMinutes = 61
			in.Events = []Event{meeting("2026-10-15", "09:00", "17:00")}
		}),
		base("a minimum of zero still needs a minute", func(in *Input) {
			in.MinMinutes = 0
			in.Events = []Event{meeting("2026-10-15", "08:01", "17:59")}
		}),
		base("today starts at now, rounded up to a quarter hour", func(in *Input) {
			in.From, in.To = "2026-10-14", "2026-10-16"
			in.Today, in.Now = "2026-10-15", 13*60+7
		}),
		base("today after the working day has nothing left", func(in *Input) {
			in.Today, in.Now = "2026-10-15", 19*60
		}),
		base("today before the working day starts at its start", func(in *Input) {
			in.Today, in.Now = "2026-10-15", 6*60
			in.Events = []Event{meeting("2026-10-15", "07:00", "08:30")}
		}),
		base("a whole working day", func(in *Input) {
			in.DayStart, in.DayEnd = 0, 24*60
			in.MinMinutes = 15
			in.Events = []Event{meeting("2026-10-15", "00:00", "06:00"), meeting("2026-10-15", "22:00", "23:59")}
		}),
		base("a spring-forward gap moves a zoned event to the transition", func(in *Input) {
			in.Zone = "Europe/Berlin"
			in.From, in.To = "2026-03-29", "2026-03-29"
			in.DayStart, in.DayEnd = 0, 6*60
			in.MinMinutes = 15
			// 02:30 does not exist in Berlin that night; it is read as 03:00.
			in.Events = []Event{{Start: atZ("2026-03-29", "02:30", "Europe/Berlin"), End: atZ("2026-03-29", "04:00", "Europe/Berlin")}}
		}),
	}
}

func compute(t *testing.T, cs []vectorCase) []vectorCase {
	t.Helper()
	out := make([]vectorCase, len(cs))
	for i, c := range cs {
		days, err := Compute(c.Input)
		if err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		c.Days = days
		out[i] = c
	}
	return out
}

func TestVectors(t *testing.T) {
	got := compute(t, cases())
	if *update {
		f := vectorFile{
			Comment: "Free time (OpenSpec change assistant-time-blocks, design D1): shared by internal/freetime and web/src/lib/freeTime.ts; written by `go test ./internal/freetime -update`. " +
				"Each day of from..to is free within [day_start, day_end) (minutes) except where a timed, non-free event (zoned points read in zone, clipped to the day), a frame occurrence, a slot or an open timed task (its estimate, else 30 minutes, cut at midnight) takes time. " +
				"Stretches shorter than min_minutes (at least 1) are left out. With today, earlier days have nothing and today starts at now rounded up to 15 minutes.",
			Cases: got,
		}
		raw, err := json.MarshalIndent(f, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(vectorsPath, append(raw, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := os.ReadFile(vectorsPath)
	if err != nil {
		t.Fatal(err)
	}
	var f vectorFile
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(f.Cases, got) {
		t.Fatalf("%s is stale; run go test ./internal/freetime -update", vectorsPath)
	}
}

// TestScenarios pins outcomes by hand: the spec's two free hours and a few edges.
func TestScenarios(t *testing.T) {
	want := map[string]string{
		"two meetings, two hours at least (the spec's scenario)":     "2026-10-15 11:00-13:00 15:00-18:00",
		"two meetings, half an hour at least":                        "2026-10-15 08:00-09:00 11:00-13:00 15:00-18:00",
		"a zoned event is read in the viewer's zone":                 "2026-10-15 08:00-13:00 14:00-18:00",
		"a zoned event moves to the viewer's previous day":           "2026-10-14 08:00-16:00 | 2026-10-15 08:00-18:00",
		"an event across midnight takes the start of the next day":   "2026-10-14 08:00-17:00 | 2026-10-15 09:30-18:00",
		"today starts at now, rounded up to a quarter hour":          "2026-10-14 | 2026-10-15 13:15-18:00 | 2026-10-16 08:00-18:00",
		"timed tasks take their estimate, or half an hour":           "2026-10-15 08:00-09:00 10:30-14:00 14:30-16:00 16:30-18:00",
		"a task late in the evening is cut at midnight":              "2026-10-15 20:00-23:00",
		"a spring-forward gap moves a zoned event to the transition": "2026-03-29 00:00-03:00 04:00-06:00",
	}
	for _, c := range compute(t, cases()) {
		w, ok := want[c.Name]
		if !ok {
			continue
		}
		var parts []string
		for _, d := range c.Days {
			s := d.Date
			for _, f := range d.Free {
				s += " " + f.Start + "-" + f.End
			}
			parts = append(parts, s)
		}
		if got := strings.Join(parts, " | "); got != w {
			t.Errorf("%s: got %q, want %q", c.Name, got, w)
		}
		delete(want, c.Name)
	}
	if len(want) > 0 {
		t.Errorf("cases missing: %v", want)
	}
}

func TestRange(t *testing.T) {
	for _, in := range []Input{{From: "2026-10-15", To: "2026-10-14"}, {From: "x", To: "2026-10-14"}, {From: "2026-10-01", To: "2026-10-15"}} {
		if _, err := Compute(in); err == nil {
			t.Errorf("%+v: no error", in)
		}
	}
	if days, err := Compute(Input{From: "2026-10-01", To: "2026-10-14", DayStart: 0, DayEnd: 60}); err != nil || len(days) != 14 {
		t.Errorf("14 days: %v %d", err, len(days))
	}
}
