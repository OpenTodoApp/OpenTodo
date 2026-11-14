package sync

import (
	"context"
	"testing"
)

// OpenSpec change daily-notes, task 1.2: "Forged day", "Two devices offline"
// and a day that never changes once written.

func TestDailyNoteDayIsTheAuthorsOwn(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	day := "2026-11-12"
	// Forged day: a random id refused, the note unchanged on every device.
	res, err := s.Apply(ctx, "u1", []Op{
		op("f1", "note", "random-note", "title", `"Mine"`, 100, "A"),
		op("f2", "note", "random-note", "day", `"`+day+`"`, 100, "A"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Rejected) != 1 || res.Rejected[0].Reason != ReasonInvalidDay {
		t.Fatalf("rejected = %+v, want the forged day", res.Rejected)
	}
	if e, _ := s.Get(ctx, "u1", "note", "random-note"); StringOf(e["day"]) != "" {
		t.Fatalf("day = %s on a random note", e["day"])
	}
	// Another user's daily-note id is refused too: the id names u2, the op is u1's.
	other := DailyNoteID("u2", day)
	if res, _ := s.Apply(ctx, "u1", []Op{op("g1", "note", other, "day", `"`+day+`"`, 100, "A")}); len(res.Rejected) != 1 {
		t.Fatalf("u1 claimed u2's daily note: %+v", res)
	}
	// Not a calendar date: refused.
	bad := DailyNoteID("u1", "2026-02-30")
	if res, _ := s.Apply(ctx, "u1", []Op{op("h1", "note", bad, "day", `"2026-02-30"`, 100, "A")}); len(res.Rejected) != 1 {
		t.Fatalf("an impossible day was accepted: %+v", res)
	}

	// Two devices offline: both create the note of the day with the same text,
	// then each adds its own line as a later edit; one note, text once.
	id := DailyNoteID("u1", day)
	create := func(dev string, ts int64) []Op {
		return []Op{
			op(dev+"1", "note", id, "title", `"12 November"`, ts, dev),
			op(dev+"2", "note", id, "day", `"`+day+`"`, ts, dev),
			op(dev+"3", "note", id, "description", `"## Today\n"`, ts, dev),
		}
	}
	for _, batch := range [][]Op{create("L", 200), create("P", 210)} {
		if res, err := s.Apply(ctx, "u1", batch); err != nil || len(res.Rejected) != 0 {
			t.Fatalf("create = %+v, %v", res, err)
		}
	}
	notes, err := s.List(ctx, "u1", "note", false)
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, e := range notes {
		if StringOf(e["day"]) == day {
			n++
			if StringOf(e["description"]) != "## Today\n" {
				t.Fatalf("description = %q, want the template text once", StringOf(e["description"]))
			}
		}
	}
	if n != 1 {
		t.Fatalf("%d notes for %s, want one", n, day)
	}
	// The day never changes and is never cleared.
	for i, v := range []string{`"2026-11-13"`, `""`} {
		if res, _ := s.Apply(ctx, "u1", []Op{op("x"+string(rune('0'+i)), "note", id, "day", v, 300, "L")}); len(res.Rejected) != 1 {
			t.Fatalf("day changed to %s", v)
		}
	}
	// The same value again is fine.
	if res, _ := s.Apply(ctx, "u1", []Op{op("y1", "note", id, "day", `"`+day+`"`, 400, "L")}); len(res.Rejected) != 0 {
		t.Fatalf("same day refused: %+v", res.Rejected)
	}
}

// The id is pinned on both sides (web/src/lib/dailyNotes.test.ts).
func TestDailyNoteIDVector(t *testing.T) {
	if got := DailyNoteID("u1", "2026-11-12"); got != "6f0c9949-ee25-8d73-9da1-0a7e22bd7396" {
		t.Fatalf("DailyNoteID = %s", got)
	}
}
