package quickadd

import (
	"strings"
	"unicode"
)

// Span is a half-open byte range [Start, End) of the line with its text.
type Span struct {
	Start, End int
	Text       string
}

type token struct {
	text, norm string
	start, end int
	quoted     bool
}

// tokenize splits on whitespace; a balanced pair of double quotes marks its
// content as literal and the quote characters are reported for removal.
func tokenize(line string) ([]token, []Span) {
	var positions []int
	for i, r := range line {
		if r == '"' {
			positions = append(positions, i)
		}
	}
	closers := map[int]bool{}
	for k := 0; k+1 < len(positions); k += 2 {
		closers[positions[k]], closers[positions[k+1]] = true, true
	}
	var tokens []token
	var quotes []Span
	quoted := false
	start := -1
	flush := func(end int) {
		if start >= 0 && end > start {
			text := line[start:end]
			tokens = append(tokens, token{text: text, norm: normalize(text), start: start, end: end, quoted: quoted})
		}
		start = -1
	}
	for i, r := range line {
		switch {
		case closers[i]:
			flush(i)
			quotes = append(quotes, Span{i, i + 1, `"`})
			quoted = !quoted
		case unicode.IsSpace(r):
			flush(i)
		case start < 0:
			start = i
		}
	}
	flush(len(line))
	return tokens, quotes
}

// stripSpans builds the title: removed spans become word breaks, dropped spans
// vanish, whitespace collapses.
func stripSpans(line string, remove, drop []Span) string {
	cut := make([]byte, len(line))
	mark := func(spans []Span, v byte) {
		for _, s := range spans {
			for i := max(0, s.Start); i < min(len(line), s.End); i++ {
				cut[i] = v
			}
		}
	}
	mark(drop, 2)
	mark(remove, 1)
	var b strings.Builder
	for i := 0; i < len(line); i++ {
		switch cut[i] {
		case 1:
			b.WriteByte(' ')
		case 0:
			b.WriteByte(line[i])
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}
