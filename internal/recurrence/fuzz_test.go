package recurrence

import (
	"encoding/json"
	"os"
	"testing"
)

// FuzzParse: rules arrive from every client, CalDAV, the importers and the
// vault. Parse must not panic; a rule it accepts has a stable canonical form,
// and its next occurrence is a real date after the due date and not before
// today, on a weekday the rule allows. The dates are fuzzed too, within years
// 1900–2199 so the result stays a four-digit year.
func FuzzParse(f *testing.F) {
	raw, err := os.ReadFile("../../web/src/lib/recurrence.vectors.json")
	if err != nil {
		f.Fatal(err)
	}
	var vec struct {
		Parse []struct {
			Input string `json:"input"`
		} `json:"parse"`
		Next []struct {
			Rule  string `json:"rule"`
			Due   string `json:"due"`
			Today string `json:"today"`
		} `json:"next"`
	}
	if err := json.Unmarshal(raw, &vec); err != nil {
		f.Fatal(err)
	}
	day := func(s string) uint32 {
		z, ok := parseDate(s)
		if !ok {
			return 0
		}
		lo, _ := parseDate("1900-01-01")
		return uint32(z - lo)
	}
	for _, p := range vec.Parse {
		f.Add(p.Input, uint32(46000), uint32(46000))
	}
	for _, n := range vec.Next {
		f.Add(n.Rule, day(n.Due), day(n.Today))
	}
	lo, _ := parseDate("1900-01-01")
	hi, _ := parseDate("2199-12-31")
	span := uint32(hi - lo + 1)
	f.Fuzz(func(t *testing.T, input string, dueDay, todayDay uint32) {
		r, err := Parse(input)
		if err != nil {
			return
		}
		canon := r.Canonical()
		again, err := Canonicalize(canon)
		if err != nil || again != canon {
			t.Fatalf("canonical form %q of %q is not stable: %q, %v", canon, input, again, err)
		}
		if back, ok := FromRRULE(r.RRULE(), ""); ok && back.Canonical() != canon && !r.afterCompletion {
			t.Fatalf("RRULE %q of %q reads back as %q", r.RRULE(), canon, back.Canonical())
		}
		due := formatDate(lo + int(dueDay%span))
		today := formatDate(lo + int(todayDay%span))
		next, err := r.Next(due, today)
		if err != nil {
			t.Fatalf("Next(%q, %q) of %q: %v", due, today, canon, err)
		}
		z, ok := parseDate(next)
		if !ok {
			t.Fatalf("Next(%q, %q) of %q = %q, not a date", due, today, canon, next)
		}
		if next <= due || next < today {
			t.Fatalf("Next(%q, %q) of %q = %q, not after due and today", due, today, canon, next)
		}
		if (r.kind == kWeekday || r.kind == kWeekdays) && r.days&(1<<isoWeekday(z)) == 0 {
			t.Fatalf("Next of %q = %q falls on weekday %d", canon, next, isoWeekday(z))
		}
		if r.kind == kNthWeekday && isoWeekday(z) != r.weekday {
			t.Fatalf("Next of %q = %q falls on weekday %d", canon, next, isoWeekday(z))
		}
		if _, err := r.Preview(due, today, 0, 3); err != nil {
			t.Fatalf("Preview of %q: %v", canon, err)
		}
	})
}
