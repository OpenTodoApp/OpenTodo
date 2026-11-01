// Package filter is a Go port of the filter query tokenizer and parser
// (web/src/lib/filter/parse.ts, grammar in docs/filters.md). The REST API uses it to
// validate saved views (OpenSpec `custom-views`, design D6), and routines evaluate
// a query on the server (evaluate.go, routines-engine). Messages and positions
// match the TypeScript parser, and both test suites run the examples in
// docs/filters.md. Positions count Unicode code points from 1 (the TypeScript parser
// counts UTF-16 units, which differs only for characters outside the BMP).
package filter

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/timetrack"
)

// The limits on a query (OpenSpec change filter-limits), the same as
// MAX_QUERY_LENGTH and MAX_NESTING in web/src/lib/filter/parse.ts. Each "(" and
// "!" opens one level; the parser recurses once per level, so without the depth
// limit a long run of "(" exhausts the goroutine stack, which is fatal to the
// whole process (recover cannot catch it).
const (
	// MaxQueryLength is the longest query in characters (Unicode code points).
	MaxQueryLength = 4096
	// MaxNesting is the deepest nesting of "(" and "!".
	MaxNesting = 64
)

// SyntaxError is a rejected query: a message naming a 1-based position and the
// matching 0-based offset.
type SyntaxError struct {
	Message string
	Offset  int
}

func (e *SyntaxError) Error() string { return e.Message }

// Position is the 1-based column shown in the message.
func (e *SyntaxError) Position() int { return e.Offset + 1 }

type tokType int

const (
	tAnd tokType = iota
	tOr
	tNot
	tLParen
	tRParen
	tCmp
	tLabel
	tProject
	tPriority
	tSearch
	// tOrigin is `origin: value` (OpenSpec change task-origin).
	tOrigin
	// tWorkspace is `workspace: name` (OpenSpec change group-mentions, D6).
	tWorkspace
	// tEnergy is `energy: deep|medium|low` (OpenSpec change task-energy, D5).
	tEnergy
	// tNotes is `notes: text`, text in a task's note (OpenSpec change notes-overview, D5).
	tNotes
	tWord
	tString
)

type token struct {
	typ   tokType
	pos   int
	raw   string
	value string // word value, string value, comparison operator
}

var single = map[rune]tokType{'&': tAnd, '|': tOr, '!': tNot, '(': tLParen, ')': tRParen}

// isBreak reports the characters that end a bare word: whitespace, quotes,
// connectives, parentheses and comparison operators.
func isBreak(c rune) bool {
	return unicode.IsSpace(c) || strings.ContainsRune(`"&|!()<>=`, c)
}

func fail(offset int, format string, args ...any) error {
	return &SyntaxError{Message: fmt.Sprintf(format, args...), Offset: offset}
}

var (
	searchPrefix = regexp.MustCompile(`(?i)^search:`)
	originPrefix = regexp.MustCompile(`(?i)^origin:`)
	wsPrefix     = regexp.MustCompile(`(?i)^workspace:`)
	energyPrefix = regexp.MustCompile(`(?i)^energy:`)
	notesPrefix  = regexp.MustCompile(`(?i)^notes:`)
	priorityWord = regexp.MustCompile(`(?i)^p([1-4])$`)
	anyPriority  = regexp.MustCompile(`^p\d+$`)
	isoDate      = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	digits       = regexp.MustCompile(`^\d+$`)
)

func tokenize(src []rune) ([]token, error) {
	var out []token
	i, n := 0, len(src)

	readBare := func() string {
		start := i
		for i < n && !isBreak(src[i]) {
			i++
		}
		return string(src[start:i])
	}
	readString := func() (string, error) {
		start := i
		i++
		var b strings.Builder
		for i < n && src[i] != '"' {
			if src[i] == '\\' && i+1 < n {
				i++
			}
			b.WriteRune(src[i])
			i++
		}
		if i >= n {
			return "", fail(start, "Missing closing quote for the text starting at position %d", start+1)
		}
		i++
		return b.String(), nil
	}
	readName := func(what, after string, at int) (string, error) {
		if i < n && src[i] == '"' {
			return readString()
		}
		name := readBare()
		if name == "" {
			return "", fail(at, `Expected a %s name after "%s" at position %d`, what, after, at+1)
		}
		return name, nil
	}

	for i < n {
		c := src[i]
		if unicode.IsSpace(c) {
			i++
			continue
		}
		pos := i
		if t, ok := single[c]; ok {
			i++
			out = append(out, token{typ: t, pos: pos, raw: string(c)})
			continue
		}
		if c == '<' || c == '>' || c == '=' {
			op := string(c)
			if c != '=' && i+1 < n && src[i+1] == '=' {
				op += "="
			}
			i += len(op)
			out = append(out, token{typ: tCmp, pos: pos, raw: op, value: op})
			continue
		}
		if c == '@' {
			i++
			name, err := readName("label", "@", pos)
			if err != nil {
				return nil, err
			}
			out = append(out, token{typ: tLabel, pos: pos, raw: string(src[pos:i]), value: name})
			continue
		}
		if c == '#' {
			after := "#"
			i++
			if i < n && src[i] == '#' {
				after = "##"
				i++
			}
			name, err := readName("project", after, pos)
			if err != nil {
				return nil, err
			}
			out = append(out, token{typ: tProject, pos: pos, raw: string(src[pos:i]), value: name})
			continue
		}
		if c == '"' {
			v, err := readString()
			if err != nil {
				return nil, err
			}
			out = append(out, token{typ: tString, pos: pos, raw: string(src[pos:i]), value: v})
			continue
		}
		word := readBare()
		// `search: text`, `origin: value` (task-origin), `workspace: name`
		// (group-mentions), `energy: level` (task-energy) and `notes: text`
		// (notes-overview): the prefix, then
		// the rest of the word, or the next bare word or quoted string.
		readPrefixed := func(prefix string) (string, error) {
			text := string([]rune(word)[len(prefix):])
			if text != "" {
				return text, nil
			}
			for i < n && unicode.IsSpace(src[i]) {
				i++
			}
			if i < n && src[i] == '"' {
				return readString()
			}
			return readBare(), nil
		}
		if term, ok := prefixedTermOf(word); ok {
			text, err := readPrefixed(term.prefix)
			if err == nil {
				text, err = term.check(text, pos)
			}
			if err != nil {
				return nil, err
			}
			out = append(out, token{typ: term.typ, pos: pos, raw: string(src[pos:i]), value: text})
			continue
		}
		if priorityWord.MatchString(word) {
			out = append(out, token{typ: tPriority, pos: pos, raw: word})
			continue
		}
		out = append(out, token{typ: tWord, pos: pos, raw: word, value: word})
	}
	return out, nil
}

// prefixedTerm is a `prefix: text` term: the token it makes and the check of
// its text, which returns the value to keep.
type prefixedTerm struct {
	re     *regexp.Regexp
	prefix string
	typ    tokType
	check  func(text string, pos int) (string, error)
}

// needText refuses an empty text with message (one %d: the 1-based position).
func needText(message string) func(string, int) (string, error) {
	return func(text string, pos int) (string, error) {
		if text == "" {
			return "", fail(pos, message, pos+1)
		}
		return text, nil
	}
}

// energyText accepts deep, medium or low in any case, kept in lower case
// (OpenSpec change task-energy, design D5).
func energyText(text string, pos int) (string, error) {
	v := strings.ToLower(text)
	if v != "deep" && v != "medium" && v != "low" {
		return "", fail(pos, "Energy must be deep, medium or low at position %d", pos+1)
	}
	return v, nil
}

var prefixedTerms = []prefixedTerm{
	{searchPrefix, "search:", tSearch, needText(`Expected text after "search:" at position %d`)},
	{originPrefix, "origin:", tOrigin, needText(`Expected a provider or kind after "origin:" at position %d`)},
	{wsPrefix, "workspace:", tWorkspace, needText(`Expected a workspace name after "workspace:" at position %d`)},
	{energyPrefix, "energy:", tEnergy, energyText},
	{notesPrefix, "notes:", tNotes, needText(`Expected text after "notes:" at position %d`)},
}

func prefixedTermOf(word string) (prefixedTerm, bool) {
	for _, t := range prefixedTerms {
		if t.re.MatchString(word) {
			return t, true
		}
	}
	return prefixedTerm{}, false
}

var (
	simpleKeywords = map[string]bool{"overdue": true, "today": true, "tomorrow": true, "completed": true, "open": true, "subtask": true, "someday": true, "deferred": true, "evening": true, "morning": true, "afternoon": true, "blocked": true, "unblocked": true, "available": true, "habit": true, "origin": true, "energy": true, "notes": true}
	noKeywords     = map[string]bool{"date": true, "project": true, "labels": true, "time": true, "deadline": true, "start": true, "origin": true, "energy": true, "notes": true}
	weekdays       = map[string]bool{"sunday": true, "monday": true, "tuesday": true, "wednesday": true, "thursday": true, "friday": true, "saturday": true}
)

type parser struct {
	toks  []token
	i     int
	end   int
	depth int // open "(" and "!" levels
}

// enter opens one nesting level at t, refusing one beyond MaxNesting.
func (p *parser) enter(t *token) error {
	p.depth++
	if p.depth > MaxNesting {
		return fail(t.pos, `Too deeply nested at position %d; use at most %d levels of "(" and "!"`, t.pos+1, MaxNesting)
	}
	return nil
}

func (p *parser) peek() *token {
	if p.i < len(p.toks) {
		return &p.toks[p.i]
	}
	return nil
}

func lower(t *token) string {
	if t != nil && t.typ == tWord {
		return strings.ToLower(t.value)
	}
	return ""
}

func (p *parser) missingTerm(prev *token) error {
	if prev != nil {
		return fail(prev.pos, `Expected a term after "%s" at position %d`, prev.raw, prev.pos+1)
	}
	at := p.end
	if t := p.peek(); t != nil {
		at = t.pos
	}
	return fail(at, "Expected a term at position %d", at+1)
}

func (p *parser) parseOr(prev *token) (*Node, error) {
	first, err := p.parseAnd(prev)
	if err != nil {
		return nil, err
	}
	items := []*Node{first}
	for t := p.peek(); t != nil && t.typ == tOr; t = p.peek() {
		p.i++
		n, err := p.parseAnd(t)
		if err != nil {
			return nil, err
		}
		items = append(items, n)
	}
	if len(items) == 1 {
		return first, nil
	}
	return &Node{Kind: KindOr, Items: items}, nil
}

func (p *parser) parseAnd(prev *token) (*Node, error) {
	first, err := p.parseNot(prev)
	if err != nil {
		return nil, err
	}
	items := []*Node{first}
	for t := p.peek(); t != nil && t.typ == tAnd; t = p.peek() {
		p.i++
		n, err := p.parseNot(t)
		if err != nil {
			return nil, err
		}
		items = append(items, n)
	}
	if len(items) == 1 {
		return first, nil
	}
	return &Node{Kind: KindAnd, Items: items}, nil
}

func (p *parser) parseNot(prev *token) (*Node, error) {
	t := p.peek()
	if t == nil {
		return nil, p.missingTerm(prev)
	}
	switch t.typ {
	case tNot:
		p.i++
		if err := p.enter(t); err != nil {
			return nil, err
		}
		defer func() { p.depth-- }()
		item, err := p.parseNot(t)
		if err != nil {
			return nil, err
		}
		return &Node{Kind: KindNot, Item: item}, nil
	case tLParen:
		p.i++
		if err := p.enter(t); err != nil {
			return nil, err
		}
		defer func() { p.depth-- }()
		inner, err := p.parseOr(t)
		if err != nil {
			return nil, err
		}
		c := p.peek()
		if c == nil {
			return nil, fail(p.end, `Missing ")" at end of query`)
		}
		if c.typ != tRParen {
			return nil, fail(c.pos, `Expected "&", "|" or ")" before "%s" at position %d`, c.raw, c.pos+1)
		}
		p.i++
		return inner, nil
	}
	return p.parseTerm(prev)
}

func (p *parser) parseTerm(prev *token) (*Node, error) {
	t := p.peek()
	switch t.typ {
	case tLabel:
		p.i++
		return &Node{Kind: KindLabel, Name: t.value}, nil
	case tProject:
		p.i++
		return &Node{Kind: KindProject, Name: t.value, Descendants: strings.HasPrefix(t.raw, "##")}, nil
	case tPriority:
		p.i++
		n, _ := strconv.Atoi(t.raw[1:])
		return &Node{Kind: KindPriority, Priority: n}, nil
	case tSearch:
		p.i++
		return &Node{Kind: KindSearch, Text: t.value}, nil
	case tOrigin:
		p.i++
		return &Node{Kind: KindOrigin, Text: t.value}, nil
	case tWorkspace:
		p.i++
		return &Node{Kind: KindWorkspace, Name: t.value}, nil
	case tEnergy:
		p.i++
		return &Node{Kind: KindEnergy, Text: t.value}, nil
	case tNotes:
		p.i++
		return &Node{Kind: KindNotes, Text: t.value}, nil
	case tWord:
		return p.parseWordTerm(t)
	case tString:
		// A quoted name followed by a comparison is a custom field term (custom-fields).
		if p.i+1 < len(p.toks) && p.toks[p.i+1].typ == tCmp {
			p.i++
			return p.parseFieldTerm(t.value)
		}
		return nil, fail(t.pos, `Unexpected text %s at position %d; quote names after "@" or "#", or use search:`, t.raw, t.pos+1)
	}
	return nil, p.missingTerm(prev)
}

var (
	dateStarts = map[string]bool{"today": true, "tomorrow": true, "yesterday": true, "this": true, "last": true, "next": true}
	dateUnits  = map[string]bool{"days": true, "week": true, "weeks": true, "month": true, "months": true}
	fieldNum   = regexp.MustCompile(`^-?\d+(\.\d+)?$`)
)

// parseFieldTerm reads `cmp value` after a custom field name (OpenSpec change
// custom-fields): a quoted text, true or false, a date (anything the date
// grammar starts with), a number, or any other bare word as text.
func (p *parser) parseFieldTerm(name string) (*Node, error) {
	c := p.peek()
	p.i++
	n := &Node{Kind: KindField, Name: name, Op: c.value}
	t := p.peek()
	if t != nil && t.typ == tString {
		p.i++
		n.Value = FieldValue{Type: "text", Text: t.value}
		return n, nil
	}
	if t == nil || t.typ != tWord {
		return nil, fail(c.pos, `Expected a value after "%s" at position %d`, c.raw, c.pos+1)
	}
	w := strings.ToLower(t.value)
	if w == "true" || w == "false" {
		p.i++
		n.Value = FieldValue{Type: "bool", Bool: w == "true"}
		return n, nil
	}
	unit := ""
	if digits.MatchString(w) && p.i+1 < len(p.toks) {
		unit = lower(&p.toks[p.i+1])
	}
	if dateStarts[w] || weekdays[w] || isoDate.MatchString(w) || dateUnits[unit] {
		d, err := p.parseDate(c)
		if err != nil {
			return nil, err
		}
		n.Value = FieldValue{Type: "date", Date: d}
		return n, nil
	}
	p.i++
	if fieldNum.MatchString(w) {
		f, _ := strconv.ParseFloat(w, 64)
		n.Value = FieldValue{Type: "number", Number: f}
		return n, nil
	}
	n.Value = FieldValue{Type: "text", Text: t.value}
	return n, nil
}

func cmpOf(c *token) string {
	switch lower(c) {
	case "before":
		return "<"
	case "after":
		return ">"
	}
	return c.value
}

func (p *parser) parseWordTerm(t *token) (*Node, error) {
	w := strings.ToLower(t.value)
	p.i++
	// `completed` is the state keyword unless a comparison follows (OpenSpec
	// change completed-date-filters, design D3).
	next := p.peek()
	dated := w == "completed" && next != nil && (next.typ == tCmp || lower(next) == "before" || lower(next) == "after")
	switch {
	case w == "due" || w == "created" || w == "deadline" || w == "start" || dated:
		c := p.peek()
		ok := c != nil && (c.typ == tCmp || lower(c) == "before" || lower(c) == "after")
		if !ok {
			return nil, fail(t.pos, `Expected a comparison (<, <=, =, >=, >, before or after) after "%s" at position %d`, t.raw, t.pos+1)
		}
		p.i++
		d, err := p.parseDate(c)
		if err != nil {
			return nil, err
		}
		return &Node{Kind: KindDate, Field: w, Op: cmpOf(c), Date: d}, nil
	case w == "tracked":
		// Tracked time (OpenSpec change time-tracking, design D9): the keyword, or
		// `tracked cmp duration`. A reserved word: a field named "tracked" is
		// reachable only quoted.
		c := p.peek()
		if c == nil || c.typ != tCmp {
			return &Node{Kind: KindKeyword, Keyword: "tracked"}, nil
		}
		p.i++
		v := p.peek()
		if v == nil || v.typ != tWord {
			return nil, fail(c.pos, `Expected a duration such as 30m or 1h30 after "%s" at position %d`, c.raw, c.pos+1)
		}
		minutes, ok := timetrack.ParseDuration(v.value)
		if !ok {
			return nil, fail(v.pos, `Expected a duration such as 30m or 1h30 after "%s" at position %d`, c.raw, v.pos+1)
		}
		p.i++
		return &Node{Kind: KindTracked, Op: c.value, Minutes: minutes}, nil
	case w == "no":
		// A keyword, or any other name: a custom field without a value (custom-fields).
		nt := p.peek()
		if noKeywords[lower(nt)] && nt.typ == tWord {
			p.i++
			return &Node{Kind: KindKeyword, Keyword: "no " + lower(nt)}, nil
		}
		if nt != nil && (nt.typ == tWord || nt.typ == tString) {
			p.i++
			return &Node{Kind: KindNoField, Name: nt.value}, nil
		}
		return nil, fail(t.pos, `Expected "date", "project", "labels", "time", "deadline", "start", "origin" or a field name after "no" at position %d`, t.pos+1)
	case simpleKeywords[w]:
		return &Node{Kind: KindKeyword, Keyword: w}, nil
	case anyPriority.MatchString(w):
		return nil, fail(t.pos, "Priority must be p1, p2, p3 or p4 at position %d", t.pos+1)
	case next != nil && next.typ == tCmp:
		// Any other word followed by a comparison names a custom field (custom-fields).
		return p.parseFieldTerm(t.value)
	}
	return nil, fail(t.pos, `Unknown term "%s" at position %d`, t.raw, t.pos+1)
}

var weekdayIndex = map[string]int{"sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6}

func (p *parser) parseDate(after *token) (DateExpr, error) {
	t := p.peek()
	if t == nil || t.typ != tWord {
		return DateExpr{}, fail(after.pos, `Expected a date after "%s" at position %d`, after.raw, after.pos+1)
	}
	w := strings.ToLower(t.value)
	p.i++
	switch {
	case w == "today":
		return DateExpr{Type: "relative"}, nil
	case w == "tomorrow":
		return DateExpr{Type: "relative", Days: 1}, nil
	case w == "yesterday":
		return DateExpr{Type: "relative", Days: -1}, nil
	case weekdays[w]:
		return DateExpr{Type: "weekday", Day: weekdayIndex[w]}, nil
	case isoDate.MatchString(w):
		if !validISO(w) {
			return DateExpr{}, fail(t.pos, `Invalid date "%s" at position %d`, t.raw, t.pos+1)
		}
		return DateExpr{Type: "iso", ISO: w}, nil
	case w == "this" || w == "last" || w == "next":
		// A period (completed-date-filters D1): this, last or next week or month.
		u := lower(p.peek())
		if u != "week" && u != "month" {
			return DateExpr{}, fail(t.pos, `Expected "week" or "month" after "%s" at position %d`, t.raw, t.pos+1)
		}
		p.i++
		offset := map[string]int{"this": 0, "last": -1, "next": 1}[w]
		return DateExpr{Type: "period", Unit: u, Offset: offset}, nil
	case digits.MatchString(w):
		n, _ := strconv.Atoi(w)
		unit := p.peek()
		switch lower(unit) {
		case "days":
			p.i++
			if lower(p.peek()) == "ago" {
				p.i++
				return DateExpr{Type: "relative", Days: -n}, nil
			}
			return DateExpr{Type: "relative", Days: n}, nil
		case "week", "weeks", "month", "months":
			p.i++
			if lower(p.peek()) != "ago" {
				return DateExpr{}, fail(unit.pos, `Expected "ago" after "%s" at position %d`, unit.raw, unit.pos+1)
			}
			p.i++
			u := "month"
			if strings.HasPrefix(lower(unit), "week") {
				u = "week"
			}
			return DateExpr{Type: "period", Unit: u, Offset: -n}, nil
		}
		return DateExpr{}, fail(t.pos, `Expected "days", "weeks" or "months" after "%s" at position %d`, t.raw, t.pos+1)
	}
	return DateExpr{}, fail(t.pos, `Invalid date "%s" at position %d`, t.raw, t.pos+1)
}

func validISO(s string) bool {
	y, _ := strconv.Atoi(s[0:4])
	m, _ := strconv.Atoi(s[5:7])
	d, _ := strconv.Atoi(s[8:10])
	dt := time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC)
	return dt.Year() == y && int(dt.Month()) == m && dt.Day() == d
}

// Parse checks a query against the grammar. It returns nil for a valid query and
// for an empty (whitespace-only) one; callers that need a non-empty query check
// that themselves. Errors are *SyntaxError. A query longer than MaxQueryLength or
// nested deeper than MaxNesting is refused.
func Parse(query string) error {
	_, err := ParseQuery(query)
	return err
}

// ParseQuery parses a query into its tree (nil for an empty query), for the
// server's evaluator (routines-engine "Evaluation on the server for routines").
func ParseQuery(query string) (*Node, error) {
	if n := utf8.RuneCountInString(query); n > MaxQueryLength {
		return nil, fail(MaxQueryLength, "Query is too long: %d characters, at most %d", n, MaxQueryLength)
	}
	src := []rune(query)
	toks, err := tokenize(src)
	if err != nil {
		return nil, err
	}
	if len(toks) == 0 {
		return nil, nil
	}
	p := &parser{toks: toks, end: len(src)}
	ast, err := p.parseOr(nil)
	if err != nil {
		return nil, err
	}
	if rest := p.peek(); rest != nil {
		if rest.typ == tRParen {
			return nil, fail(rest.pos, `Unexpected ")" at position %d`, rest.pos+1)
		}
		return nil, fail(rest.pos, `Expected "&" or "|" before "%s" at position %d`, rest.raw, rest.pos+1)
	}
	return ast, nil
}
