package recurrence

import (
	"encoding/json"
	"errors"
	"os"
	"regexp"
	"strings"
	"testing"
)

// The vectors are shared with web/src/lib/recurrence.test.ts so the Go and
// TypeScript implementations cannot drift apart.
const vectorsPath = "../../web/src/lib/recurrence.vectors.json"

type vectors struct {
	Parse []struct {
		Input     string `json:"input"`
		Canonical string `json:"canonical"`
		Error     bool   `json:"error"`
	} `json:"parse"`
	Next []struct {
		Name        string  `json:"name"`
		Rule        string  `json:"rule"`
		Due         *string `json:"due"`
		Today       string  `json:"today"`
		CompletedOn *string `json:"completedOn"`
		Done        int     `json:"done"`
		Expected    *string `json:"expected"`
	} `json:"next"`
	First []struct {
		Rule     string `json:"rule"`
		From     string `json:"from"`
		Expected string `json:"expected"`
	} `json:"first"`
	Preview []struct {
		Name     string   `json:"name"`
		Rule     string   `json:"rule"`
		Due      *string  `json:"due"`
		Today    string   `json:"today"`
		Done     int      `json:"done"`
		Expected []string `json:"expected"`
	} `json:"preview"`
	Deadline []struct {
		Name     string `json:"name"`
		Deadline string `json:"deadline"`
		From     string `json:"from"`
		To       string `json:"to"`
		Expected string `json:"expected"`
	} `json:"deadline"`
}

func loadVectors(t *testing.T) vectors {
	t.Helper()
	raw, err := os.ReadFile(vectorsPath)
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var v vectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if len(v.Parse) == 0 || len(v.Next) < 60 || len(v.First) == 0 || len(v.Preview) == 0 {
		t.Fatalf("vector file looks truncated: %d parse, %d next, %d first, %d preview", len(v.Parse), len(v.Next), len(v.First), len(v.Preview))
	}
	return v
}

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func TestRecurrenceVectors(t *testing.T) {
	v := loadVectors(t)
	for _, c := range v.Parse {
		r, err := Parse(c.Input)
		if c.Error {
			if err == nil {
				t.Errorf("Parse(%q) = %q, want error", c.Input, r.Canonical())
			} else if !errors.Is(err, ErrInvalid) {
				t.Errorf("Parse(%q) error %v does not wrap ErrInvalid", c.Input, err)
			}
			continue
		}
		if err != nil {
			t.Errorf("Parse(%q): %v", c.Input, err)
			continue
		}
		if got := r.Canonical(); got != c.Canonical {
			t.Errorf("Parse(%q).Canonical() = %q, want %q", c.Input, got, c.Canonical)
		}
		// The canonical form is a fixed point.
		if again, err := Canonicalize(c.Canonical); err != nil || again != c.Canonical {
			t.Errorf("Canonicalize(%q) = %q, %v; want a fixed point", c.Canonical, again, err)
		}
	}
	for _, c := range v.Next {
		r, err := Parse(c.Rule)
		if err != nil {
			t.Errorf("%s: Parse(%q): %v", c.Name, c.Rule, err)
			continue
		}
		completedOn := str(c.CompletedOn)
		if completedOn == "" {
			completedOn = c.Today
		}
		next, ok, err := r.Following(str(c.Due), c.Today, completedOn, c.Done)
		if err != nil {
			t.Errorf("%s: %v", c.Name, err)
			continue
		}
		switch {
		case c.Expected == nil && ok:
			t.Errorf("%s: got %s, want the series to end", c.Name, next)
		case c.Expected != nil && (!ok || next != *c.Expected):
			t.Errorf("%s: got %q (ok=%v), want %q", c.Name, next, ok, *c.Expected)
		}
	}
	for _, c := range v.First {
		r, err := Parse(c.Rule)
		if err != nil {
			t.Fatalf("Parse(%q): %v", c.Rule, err)
		}
		if got, err := r.First(c.From); err != nil || got != c.Expected {
			t.Errorf("First(%q, %s) = %q, %v; want %q", c.Rule, c.From, got, err, c.Expected)
		}
	}
	for _, c := range v.Preview {
		r, err := Parse(c.Rule)
		if err != nil {
			t.Fatalf("Parse(%q): %v", c.Rule, err)
		}
		got, err := r.Preview(str(c.Due), c.Today, c.Done, 3)
		if err != nil || strings.Join(got, ",") != strings.Join(c.Expected, ",") {
			t.Errorf("%s: Preview = %v, %v; want %v", c.Name, got, err, c.Expected)
		}
	}
}

func TestParseRejectsInvalid(t *testing.T) {
	for _, in := range []string{
		"every blursday", "every", "weekly", "every 2", "every day until 2026-02-29", "every last weekday after completion",
		"every " + strings.Repeat("day ", 60), "every 5th friday", "every mon,, wed", "every day for -1 times",
	} {
		if _, err := Parse(in); !errors.Is(err, ErrInvalid) {
			t.Errorf("Parse(%q) error = %v, want ErrInvalid", in, err)
		}
	}
	if _, err := Parse("every day" + strings.Repeat(" ", MaxLen)); err == nil {
		t.Error("a rule longer than MaxLen must be rejected even when it only pads whitespace")
	}
}

func TestNextRejectsBadDates(t *testing.T) {
	r, _ := Parse("every day")
	if _, err := r.Next("2026-02-30", "2026-10-10"); err == nil {
		t.Error("an impossible due date must be an error")
	}
	if _, err := r.Next("", "yesterday"); err == nil {
		t.Error("a malformed today must be an error")
	}
	cal, _ := Parse("every monday")
	if _, err := cal.NextAfterCompletion("2026-10-10"); err == nil {
		t.Error("a calendar pattern is not completion-relative")
	}
}

func TestDayNumbersRoundTrip(t *testing.T) {
	// Every day from 1600 to 2400 survives the civil <-> day-number round trip and
	// weekdays advance by one, which is what makes the calculator time-zone free.
	start := daysFromCivil(1600, 1, 1)
	end := daysFromCivil(2400, 12, 31)
	prevWD := isoWeekday(start - 1)
	for z := start; z <= end; z++ {
		y, m, d := civilFromDays(z)
		if daysFromCivil(y, m, d) != z || d > monthLen(y, m) {
			t.Fatalf("round trip failed at %d (%04d-%02d-%02d)", z, y, m, d)
		}
		wd := isoWeekday(z)
		if wd != prevWD%7+1 {
			t.Fatalf("weekday did not advance at %04d-%02d-%02d", y, m, d)
		}
		prevWD = wd
	}
	if formatDate(0) != "1970-01-01" || isoWeekday(0) != 4 {
		t.Fatal("epoch must be Thursday 1970-01-01")
	}
}

// TestDocumentedExamplesAreVectors keeps docs/recurrence.md honest: every rule
// quoted there must be exercised by the shared vectors.
func TestDocumentedExamplesAreVectors(t *testing.T) {
	v := loadVectors(t)
	known := map[string]bool{}
	for _, c := range v.Parse {
		known[c.Input] = true
		known[c.Canonical] = true
	}
	for _, c := range v.Next {
		known[c.Rule] = true
	}
	for _, c := range v.First {
		known[c.Rule] = true
	}
	for _, c := range v.Preview {
		known[c.Rule] = true
	}
	doc, err := os.ReadFile("../../docs/recurrence.md")
	if err != nil {
		t.Fatal(err)
	}
	examples := regexp.MustCompile("`([Ee]very [^`]*)`").FindAllStringSubmatch(string(doc), -1)
	if len(examples) < 20 {
		t.Fatalf("found only %d examples in docs/recurrence.md", len(examples))
	}
	for _, m := range examples {
		if !known[m[1]] {
			t.Errorf("docs/recurrence.md example %q is not in the shared vectors", m[1])
		}
	}
}

// TestShiftDateVectors: a series deadline moves by the same days as its due date
// (OpenSpec change deadlines, design D8), shared with recurring.test.ts.
func TestShiftDateVectors(t *testing.T) {
	v := loadVectors(t)
	if len(v.Deadline) == 0 {
		t.Fatal("no deadline vectors")
	}
	for _, c := range v.Deadline {
		if got := ShiftDate(c.Deadline, c.From, c.To); got != c.Expected {
			t.Errorf("%s: ShiftDate(%s, %s, %s) = %s, want %s", c.Name, c.Deadline, c.From, c.To, got, c.Expected)
		}
	}
	if got := ShiftDate("bad", "2026-10-01", "2026-10-02"); got != "bad" {
		t.Errorf("invalid input changed: %s", got)
	}
}
