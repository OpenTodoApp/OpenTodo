package filter

import (
	"errors"
	"os"
	"regexp"
	"strings"
	"testing"
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
		"@waiting & !someday", "deferred & start <= 6 days", "#Home & evening", "no start", "start after 2026-10-20",
		"completed = last week", "completed >= this month & p1", "completed before yesterday", "due = next week",
		"created = 2 months ago", "deadline < 1 week ago", "start <= next month", "!(completed > 3 weeks ago) | open",
		"completed", "p1 & completed", "COMPLETED AFTER 2026-10-01",
	} {
		if err := Parse(q); err != nil {
			t.Errorf("%q: %v", q, err)
		}
	}
}

func TestFilterParserMatchesDocsErrorTable(t *testing.T) {
	doc := readDocs(t)
	section := doc[strings.Index(doc, "## Errors"):strings.Index(doc, "## The Filter view")]
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
		"p1 )":               `Unexpected ")" at position 4`,
		"(p1 p2)":            `Expected "&", "|" or ")" before "p2" at position 5`,
		"!":                  `Expected a term after "!" at position 1`,
		"()":                 `Expected a term after "(" at position 1`,
		`"loose text"`:       `Unexpected text "loose text" at position 1; quote names after "@" or "#", or use search:`,
		"no idea":            `Expected "date", "project", "labels", "time", "deadline" or "start" after "no" at position 1`,
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
