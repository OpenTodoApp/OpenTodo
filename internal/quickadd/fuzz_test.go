package quickadd

import (
	"encoding/json"
	"os"
	"regexp"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/recurrence"
)

var (
	fuzzDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	fuzzTime = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)
)

// FuzzParse: quick add reads lines from the CLI, email subjects, the browser
// extension and every importer. Whatever the line, the parser must not panic, its
// marks must be spans of the line, and every value it returns must be one the
// sync layer accepts (a real calendar date, a wall time, a valid rule).
func FuzzParse(f *testing.F) {
	ctxs := []Context{{Today: "2026-10-09", Now: "10:00", Languages: []string{"en"}, Projects: []Project{{ID: "p-home", Name: "Home"}}}}
	if raw, err := os.ReadFile("../../web/src/lib/nlp/quickadd.vectors.json"); err == nil {
		var file struct {
			Cases []struct {
				Line string  `json:"line"`
				Ctx  Context `json:"ctx"`
			} `json:"cases"`
		}
		if json.Unmarshal(raw, &file) == nil {
			for _, c := range file.Cases {
				f.Add(c.Line, uint8(len(ctxs)))
				ctxs = append(ctxs, c.Ctx)
			}
		}
	}
	for _, line := range []string{"", "\"", "every", "#", "@", "!!1", "tomorrow at 25:99", "remind me 2h before every last friday until 31 feb", "  📅   morgen 9 Uhr"} {
		f.Add(line, uint8(0))
	}
	f.Fuzz(func(t *testing.T, line string, ci uint8) {
		ctx := ctxs[int(ci)%len(ctxs)]
		r, marks := ParseMarked(line, ctx)
		last := 0
		for _, m := range marks {
			s := m.Span
			if s.Start < 0 || s.End < s.Start || s.End > len(line) || line[s.Start:s.End] != s.Text {
				t.Fatalf("mark %s span %+v is not a span of %q", m.Kind, s, line)
			}
			if s.Start < last {
				t.Fatalf("marks out of order: %+v", marks)
			}
			last = s.Start
		}
		if utf8.ValidString(line) && !utf8.ValidString(r.Title) {
			t.Fatalf("title %q of a UTF-8 line is not UTF-8", r.Title)
		}
		if len(r.Title) > len(line) {
			t.Fatalf("title %q longer than the line %q", r.Title, line)
		}
		checkDate := func(what, d string) {
			if d == "" {
				return
			}
			if _, err := time.Parse("2006-01-02", d); err != nil || !fuzzDate.MatchString(d) {
				t.Fatalf("%s %q is not a calendar date (line %q)", what, d, line)
			}
		}
		if r.Due != nil {
			checkDate("due", r.Due.Date)
			if r.Due.Date == "" {
				t.Fatalf("due without a date (line %q)", line)
			}
			if r.Due.Time != "" && !fuzzTime.MatchString(r.Due.Time) {
				t.Fatalf("due time %q (line %q)", r.Due.Time, line)
			}
		}
		checkDate("deadline", r.Deadline)
		if r.Priority < 0 || r.Priority > 4 {
			t.Fatalf("priority %d (line %q)", r.Priority, line)
		}
		if r.EstimateMinutes < 0 || r.SpentMinutes < 0 {
			t.Fatalf("negative minutes %d/%d (line %q)", r.EstimateMinutes, r.SpentMinutes, line)
		}
		if r.Recurrence != "" {
			if _, err := recurrence.Parse(r.Recurrence); err != nil {
				t.Fatalf("recurrence %q does not parse: %v (line %q)", r.Recurrence, err, line)
			}
		}
		for _, l := range r.Labels {
			if l == "" {
				t.Fatalf("empty label (line %q)", line)
			}
		}
		for _, rem := range r.Reminders {
			if rem.Date != nil {
				checkDate("reminder date", *rem.Date)
			}
			if rem.Time != "" && !fuzzTime.MatchString(rem.Time) {
				t.Fatalf("reminder time %q (line %q)", rem.Time, line)
			}
		}
	})
}
