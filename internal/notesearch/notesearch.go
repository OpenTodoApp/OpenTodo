// Package notesearch is the note search of OpenSpec notes-overview (D4): the matcher, the
// ranking and the snippet, the Go port of web/src/lib/noteSearch.ts. The server uses it for the
// MCP tool search_notes and the CLI for `ot notes search`, over rows it already holds; nothing
// is stored. Both languages are pinned by testdata/vectors.json.
//
// A query is split into terms (quoted text is one phrase); a note matches when every term
// occurs as a substring of its title and its Markdown-stripped text, ignoring case and
// diacritics.
//
// Known differences from the web app: Normalize takes no language (the app lower-cases with the
// app language, which only matters for Turkish, Azeri and Lithuanian), and decomposition covers
// the blocks listed on fold (the app uses full NFKD). Keys are ordered by bytes, the app by
// UTF-16 code units; they agree for ASCII keys such as ids.
package notesearch

import (
	"sort"
	"strings"
	"unicode"
)

// Segment is a piece of a snippet: plain text, marked when it is a match. It is never HTML.
type Segment struct {
	Text string `json:"text"`
	Mark bool   `json:"mark"`
}

// Result is what one note's match says about it.
type Result struct {
	// Matched is true when every term occurs in the title or the text.
	Matched bool `json:"matched"`
	// TitleMatch is true when at least one term occurs in the title.
	TitleMatch bool `json:"title_match"`
	// BodyWords is the number of terms that occur in the text.
	BodyWords int `json:"body_words"`
}

// Note is a note to search: its key, title, Markdown text and last change (Unix ms).
type Note struct {
	Key     string
	Title   string
	Text    string
	Updated int64
}

// Hit is a ranked result: the note and its match.
type Hit struct {
	Note Note
	Result
}

// Ellipsis marks where a snippet was cut.
const Ellipsis = "…"

// DefaultSnippet is the snippet length the app uses, in code points.
const DefaultSnippet = 140

func isSpace(r rune) bool {
	return r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == '\f' || r == '\v'
}

func isWordChar(cs []rune, i int) bool {
	if i < 0 || i >= len(cs) {
		return false
	}
	return unicode.IsLetter(cs[i]) || unicode.IsNumber(cs[i])
}

func isQuote(r rune) bool { return r == '"' || r == '“' || r == '”' || r == '„' }

func isASCIIPunct(r rune) bool {
	return r < 0x80 && strings.ContainsRune("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~", r)
}

// Normalize is text for comparison: each code point decomposed (fold), lower-cased, combining
// marks removed and "ς" written "σ".
func Normalize(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		writeFolded(&b, r)
	}
	return b.String()
}

func writeFolded(b *strings.Builder, r rune) {
	if r < 0x80 {
		b.WriteRune(unicode.ToLower(r))
		return
	}
	d, ok := fold[r]
	if !ok {
		d = string(r)
	}
	for _, x := range d {
		if unicode.Is(unicode.M, x) {
			continue
		}
		x = unicode.ToLower(x)
		if x == 'ς' {
			x = 'σ'
		}
		b.WriteRune(x)
	}
}

// stripLinePrefix removes the block markers at the start of a line: quotes, headings, list
// markers and task boxes, repeatedly.
func stripLinePrefix(s []rune) []rune {
	s = trimLeft(s)
	for {
		n := len(s)
		switch {
		case len(s) > 0 && s[0] == '>':
			s = s[1:]
		case headingLen(s) > 0:
			s = s[headingLen(s):]
		case len(s) > 0 && (s[0] == '-' || s[0] == '*' || s[0] == '+') && endsMarker(s, 1):
			s = s[1:]
		case orderedLen(s) > 0:
			s = s[orderedLen(s):]
		case len(s) >= 3 && s[0] == '[' && (s[1] == ' ' || s[1] == 'x' || s[1] == 'X') && s[2] == ']' && endsMarker(s, 3):
			s = s[3:]
		}
		s = trimLeft(s)
		if len(s) == n {
			return s
		}
	}
}

func trimLeft(s []rune) []rune {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	return s
}

// endsMarker reports whether a marker of length n is followed by a space, a tab or the end.
func endsMarker(s []rune, n int) bool { return len(s) == n || s[n] == ' ' || s[n] == '\t' }

func headingLen(s []rune) int {
	n := 0
	for n < len(s) && s[n] == '#' {
		n++
	}
	if n < 1 || n > 6 || !endsMarker(s, n) {
		return 0
	}
	return n
}

func orderedLen(s []rune) int {
	n := 0
	for n < len(s) && s[n] >= '0' && s[n] <= '9' {
		n++
	}
	if n < 1 || n > 9 || n >= len(s) || (s[n] != '.' && s[n] != ')') || !endsMarker(s, n+1) {
		return 0
	}
	return n + 1
}

// dropLine reports a code fence, or a non-empty line made only of rule and table characters.
func dropLine(line []rune) bool {
	s := trimLeft(line)
	str := string(s)
	if strings.HasPrefix(str, "```") || strings.HasPrefix(str, "~~~") {
		return true
	}
	if len(s) == 0 {
		return false
	}
	for _, r := range s {
		if !strings.ContainsRune("-*_|:= \t", r) {
			return false
		}
	}
	return true
}

// stripInline is the inline pass over one line: escapes, code spans, links and images,
// emphasis markers and table pipes.
func stripInline(cs []rune) string {
	var b strings.Builder
	skipFrom, skipTo := -1, -1
	for i := 0; i < len(cs); i++ {
		if skipFrom >= 0 && i > skipFrom {
			skipFrom = -1
		}
		if i == skipFrom {
			i = skipTo - 1
			skipFrom = -1
			continue
		}
		c := cs[i]
		switch {
		case c == '\\' && i+1 < len(cs) && isASCIIPunct(cs[i+1]):
			i++
			b.WriteRune(cs[i])
		case c == '`':
			n := runLen(cs, i)
			if end := findRun(cs, '`', n, i+n); end >= 0 {
				b.WriteString(string(cs[i+n : end]))
				i = end + n - 1
			} else {
				i += n - 1
			}
		case c == '!' && i+1 < len(cs) && cs[i+1] == '[' && linkOK(cs, i+1):
		case c == '[':
			if a, z, ok := linkEnd(cs, i); ok && skipFrom < 0 {
				skipFrom, skipTo = a, z
			} else {
				b.WriteRune(c)
			}
		case c == '*' || c == '_':
			if isWordChar(cs, i-1) && isWordChar(cs, i+1) {
				b.WriteRune(c)
			}
		case c == '~':
			n := runLen(cs, i)
			if n == 1 {
				b.WriteRune(c)
			}
			i += n - 1
		case c == '|':
			b.WriteByte(' ')
		default:
			b.WriteRune(c)
		}
	}
	return b.String()
}

// runLen is the number of copies of cs[i] starting at i.
func runLen(cs []rune, i int) int {
	n := 1
	for i+n < len(cs) && cs[i+n] == cs[i] {
		n++
	}
	return n
}

// findRun is the index of the next run of exactly n copies of ch at or after from, or -1.
func findRun(cs []rune, ch rune, n, from int) int {
	for i := from; i < len(cs); i++ {
		if cs[i] != ch {
			continue
		}
		m := runLen(cs, i)
		if m == n {
			return i
		}
		i += m - 1
	}
	return -1
}

// linkEnd, for a "[" at open, returns the index of the "](" and the index after the ")" of a
// link, when there is one.
func linkEnd(cs []rune, open int) (int, int, bool) {
	for j := open + 1; j+1 < len(cs); j++ {
		if cs[j] == '[' {
			return 0, 0, false
		}
		if cs[j] == ']' {
			if cs[j+1] != '(' {
				return 0, 0, false
			}
			for k := j + 2; k < len(cs); k++ {
				if cs[k] == ')' {
					return j, k + 1, true
				}
			}
			return 0, 0, false
		}
	}
	return 0, 0, false
}

func linkOK(cs []rune, open int) bool {
	_, _, ok := linkEnd(cs, open)
	return ok
}

// collapse turns whitespace runs into one space and trims.
func collapse(s string) string {
	var b strings.Builder
	space := false
	for _, r := range s {
		if isSpace(r) {
			space = b.Len() > 0
			continue
		}
		if space {
			b.WriteByte(' ')
		}
		space = false
		b.WriteRune(r)
	}
	return b.String()
}

// StripMarkdown is the plain text of Markdown for matching and snippets: block markers
// (quotes, headings, list markers, task boxes), rule and table separator lines, code fences,
// emphasis markers (* and _ unless inside a word, ~~), inline code backticks, table pipes, link
// and image targets and backslash escapes removed; whitespace collapsed to single spaces.
func StripMarkdown(md string) string {
	md = strings.ReplaceAll(md, "\r\n", "\n")
	md = strings.ReplaceAll(md, "\r", "\n")
	var lines []string
	for _, raw := range strings.Split(md, "\n") {
		line := []rune(raw)
		if dropLine(line) {
			continue
		}
		lines = append(lines, stripInline(stripLinePrefix(line)))
	}
	return collapse(strings.Join(lines, " "))
}

// ParseQuery returns the search terms of a query: quoted text (straight or curly quotes) is one
// phrase, the rest one term per word; normalised, without empties or repeats.
func ParseQuery(q string) []string {
	terms := []string{}
	add := func(t string) {
		n := collapse(t)
		if n == "" {
			return
		}
		for _, x := range terms {
			if x == n {
				return
			}
		}
		terms = append(terms, n)
	}
	cs := []rune(Normalize(q))
	var word []rune
	for i := 0; i < len(cs); i++ {
		c := cs[i]
		switch {
		case isQuote(c):
			add(string(word))
			word = word[:0]
			j := i + 1
			for j < len(cs) && !isQuote(cs[j]) {
				j++
			}
			add(string(cs[i+1 : j]))
			i = j
		case isSpace(c):
			add(string(word))
			word = word[:0]
		default:
			word = append(word, c)
		}
	}
	add(string(word))
	return terms
}

// Match reports how a note's title and Markdown text match terms (from ParseQuery). No terms
// match nothing.
func Match(title, text string, terms []string) Result {
	nt := Normalize(title)
	nb := Normalize(StripMarkdown(text))
	all := nt + " " + nb
	r := Result{Matched: len(terms) > 0}
	for _, t := range terms {
		if !strings.Contains(all, t) {
			r.Matched = false
		}
		if strings.Contains(nt, t) {
			r.TitleMatch = true
		}
		if strings.Contains(nb, t) {
			r.BodyWords++
		}
	}
	return r
}

// Rank returns the notes matching query, title matches first, then more matched words in the
// text, then the newest change, then the key. An empty query matches nothing.
func Rank(notes []Note, query string) []Hit {
	terms := ParseQuery(query)
	hits := []Hit{}
	if len(terms) == 0 {
		return hits
	}
	for _, n := range notes {
		if r := Match(n.Title, n.Text, terms); r.Matched {
			hits = append(hits, Hit{Note: n, Result: r})
		}
	}
	sort.SliceStable(hits, func(i, j int) bool {
		a, b := hits[i], hits[j]
		if a.TitleMatch != b.TitleMatch {
			return a.TitleMatch
		}
		if a.BodyWords != b.BodyWords {
			return a.BodyWords > b.BodyWords
		}
		if a.Note.Updated != b.Note.Updated {
			return a.Note.Updated > b.Note.Updated
		}
		return a.Note.Key < b.Note.Key
	})
	return hits
}

// Snippet is the snippet of a note's Markdown text: SnippetPlain over StripMarkdown(text).
func Snippet(text string, terms []string, size int) []Segment {
	return SnippetPlain(StripMarkdown(text), terms, size)
}

// SnippetPlain returns about size code points of plain text around the first match of any
// term, cut at spaces, with an Ellipsis where it was cut, and every occurrence of a term inside
// as a marked segment showing the original characters. Without a match in the text it is the
// start of the text, unmarked. Empty text has no segments.
func SnippetPlain(plain string, terms []string, size int) []Segment {
	p := []rune(plain)
	if len(p) == 0 {
		return []Segment{}
	}
	ranges := findRanges(p, terms)
	m := [2]int{0, 0}
	if len(ranges) > 0 {
		m = ranges[0]
	}
	start, end := windowAround(p, m, size)
	var out []Segment
	emit := func(text string, mark bool) {
		if text == "" {
			return
		}
		if len(out) > 0 && out[len(out)-1].Mark == mark {
			out[len(out)-1].Text += text
			return
		}
		out = append(out, Segment{Text: text, Mark: mark})
	}
	if start > 0 {
		emit(Ellipsis, false)
	}
	at, markEnd := start, start
	for _, r := range ranges {
		a := max3(r[0], start, markEnd)
		b := min(r[1], end)
		if a >= b {
			continue
		}
		emit(string(p[at:a]), false)
		emit(string(p[a:b]), true)
		at, markEnd = b, b
	}
	emit(string(p[at:end]), false)
	if end < len(p) {
		emit(Ellipsis, false)
	}
	return out
}

func max3(a, b, c int) int { return max(a, max(b, c)) }

// findRanges returns every occurrence of every term in p as a [start, end) range of p's code
// points, matched on the normalised text, sorted by start (longest first).
func findRanges(p []rune, terms []string) [][2]int {
	var norm []rune
	var orig []int
	var b strings.Builder
	for i, c := range p {
		b.Reset()
		writeFolded(&b, c)
		for _, n := range b.String() {
			norm = append(norm, n)
			orig = append(orig, i)
		}
	}
	var ranges [][2]int
	for _, t := range terms {
		tr := []rune(t)
		if len(tr) == 0 {
			continue
		}
		for i := 0; i+len(tr) <= len(norm); {
			if !runesAt(norm, i, tr) {
				i++
				continue
			}
			ranges = append(ranges, [2]int{orig[i], orig[i+len(tr)-1] + 1})
			i += len(tr)
		}
	}
	sort.SliceStable(ranges, func(i, j int) bool {
		if ranges[i][0] != ranges[j][0] {
			return ranges[i][0] < ranges[j][0]
		}
		return ranges[i][1] > ranges[j][1]
	})
	return ranges
}

func runesAt(s []rune, i int, t []rune) bool {
	for k := range t {
		if s[i+k] != t[k] {
			return false
		}
	}
	return true
}

// windowAround is the [start, end) window of about size code points around the match m, cut
// at spaces when that keeps the match whole, without spaces at its edges.
func windowAround(p []rune, m [2]int, size int) (int, int) {
	n := len(p)
	start, end := 0, n
	if n > size {
		start = m[0] - (max(0, size-(m[1]-m[0])) / 2)
		start = max(0, start)
		end = min(n, start+size)
		start = max(0, end-size)
		if start > 0 && !isSpace(p[start-1]) {
			s := start
			for s < m[0] && !isSpace(p[s]) {
				s++
			}
			if s < m[0] {
				start = s
			}
		}
		if end < n && !isSpace(p[end]) {
			e := end
			for e > m[1] && !isSpace(p[e-1]) {
				e--
			}
			if e > m[1] {
				end = e
			}
		}
	}
	for start < end && isSpace(p[start]) {
		start++
	}
	for end > start && isSpace(p[end-1]) {
		end--
	}
	return start, end
}
