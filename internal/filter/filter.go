// Package filter is a Go port of the filter query tokenizer and parser
// (web/src/lib/filter/parse.ts, grammar in docs/filters.md). The server only needs to
// accept or reject a query so the REST API can validate saved views (OpenSpec
// `custom-views`, design D6); evaluation stays on the client. Messages and positions
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

	"github.com/pixari/opentodo/internal/timetrack"
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
		// `search: text` and `origin: value` (task-origin): the prefix, then the
		// rest of the word, or the next bare word or quoted string.
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
		if searchPrefix.MatchString(word) {
			text, err := readPrefixed("search:")
			if err != nil {
				return nil, err
			}
			if text == "" {
				return nil, fail(pos, `Expected text after "search:" at position %d`, pos+1)
			}
			out = append(out, token{typ: tSearch, pos: pos, raw: string(src[pos:i]), value: text})
			continue
		}
		if originPrefix.MatchString(word) {
			text, err := readPrefixed("origin:")
			if err != nil {
				return nil, err
			}
			if text == "" {
				return nil, fail(pos, `Expected a provider or kind after "origin:" at position %d`, pos+1)
			}
			out = append(out, token{typ: tOrigin, pos: pos, raw: string(src[pos:i]), value: text})
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

var (
	simpleKeywords = map[string]bool{"overdue": true, "today": true, "tomorrow": true, "completed": true, "open": true, "subtask": true, "someday": true, "deferred": true, "evening": true, "blocked": true, "unblocked": true, "habit": true, "origin": true}
	noKeywords     = map[string]bool{"date": true, "project": true, "labels": true, "time": true, "deadline": true, "start": true, "origin": true}
	weekdays       = map[string]bool{"sunday": true, "monday": true, "tuesday": true, "wednesday": true, "thursday": true, "friday": true, "saturday": true}
)

type parser struct {
	toks []token
	i    int
	end  int
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

func (p *parser) parseOr(prev *token) error {
	if err := p.parseAnd(prev); err != nil {
		return err
	}
	for t := p.peek(); t != nil && t.typ == tOr; t = p.peek() {
		p.i++
		if err := p.parseAnd(t); err != nil {
			return err
		}
	}
	return nil
}

func (p *parser) parseAnd(prev *token) error {
	if err := p.parseNot(prev); err != nil {
		return err
	}
	for t := p.peek(); t != nil && t.typ == tAnd; t = p.peek() {
		p.i++
		if err := p.parseNot(t); err != nil {
			return err
		}
	}
	return nil
}

func (p *parser) parseNot(prev *token) error {
	t := p.peek()
	if t == nil {
		return p.missingTerm(prev)
	}
	switch t.typ {
	case tNot:
		p.i++
		return p.parseNot(t)
	case tLParen:
		p.i++
		if err := p.parseOr(t); err != nil {
			return err
		}
		c := p.peek()
		if c == nil {
			return fail(p.end, `Missing ")" at end of query`)
		}
		if c.typ != tRParen {
			return fail(c.pos, `Expected "&", "|" or ")" before "%s" at position %d`, c.raw, c.pos+1)
		}
		p.i++
		return nil
	}
	return p.parseTerm(prev)
}

func (p *parser) parseTerm(prev *token) error {
	t := p.peek()
	switch t.typ {
	case tLabel, tProject, tPriority, tSearch, tOrigin:
		p.i++
		return nil
	case tWord:
		return p.parseWordTerm(t)
	case tString:
		// A quoted name followed by a comparison is a custom field term (custom-fields).
		if p.i+1 < len(p.toks) && p.toks[p.i+1].typ == tCmp {
			p.i++
			return p.parseFieldTerm()
		}
		return fail(t.pos, `Unexpected text %s at position %d; quote names after "@" or "#", or use search:`, t.raw, t.pos+1)
	}
	return p.missingTerm(prev)
}

var (
	dateStarts = map[string]bool{"today": true, "tomorrow": true, "yesterday": true, "this": true, "last": true, "next": true}
	dateUnits  = map[string]bool{"days": true, "week": true, "weeks": true, "month": true, "months": true}
)

// parseFieldTerm reads `cmp value` after a custom field name (OpenSpec change
// custom-fields): a quoted text, true or false, a date (anything the date
// grammar starts with), a number, or any other bare word as text. The field's
// type is the client's business: the server only checks the shape.
func (p *parser) parseFieldTerm() error {
	c := p.peek()
	p.i++
	t := p.peek()
	if t != nil && t.typ == tString {
		p.i++
		return nil
	}
	if t == nil || t.typ != tWord {
		return fail(c.pos, `Expected a value after "%s" at position %d`, c.raw, c.pos+1)
	}
	w := strings.ToLower(t.value)
	unit := ""
	if digits.MatchString(w) && p.i+1 < len(p.toks) {
		unit = lower(&p.toks[p.i+1])
	}
	if dateStarts[w] || weekdays[w] || isoDate.MatchString(w) || dateUnits[unit] {
		return p.parseDate(c)
	}
	p.i++
	return nil
}

func (p *parser) parseWordTerm(t *token) error {
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
			return fail(t.pos, `Expected a comparison (<, <=, =, >=, >, before or after) after "%s" at position %d`, t.raw, t.pos+1)
		}
		p.i++
		return p.parseDate(c)
	case w == "tracked":
		// Tracked time (OpenSpec change time-tracking, design D9): the keyword, or
		// `tracked cmp duration`. A reserved word: a field named "tracked" is
		// reachable only quoted.
		c := p.peek()
		if c == nil || c.typ != tCmp {
			return nil
		}
		p.i++
		v := p.peek()
		if v == nil || v.typ != tWord {
			return fail(c.pos, `Expected a duration such as 30m or 1h30 after "%s" at position %d`, c.raw, c.pos+1)
		}
		if _, ok := timetrack.ParseDuration(v.value); !ok {
			return fail(v.pos, `Expected a duration such as 30m or 1h30 after "%s" at position %d`, c.raw, v.pos+1)
		}
		p.i++
		return nil
	case w == "no":
		// A keyword, or any other name: a custom field without a value (custom-fields).
		if nt := p.peek(); noKeywords[lower(nt)] || (nt != nil && (nt.typ == tWord || nt.typ == tString)) {
			p.i++
			return nil
		}
		return fail(t.pos, `Expected "date", "project", "labels", "time", "deadline", "start", "origin" or a field name after "no" at position %d`, t.pos+1)
	case simpleKeywords[w]:
		return nil
	case anyPriority.MatchString(w):
		return fail(t.pos, "Priority must be p1, p2, p3 or p4 at position %d", t.pos+1)
	case next != nil && next.typ == tCmp:
		// Any other word followed by a comparison names a custom field (custom-fields).
		return p.parseFieldTerm()
	}
	return fail(t.pos, `Unknown term "%s" at position %d`, t.raw, t.pos+1)
}

func (p *parser) parseDate(after *token) error {
	t := p.peek()
	if t == nil || t.typ != tWord {
		return fail(after.pos, `Expected a date after "%s" at position %d`, after.raw, after.pos+1)
	}
	w := strings.ToLower(t.value)
	p.i++
	switch {
	case w == "today" || w == "tomorrow" || w == "yesterday" || weekdays[w]:
		return nil
	case isoDate.MatchString(w):
		if !validISO(w) {
			return fail(t.pos, `Invalid date "%s" at position %d`, t.raw, t.pos+1)
		}
		return nil
	case w == "this" || w == "last" || w == "next":
		// A period (completed-date-filters D1): this, last or next week or month.
		if u := lower(p.peek()); u != "week" && u != "month" {
			return fail(t.pos, `Expected "week" or "month" after "%s" at position %d`, t.raw, t.pos+1)
		}
		p.i++
		return nil
	case digits.MatchString(w):
		unit := p.peek()
		switch lower(unit) {
		case "days":
			p.i++
			if lower(p.peek()) == "ago" {
				p.i++
			}
			return nil
		case "week", "weeks", "month", "months":
			p.i++
			if lower(p.peek()) != "ago" {
				return fail(unit.pos, `Expected "ago" after "%s" at position %d`, unit.raw, unit.pos+1)
			}
			p.i++
			return nil
		}
		return fail(t.pos, `Expected "days", "weeks" or "months" after "%s" at position %d`, t.raw, t.pos+1)
	}
	return fail(t.pos, `Invalid date "%s" at position %d`, t.raw, t.pos+1)
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
// that themselves. Errors are *SyntaxError.
func Parse(query string) error {
	src := []rune(query)
	toks, err := tokenize(src)
	if err != nil {
		return err
	}
	if len(toks) == 0 {
		return nil
	}
	p := &parser{toks: toks, end: len(src)}
	if err := p.parseOr(nil); err != nil {
		return err
	}
	if rest := p.peek(); rest != nil {
		if rest.typ == tRParen {
			return fail(rest.pos, `Unexpected ")" at position %d`, rest.pos+1)
		}
		return fail(rest.pos, `Expected "&" or "|" before "%s" at position %d`, rest.raw, rest.pos+1)
	}
	return nil
}
