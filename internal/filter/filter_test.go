package filter

import (
	"encoding/json"
	"errors"
	"os"
	"regexp"
	"strings"
	"testing"
	"unicode/utf8"
)

// docs/filters.md is the examples file shared with web/src/lib/filter/filter.test.ts.
func readDocs(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile("../../docs/filters.md")
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestFilterParserAcceptsDocsExamples(t *testing.T) {
	doc := readDocs(t)
	blocks := regexp.MustCompile("(?s)```filter\n(.*?)```").FindAllStringSubmatch(doc, -1)
	if len(blocks) < 10 {
		t.Fatalf("docs/filters.md has %d worked examples, want at least 10", len(blocks))
	}
	for _, b := range blocks {
		q := strings.TrimSpace(b[1])
		if err := Parse(q); err != nil {
			t.Errorf("%q: %v", q, err)
		}
	}
	// The grammar examples quoted in prose, plus a few edge forms.
	for _, q := range []string{
		"@work & due <= tomorrow & p1", "@errand | @call & p1", "(@errand | @call) & p1", "due<=tomorrow",
		`#"Client A"`, `@"follow up"`, "p1 & completed", "completed | open", "due = today", "due <= today",
		"", "   ", "!!p1", "##Work & !(#Home | no project)", "search:milk", `search: "oat milk"`, "SEARCH: x",
		"created > 7 days ago", "due before monday", "due after 2026-02-28", "P2", `@"a \"quoted\" name"`,
		"no date | no time | no labels", "@Café & #プロジェクト",
		"deadline <= 3 days", "#Work & no deadline", "deadline >= today & no date", "deadline before friday",
		"@waiting & !someday", "deferred & start <= 6 days", "#Home & evening", "#Home & morning", "today & afternoon", "no start", "start after 2026-10-20",
		"completed = last week", "completed >= this month & p1", "completed before yesterday", "due = next week",
		"created = 2 months ago", "deadline < 1 week ago", "start <= next month", "!(completed > 3 weeks ago) | open",
		"completed", "p1 & completed", "COMPLETED AFTER 2026-10-01",
		// Custom field terms (custom-fields).
		"cost > 100", `client = "Acme"`, `"Order date" <= friday & cost > 100`, "no cost", `no "Order date"`, "done = true",
		// Origin terms (task-origin).
		"origin", "no origin", "origin: github", "origin:github", `origin: "my tracker"`, "origin: url | origin: email",
		"no origin & #Work", "origin: github & open", "!origin",
		// Energy terms (task-energy).
		"energy", "no energy", "energy: deep", "energy:LOW", `energy: "medium"`, "energy: low & unblocked & today", "energy: deep & #Work", `"energy" = 3`,
		// Workspace terms (group-mentions).
		"workspace: Home", "workspace:Home", `workspace:"Side projects"`, `workspace: "Side projects" & p1`, "WORKSPACE: work",
		"(workspace: Home | workspace: Work) & due = this week", "!workspace: Home", "workspace: home & no project",
		"paid = false", "cost >= -2.5", "status = Ordered", "due_by <= 3 days", `"due" = 2026-10-16`, "no idea", "kitchen = this week",
	} {
		if err := Parse(q); err != nil {
			t.Errorf("%q: %v", q, err)
		}
	}
}

// The queries the web filter builder writes (OpenSpec filter-builder D2), printed
// by web/src/lib/filter/builder.ts: the server must accept every one it saves.
func TestFilterParserAcceptsFormatted(t *testing.T) {
	b, err := os.ReadFile("testdata/formatted.txt")
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, line := range strings.Split(string(b), "\n") {
		if line == "" || strings.HasPrefix(line, "# ") {
			continue
		}
		n++
		if err := Parse(line); err != nil {
			t.Errorf("%q: %v", line, err)
		}
	}
	if n < 150 {
		t.Fatalf("testdata/formatted.txt has %d queries, want at least 150", n)
	}
}

func TestFilterParserMatchesDocsErrorTable(t *testing.T) {
	doc := readDocs(t)
	section := doc[strings.Index(doc, "## Errors"):strings.Index(doc, "## The New view page")]
	rows := regexp.MustCompile("(?m)^\\| `(.+?)` \\| `(.+?)` \\|$").FindAllStringSubmatch(section, -1)
	if len(rows) < 5 {
		t.Fatalf("error table has %d rows", len(rows))
	}
	for _, r := range rows {
		q, want := strings.ReplaceAll(r[1], `\|`, "|"), strings.ReplaceAll(r[2], `\|`, "|")
		err := Parse(q)
		if err == nil || err.Error() != want {
			t.Errorf("%q: got %v, want %q", q, err, want)
		}
	}
}

func TestFilterParserRejects(t *testing.T) {
	cases := map[string]string{
		"@":                  `Expected a label name after "@" at position 1`,
		"# & p1":             `Expected a project name after "#" at position 1`,
		`@"open`:             `Missing closing quote for the text starting at position 2`,
		"search:":            `Expected text after "search:" at position 1`,
		"origin:":            `Expected a provider or kind after "origin:" at position 1`,
		"workspace:":         `Expected a workspace name after "workspace:" at position 1`,
		"p1 & workspace: ":   `Expected a workspace name after "workspace:" at position 6`,
		`workspace: "Home`:   `Missing closing quote for the text starting at position 12`,
		"origin: & p1":       `Expected a provider or kind after "origin:" at position 1`,
		"origin = x":         `Expected "&" or "|" before "=" at position 8`,
		"energy: high":       "Energy must be deep, medium or low at position 1",
		"p1 & energy:":       "Energy must be deep, medium or low at position 6",
		"energy = deep":      `Expected "&" or "|" before "=" at position 8`,
		"p1 )":               `Unexpected ")" at position 4`,
		"(p1 p2)":            `Expected "&", "|" or ")" before "p2" at position 5`,
		"!":                  `Expected a term after "!" at position 1`,
		"()":                 `Expected a term after "(" at position 1`,
		`"loose text"`:       `Unexpected text "loose text" at position 1; quote names after "@" or "#", or use search:`,
		"no":                 `Expected "date", "project", "labels", "time", "deadline", "start", "origin" or a field name after "no" at position 1`,
		"no & p1":            `Expected "date", "project", "labels", "time", "deadline", "start", "origin" or a field name after "no" at position 1`,
		"cost >":             `Expected a value after ">" at position 6`,
		"cost = last year":   `Expected "week" or "month" after "last" at position 8`,
		"cost 5":             `Unknown term "cost" at position 1`,
		"due < someday":      `Invalid date "someday" at position 7`,
		"due < 2026-02-30":   `Invalid date "2026-02-30" at position 7`,
		"due <":              `Expected a date after "<" at position 5`,
		"created = 3 weeks":  `Expected "ago" after "weeks" at position 13`,
		"created = 3 years":  `Expected "days", "weeks" or "months" after "3" at position 11`,
		"due = this year":    `Expected "week" or "month" after "this" at position 7`,
		"due = next":         `Expected "week" or "month" after "next" at position 7`,
		"completed after":    `Expected a date after "after" at position 11`,
		"completed today":    `Expected "&" or "|" before "today" at position 11`,
		"p0":                 `Priority must be p1, p2, p3 or p4 at position 1`,
		"@work & colour":     `Unknown term "colour" at position 9`,
		"p1 & & p2":          `Expected a term after "&" at position 4`,
		"due = today today ": `Expected "&" or "|" before "today" at position 13`,
	}
	for q, want := range cases {
		err := Parse(q)
		var se *SyntaxError
		if !errors.As(err, &se) {
			t.Errorf("%q: got %v, want a SyntaxError", q, err)
			continue
		}
		if se.Message != want {
			t.Errorf("%q: got %q, want %q", q, se.Message, want)
		}
		if se.Position() != se.Offset+1 {
			t.Errorf("%q: position %d offset %d", q, se.Position(), se.Offset)
		}
	}
}

// Tracked time terms (OpenSpec change time-tracking, design D9).
func TestFilterTrackedTerms(t *testing.T) {
	for _, q := range []string{"tracked", "!tracked & #Work", "tracked > 1h", "tracked <= 1h", "tracked >= 1h30", "tracked < 1.5h",
		"tracked = 0", "tracked > 45min", "tracked > 90", "TRACKED > 30M", "tracked > 10", `"tracked" > 10`, "tracked & due <= today"} {
		if err := Parse(q); err != nil {
			t.Errorf("%q: %v", q, err)
		}
	}
	for q, want := range map[string]string{
		"tracked > soon": `Expected a duration such as 30m or 1h30 after ">" at position 11`,
		"tracked >":      `Expected a duration such as 30m or 1h30 after ">" at position 9`,
		"tracked = 1h75": `Expected a duration such as 30m or 1h30 after "=" at position 11`,
		"tracked > +30m": `Expected a duration such as 30m or 1h30 after ">" at position 11`,
		"tracked today":  `Expected "&" or "|" before "today" at position 9`,
	} {
		if err := Parse(q); err == nil || err.Error() != want {
			t.Errorf("%q: got %v, want %q", q, err, want)
		}
	}
}

type limitVector struct {
	Prefix, Repeat, Suffix, Close string
	Times, CloseTimes             int
	Error                         *string
}

func (v limitVector) query() string {
	return v.Prefix + strings.Repeat(v.Repeat, v.Times) + v.Suffix + strings.Repeat(v.Close, v.CloseTimes)
}

func readLimits(t testing.TB) (maxLen, maxNest int, vectors []limitVector) {
	b, err := os.ReadFile("testdata/limits.json")
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		MaxQueryLength, MaxNesting int
		Vectors                    []limitVector
	}
	if err := json.Unmarshal(b, &doc); err != nil {
		t.Fatal(err)
	}
	return doc.MaxQueryLength, doc.MaxNesting, doc.Vectors
}

// Limits (OpenSpec change filter-limits), vectors shared with the web parser. A
// query of a few million "(" used to recurse until the goroutine stack overflowed,
// which ends the whole process (recover cannot catch it); now it is an ordinary
// syntax error.
func TestFilterLimits(t *testing.T) {
	maxLen, maxNest, vectors := readLimits(t)
	if maxLen != MaxQueryLength || maxNest != MaxNesting {
		t.Fatalf("testdata/limits.json says %d characters and %d levels, the parser %d and %d", maxLen, maxNest, MaxQueryLength, MaxNesting)
	}
	for _, v := range vectors {
		q := v.query()
		err := Parse(q)
		if v.Error == nil {
			if err != nil {
				t.Errorf("%.40q… (%d characters): %v", q, utf8.RuneCountInString(q), err)
			}
			continue
		}
		var se *SyntaxError
		if !errors.As(err, &se) || se.Message != *v.Error {
			t.Errorf("%.40q…: got %v, want %q", q, err, *v.Error)
		}
	}
}

// FuzzParse: any input is accepted or refused with a *SyntaxError; it never
// panics or overflows the stack. Run with: go test ./internal/filter -fuzz FuzzParse
func FuzzParse(f *testing.F) {
	for _, s := range []string{"", "@work & due <= tomorrow & p1", "((p1)", "!!!(p1 | #x)", `"a" > 3`, `search: "x`,
		"tracked > 1h30", "no cost", "due = 3 weeks ago", "workspace: Home & !origin", strings.Repeat("(", 100) + "p1"} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, q string) {
		err := Parse(q)
		if err == nil {
			return
		}
		var se *SyntaxError
		if !errors.As(err, &se) {
			t.Fatalf("%q: %T %v", q, err, err)
		}
		if se.Offset < 0 || se.Offset > max(utf8.RuneCountInString(q), MaxQueryLength) {
			t.Fatalf("%q: offset %d", q, se.Offset)
		}
	})
}
