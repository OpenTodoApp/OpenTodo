package ruleval

import (
	"cmp"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/textutil"
)

// The data steps (design D4, "Notes and text" and "Lists and logic") as pure
// functions. web/src/lib/rules/stepData.ts is the same code; both run the
// "data" vectors of web/src/lib/rules/steps.vectors.json.

// CutText cuts a text to MaxTextBytes on a character boundary and reports
// whether it was cut (the step is then recorded `truncated`).
func CutText(s string) (string, bool) {
	out := textutil.Truncate(s, MaxTextBytes)
	return out, len(out) < len(s)
}

var (
	listMarkerRe = regexp.MustCompile(`^(?:[-*+]|\d{1,9}[.)])(?:\s+|$)`)
	checkboxRe   = regexp.MustCompile(`^\[[ xX]\](?:\s+|$)`)
)

// SplitLines splits a text into its non-empty, trimmed lines with list
// markers and checkboxes removed, at most MaxListItems (truncated when more).
func SplitLines(text string) ([]string, bool) { return splitLines(text, false) }

// SplitOpenCheckboxes is SplitLines keeping only the lines that are open
// checkboxes ("- [ ] book room"), for meeting notes (routines-dynamic-data D5).
func SplitOpenCheckboxes(text string) ([]string, bool) { return splitLines(text, true) }

func splitLines(text string, openOnly bool) ([]string, bool) {
	out := []string{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		line = strings.TrimSpace(listMarkerRe.ReplaceAllString(line, ""))
		if openOnly && !strings.HasPrefix(line, "[ ]") {
			continue
		}
		line = strings.TrimSpace(checkboxRe.ReplaceAllString(line, ""))
		if line == "" {
			continue
		}
		if len(out) == MaxListItems {
			return out, true
		}
		out = append(out, line)
	}
	return out, false
}

// JoinLines joins lines with a separator (a new line when empty).
func JoinLines(lines []string, sep string) string {
	if sep == "" {
		sep = "\n"
	}
	return strings.Join(lines, sep)
}

// FormatTemplate replaces each {id} placeholder that vals holds by its text;
// any other text, braces included, stays as written.
func FormatTemplate(template string, vals map[string]string) string {
	return placeholderRe.ReplaceAllStringFunc(template, func(m string) string {
		if v, ok := vals[m[1:len(m)-1]]; ok {
			return v
		}
		return m
	})
}

// ReplaceText replaces every occurrence of find (plain text, never a pattern)
// by with; matchCase false compares letters ignoring case.
func ReplaceText(text, find, with string, matchCase bool) string {
	if find == "" {
		return text
	}
	if matchCase {
		return strings.ReplaceAll(text, find, with)
	}
	src, pat := []rune(text), []rune(strings.ToLower(find))
	low := []rune(strings.ToLower(text))
	if len(low) != len(src) {
		// A letter whose lower case has another length: compare rune by rune.
		low = make([]rune, len(src))
		for i, r := range src {
			low[i] = []rune(strings.ToLower(string(r)))[0]
		}
	}
	var b strings.Builder
	for i := 0; i < len(src); {
		if i+len(pat) <= len(src) && slices.Equal(low[i:i+len(pat)], pat) {
			b.WriteString(with)
			i += len(pat)
			continue
		}
		b.WriteRune(src[i])
		i++
	}
	return b.String()
}

// containsFold reports whether s contains sub ignoring case.
func containsFold(s, sub string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(sub))
}

// FilterLines keeps the lines that contain (or, with not, do not contain) a text, ignoring case.
func FilterLines(lines []string, text string, not bool) []string {
	out := []string{}
	for _, l := range lines {
		if containsFold(l, text) != not {
			out = append(out, l)
		}
	}
	return out
}

// SortLines sorts lines alphabetically ignoring case (code point order), stably.
func SortLines(lines []string, desc bool) []string {
	out := slices.Clone(lines)
	slices.SortStableFunc(out, func(a, b string) int {
		c := strings.Compare(strings.ToLower(a), strings.ToLower(b))
		if desc {
			return -c
		}
		return c
	})
	return out
}

// SortTask is what sorting tasks reads.
type SortTask struct {
	ID       string `json:"id"`
	Title    string `json:"title,omitempty"`
	Due      string `json:"due,omitempty"`
	Deadline string `json:"deadline,omitempty"`
	Priority int    `json:"priority,omitempty"`
	Created  int64  `json:"created_at,omitempty"`
}

// SortTasks orders tasks by due, deadline, priority, created or title; tasks
// without a date come last either way, ties keep their order.
func SortTasks(tasks []SortTask, by string, desc bool) []SortTask {
	out := slices.Clone(tasks)
	dir := 1
	if desc {
		dir = -1
	}
	date := func(a, b string) int {
		switch {
		case a == b:
			return 0
		case a == "":
			return 1
		case b == "":
			return -1
		}
		return dir * strings.Compare(a, b)
	}
	slices.SortStableFunc(out, func(a, b SortTask) int {
		switch by {
		case "due":
			return date(a.Due, b.Due)
		case "deadline":
			return date(a.Deadline, b.Deadline)
		case "priority":
			pa, pb := a.Priority, b.Priority
			if pa == 0 {
				pa = 4
			}
			if pb == 0 {
				pb = 4
			}
			return dir * cmp.Compare(pa, pb)
		case "created":
			return dir * cmp.Compare(a.Created, b.Created)
		case "title":
			return dir * strings.Compare(strings.ToLower(a.Title), strings.ToLower(b.Title))
		}
		return 0
	})
	return out
}

// Take keeps the first (or last) n items.
func Take[T any](list []T, n int, fromEnd bool) []T {
	if n >= len(list) {
		return slices.Clone(list)
	}
	if n < 0 {
		n = 0
	}
	if fromEnd {
		return slices.Clone(list[len(list)-n:])
	}
	return slices.Clone(list[:n])
}

// RenderNumber writes a number in decimal (no exponent, no trailing zeros).
func RenderNumber(n float64) string { return strconv.FormatFloat(n, 'f', -1, 64) }

// Value is a step's output while a routine runs.
type Value struct {
	Type   Type     `json:"type"`
	Text   string   `json:"text,omitempty"`
	Lines  []string `json:"lines,omitempty"`
	IDs    []string `json:"ids,omitempty"` // tasks
	ID     string   `json:"id,omitempty"`  // task or project
	Date   string   `json:"date,omitempty"`
	Number float64  `json:"number,omitempty"`
}

// Len is a list's length (1 for a set single value, 0 for an empty one).
func (v Value) Len() int {
	switch v.Type {
	case TTasks:
		return len(v.IDs)
	case TLines:
		return len(v.Lines)
	case TTask, TProject:
		if v.ID == "" {
			return 0
		}
	case TText:
		if strings.TrimSpace(v.Text) == "" {
			return 0
		}
	case TNone:
		return 0
	}
	return 1
}

// Holds evaluates an If step's test on a value: numbers and dates compare in
// order, a list compares its count, a text is equal or contains a text
// (ignoring case), and empty means no text, no item or no list entry.
func Holds(v Value, c Compare) bool {
	switch c.Op {
	case "empty":
		return v.Type != TNumber && v.Type != TDate && v.Len() == 0
	case "not_empty":
		return v.Type == TNumber || v.Type == TDate || v.Len() > 0
	case "contains":
		switch v.Type {
		case TText:
			return containsFold(v.Text, *c.Text)
		case TLines:
			return slices.ContainsFunc(v.Lines, func(l string) bool { return containsFold(l, *c.Text) })
		}
		return false
	}
	var order int
	switch {
	case v.Type == TNumber && c.Number != nil:
		order = cmp.Compare(v.Number, *c.Number)
	case (v.Type == TTasks || v.Type == TLines) && c.Number != nil:
		order = cmp.Compare(float64(v.Len()), *c.Number)
	case v.Type == TDate && c.Text != nil && validDate(*c.Text):
		order = strings.Compare(v.Date, *c.Text)
	case v.Type == TText && c.Text != nil && (c.Op == "=" || c.Op == "!="):
		order = strings.Compare(v.Text, *c.Text)
	default:
		return false
	}
	switch c.Op {
	case ">":
		return order > 0
	case ">=":
		return order >= 0
	case "=":
		return order == 0
	case "!=":
		return order != 0
	case "<=":
		return order <= 0
	case "<":
		return order < 0
	}
	return false
}
