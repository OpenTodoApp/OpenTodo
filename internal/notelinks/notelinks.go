// Package notelinks reads the internal links of a note's Markdown (OpenSpec
// change note-links, design D1, D5): link text whose address is
// `?note=<id>`, `?task=<id>` or `?project=<id>`, outside code spans and fenced
// blocks. It is the Go twin of web/src/lib/noteLinkGrammar.ts, pinned by the
// shared vectors in testdata/links.vectors.json. Standard library only.
package notelinks

import (
	"strings"
	"unicode"
)

// Kinds of link targets.
const (
	KindNote    = "note"
	KindTask    = "task"
	KindProject = "project"
)

var kinds = []string{KindNote, KindTask, KindProject}

// Link is one internal link: its target and its text as stored.
type Link struct {
	Kind  string `json:"kind"`
	ID    string `json:"id"`
	Label string `json:"label"`
}

// Key is the target as "<kind>:<id>".
func (l Link) Key() string { return l.Kind + ":" + l.ID }

func isPunct(c byte) bool {
	return (c >= '!' && c <= '/') || (c >= ':' && c <= '@') || (c >= '[' && c <= '`') || (c >= '{' && c <= '~')
}

func isIDByte(c byte) bool {
	return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-'
}

// fence reports the opening marker of a fenced code block line ("" for none).
func fence(line string) string {
	i := 0
	for i < 3 && i < len(line) && line[i] == ' ' {
		i++
	}
	rest := line[i:]
	for _, ch := range []byte{'`', '~'} {
		n := 0
		for n < len(rest) && rest[n] == ch {
			n++
		}
		if n >= 3 {
			return rest[:n]
		}
	}
	return ""
}

// maskCode blanks the code spans of a line, keeping its length.
func maskCode(line string) string {
	if !strings.Contains(line, "`") {
		return line
	}
	var b strings.Builder
	i := 0
	for i < len(line) {
		if line[i] != '`' {
			b.WriteByte(line[i])
			i++
			continue
		}
		n := 0
		for i+n < len(line) && line[i+n] == '`' {
			n++
		}
		run := line[i : i+n]
		end := strings.Index(line[i+n:], run)
		if end < 0 {
			b.WriteString(run)
			i += n
			continue
		}
		end += i + n
		b.WriteString(strings.Repeat(" ", end+n-i))
		i = end + n
	}
	return b.String()
}

// scanAt reads a link starting at the '[' at i; ok false when there is none.
func scanAt(line string, i int) (Link, int, bool) {
	j := i + 1
	var label strings.Builder
	for {
		if j >= len(line) {
			return Link{}, 0, false
		}
		c := line[j]
		if c == '\\' && j+1 < len(line) && isPunct(line[j+1]) {
			label.WriteByte(line[j+1])
			j += 2
			continue
		}
		if c == '[' {
			return Link{}, 0, false
		}
		if c == ']' {
			break
		}
		label.WriteByte(c)
		j++
	}
	if !strings.HasPrefix(line[j+1:], "(?") {
		return Link{}, 0, false
	}
	k := j + 3
	kind := ""
	for _, kd := range kinds {
		if strings.HasPrefix(line[k:], kd+"=") {
			kind = kd
			break
		}
	}
	if kind == "" {
		return Link{}, 0, false
	}
	k += len(kind) + 1
	start := k
	for k < len(line) && isIDByte(line[k]) {
		k++
	}
	if k == start || k >= len(line) || line[k] != ')' {
		return Link{}, 0, false
	}
	return Link{Kind: kind, ID: line[start:k], Label: label.String()}, k + 1, true
}

func scanLine(line string, out []Link) []Link {
	i := strings.IndexByte(line, '[')
	for i >= 0 {
		back := 0
		for i-back-1 >= 0 && line[i-back-1] == '\\' {
			back++
		}
		next := i + 1
		if back%2 == 0 {
			if l, end, ok := scanAt(line, i); ok {
				out = append(out, l)
				next = end
			}
		}
		if next >= len(line) {
			return out
		}
		at := strings.IndexByte(line[next:], '[')
		if at < 0 {
			return out
		}
		i = next + at
	}
	return out
}

// LinksIn returns the internal links of a Markdown text in order, duplicates kept.
func LinksIn(markdown string) []Link {
	if !strings.Contains(markdown, "](?") {
		return nil
	}
	text := strings.ReplaceAll(strings.ReplaceAll(markdown, "\r\n", "\n"), "\r", "\n")
	var out []Link
	open := ""
	for _, line := range strings.Split(text, "\n") {
		if open != "" {
			if strings.HasPrefix(strings.TrimLeftFunc(line, unicode.IsSpace), open) {
				open = ""
			}
			continue
		}
		if f := fence(line); f != "" {
			open = f
			continue
		}
		if strings.Contains(line, "](?") {
			out = scanLine(maskCode(line), out)
		}
	}
	return out
}

// Targets returns the distinct targets of a text's links, in order of first
// appearance, each with the label of its first link.
func Targets(markdown string) []Link {
	seen := map[string]bool{}
	var out []Link
	for _, l := range LinksIn(markdown) {
		if !seen[l.Key()] {
			seen[l.Key()] = true
			out = append(out, l)
		}
	}
	return out
}
