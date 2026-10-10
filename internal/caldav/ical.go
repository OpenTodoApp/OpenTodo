// Package caldav holds the protocol pieces of the CalDAV endpoint (OpenSpec
// change `caldav`): a small iCalendar (RFC 5545) tokenizer and serialiser for the
// VTODO subset, the mapping between VTODO resources and task fields, and the
// WebDAV XML request parsing and multistatus rendering. It has no HTTP handlers
// and never touches the database: internal/httpapi wires it to the op log, so
// every write from a calendar client is an ordinary operation.
package caldav

import (
	"bytes"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

// Limits on parsed input; anything beyond them is refused as invalid data.
const (
	MaxBodyBytes  = 1 << 20 // one resource
	maxDepth      = 8
	maxProps      = 5000
	maxLineOctets = 75 // folding width (RFC 5545 3.1), excluding CRLF
)

// ErrInvalid wraps every parse failure of calendar data.
var ErrInvalid = errors.New("invalid calendar data")

// Param is one property parameter; Values are unquoted.
type Param struct {
	Name   string
	Values []string
}

// Prop is one content line. Value is the raw (still escaped) value text.
type Prop struct {
	Name   string
	Params []Param
	Value  string
}

// Param returns the first value of a parameter ("" when absent).
func (p Prop) Param(name string) string {
	for _, pa := range p.Params {
		if strings.EqualFold(pa.Name, name) && len(pa.Values) > 0 {
			return pa.Values[0]
		}
	}
	return ""
}

// Component is a BEGIN/END block with its properties and nested components in
// document order.
type Component struct {
	Name     string
	Props    []Prop
	Children []*Component
}

// Prop returns the first property with the given name, or nil.
func (c *Component) Prop(name string) *Prop {
	for i := range c.Props {
		if c.Props[i].Name == name {
			return &c.Props[i]
		}
	}
	return nil
}

// Unfold joins folded lines (a CRLF or LF followed by a space or tab continues
// the previous line) and returns the logical content lines without terminators.
func Unfold(data []byte) []string {
	s := strings.ReplaceAll(string(data), "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	var out []string
	for _, line := range strings.Split(s, "\n") {
		if len(line) > 0 && (line[0] == ' ' || line[0] == '\t') && len(out) > 0 {
			out[len(out)-1] += line[1:]
			continue
		}
		if strings.TrimSpace(line) == "" {
			continue
		}
		out = append(out, line)
	}
	return out
}

// ParseLine splits one unfolded content line into name, parameters and value.
func ParseLine(line string) (Prop, error) {
	var p Prop
	i := 0
	for i < len(line) && line[i] != ';' && line[i] != ':' {
		i++
	}
	if i == 0 || i == len(line) {
		return p, fmt.Errorf("%w: malformed content line", ErrInvalid)
	}
	p.Name = strings.ToUpper(line[:i])
	if !validName(p.Name) {
		return p, fmt.Errorf("%w: bad property name %q", ErrInvalid, truncate(p.Name, 40))
	}
	for line[i] == ';' {
		i++
		start := i
		for i < len(line) && line[i] != '=' {
			if line[i] == ':' || line[i] == ';' {
				return p, fmt.Errorf("%w: parameter without value", ErrInvalid)
			}
			i++
		}
		if i >= len(line) {
			return p, fmt.Errorf("%w: unterminated parameter", ErrInvalid)
		}
		param := Param{Name: strings.ToUpper(line[start:i])}
		if !validName(param.Name) {
			return p, fmt.Errorf("%w: bad parameter name", ErrInvalid)
		}
		i++ // '='
		for {
			if i < len(line) && line[i] == '"' {
				end := strings.IndexByte(line[i+1:], '"')
				if end < 0 {
					return p, fmt.Errorf("%w: unterminated quoted parameter", ErrInvalid)
				}
				param.Values = append(param.Values, line[i+1:i+1+end])
				i += end + 2
			} else {
				start := i
				for i < len(line) && line[i] != ',' && line[i] != ';' && line[i] != ':' {
					i++
				}
				param.Values = append(param.Values, line[start:i])
			}
			if i < len(line) && line[i] == ',' {
				i++
				continue
			}
			break
		}
		p.Params = append(p.Params, param)
		if i >= len(line) {
			return p, fmt.Errorf("%w: missing value", ErrInvalid)
		}
		if line[i] != ';' && line[i] != ':' {
			return p, fmt.Errorf("%w: malformed parameter list", ErrInvalid)
		}
	}
	p.Value = line[i+1:]
	return p, nil
}

func validName(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if !(c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-') {
			return false
		}
	}
	return true
}

// Parse reads one iCalendar object (a VCALENDAR). It never panics; malformed
// input yields an error wrapping ErrInvalid.
func Parse(data []byte) (*Component, error) {
	if len(data) > MaxBodyBytes {
		return nil, fmt.Errorf("%w: larger than %d bytes", ErrInvalid, MaxBodyBytes)
	}
	if !utf8.Valid(data) {
		return nil, fmt.Errorf("%w: not UTF-8", ErrInvalid)
	}
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	lines := Unfold(data)
	if len(lines) > maxProps {
		return nil, fmt.Errorf("%w: too many lines", ErrInvalid)
	}
	var root *Component
	var stack []*Component
	for _, line := range lines {
		p, err := ParseLine(line)
		if err != nil {
			return nil, err
		}
		switch p.Name {
		case "BEGIN":
			name := strings.ToUpper(strings.TrimSpace(p.Value))
			if !validName(name) {
				return nil, fmt.Errorf("%w: bad component name", ErrInvalid)
			}
			if root != nil && len(stack) == 0 {
				return nil, fmt.Errorf("%w: content after the calendar object", ErrInvalid)
			}
			if len(stack) >= maxDepth {
				return nil, fmt.Errorf("%w: nested too deeply", ErrInvalid)
			}
			c := &Component{Name: name}
			if len(stack) == 0 {
				root = c
			} else {
				parent := stack[len(stack)-1]
				parent.Children = append(parent.Children, c)
			}
			stack = append(stack, c)
		case "END":
			name := strings.ToUpper(strings.TrimSpace(p.Value))
			if len(stack) == 0 || stack[len(stack)-1].Name != name {
				return nil, fmt.Errorf("%w: unbalanced END:%s", ErrInvalid, truncate(name, 40))
			}
			stack = stack[:len(stack)-1]
		default:
			if len(stack) == 0 {
				return nil, fmt.Errorf("%w: property outside a component", ErrInvalid)
			}
			cur := stack[len(stack)-1]
			cur.Props = append(cur.Props, p)
		}
	}
	if root == nil || len(stack) != 0 {
		return nil, fmt.Errorf("%w: incomplete calendar object", ErrInvalid)
	}
	if root.Name != "VCALENDAR" {
		return nil, fmt.Errorf("%w: expected VCALENDAR, got %s", ErrInvalid, truncate(root.Name, 40))
	}
	return root, nil
}

// Line serialises one property as an unfolded content line.
func (p Prop) Line() string {
	var b strings.Builder
	b.WriteString(p.Name)
	for _, pa := range p.Params {
		b.WriteByte(';')
		b.WriteString(pa.Name)
		b.WriteByte('=')
		for i, v := range pa.Values {
			if i > 0 {
				b.WriteByte(',')
			}
			if strings.ContainsAny(v, ";:,") {
				b.WriteByte('"')
				b.WriteString(strings.ReplaceAll(v, `"`, ""))
				b.WriteByte('"')
			} else {
				b.WriteString(v)
			}
		}
	}
	b.WriteByte(':')
	b.WriteString(p.Value)
	return b.String()
}

// Lines serialises a component as unfolded content lines.
func (c *Component) Lines() []string {
	out := []string{"BEGIN:" + c.Name}
	for _, p := range c.Props {
		out = append(out, p.Line())
	}
	for _, ch := range c.Children {
		out = append(out, ch.Lines()...)
	}
	return append(out, "END:"+c.Name)
}

// Encode serialises a component with CRLF line endings and folding.
func (c *Component) Encode() []byte {
	var b bytes.Buffer
	for _, l := range c.Lines() {
		writeFolded(&b, l)
	}
	return b.Bytes()
}

// writeFolded writes one content line folded at 75 octets without splitting a
// UTF-8 sequence, continuation lines starting with one space.
func writeFolded(b *bytes.Buffer, line string) {
	limit := maxLineOctets
	for len(line) > limit {
		cut := limit
		for cut > 0 && !utf8.RuneStart(line[cut]) {
			cut--
		}
		b.WriteString(line[:cut])
		b.WriteString("\r\n ")
		line = line[cut:]
		limit = maxLineOctets - 1
	}
	b.WriteString(line)
	b.WriteString("\r\n")
}

// EscapeText escapes a TEXT value (RFC 5545 3.3.11).
func EscapeText(s string) string {
	r := strings.NewReplacer(`\`, `\\`, ";", `\;`, ",", `\,`, "\r\n", `\n`, "\n", `\n`, "\r", `\n`)
	return r.Replace(s)
}

// UnescapeText reverses EscapeText; unknown escapes keep the escaped character.
func UnescapeText(s string) string {
	if !strings.Contains(s, `\`) {
		return s
	}
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c != '\\' || i+1 == len(s) {
			b.WriteByte(c)
			continue
		}
		i++
		switch s[i] {
		case 'n', 'N':
			b.WriteByte('\n')
		default:
			b.WriteByte(s[i])
		}
	}
	return b.String()
}

// SplitText splits a multi-valued TEXT property (CATEGORIES) on unescaped
// commas and unescapes each value.
func SplitText(s string) []string {
	var out []string
	var cur strings.Builder
	for i := 0; i < len(s); i++ {
		switch {
		case s[i] == '\\' && i+1 < len(s):
			cur.WriteByte(s[i])
			cur.WriteByte(s[i+1])
			i++
		case s[i] == ',':
			out = append(out, UnescapeText(cur.String()))
			cur.Reset()
		default:
			cur.WriteByte(s[i])
		}
	}
	return append(out, UnescapeText(cur.String()))
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
