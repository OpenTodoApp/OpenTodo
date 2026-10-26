package vault

import (
	"regexp"
	"strconv"
	"strings"
)

// A task note's frontmatter (design D4): a subset reader that records the
// lines every top-level key occupies, and a line editor that replaces only
// the lines of a key whose value changed. Every other line stays byte for
// byte, so key order, comments and keys the vault does not know survive.
// No YAML library: the forms TaskNotes writes are few, and anything else
// makes only that one field read-only.

// Kinds of a frontmatter value.
const (
	kindNull        = iota // the key with no value
	kindScalar             // a plain or quoted scalar
	kindList               // a block or flow sequence of scalars
	kindMaps               // a block sequence of flat maps (time entries)
	kindUnsupported        // anything else: read-only
)

// frontKey is one top-level key and the lines [start, end) it occupies.
type frontKey struct {
	Name       string
	start, end int
	Kind       int
	Scalar     string
	List       []string
	Maps       []fmMap
	// flow is a list written as `[a, b]`; indent is a block list's item prefix.
	flow   bool
	indent string
	// raw holds each list item as written, so unchanged items keep their text.
	raw []string
}

// fmMap is one flat map of a sequence, keys in file order.
type fmMap struct {
	Keys []string
	Vals map[string]string
}

func (m fmMap) get(k string) (string, bool) {
	v, ok := m.Vals[k]
	return v, ok
}

// Front is a parsed note: its frontmatter lines, keys and body.
type Front struct {
	Has   bool
	Lines []string // the lines between the two `---` lines
	Keys  []*frontKey
	Body  string // everything after the closing `---` line
	crlf  bool
	// closing is the closing line as written; closeNL whether a line end follows.
	closing string
	closeNL bool
	index   map[string]*frontKey
}

var (
	fmKeyRe     = regexp.MustCompile(`^([^\s#\-:'"\[\]{}][^:]*?|"[^"]+"|'[^']+'):(?:[ \t]+(.*?))?[ \t]*$`)
	fmItemRe    = regexp.MustCompile(`^([ \t]*)-(?:[ \t]+(.*?))?[ \t]*$`)
	fmItemMapRe = regexp.MustCompile(`^([^\s#\-:'"\[\]{}][^:]*?):(?:[ \t]+(.*?))?$`)
	fmSubRe     = regexp.MustCompile(`^([ \t]+)([^\s#\-:'"][^:]*?):(?:[ \t]+(.*?))?[ \t]*$`)
)

// ParseFront splits a note into frontmatter and body and reads its keys.
func ParseFront(text string) *Front {
	f := &Front{index: map[string]*frontKey{}}
	// CRLF only when every line ends so; mixed line ends are kept as written.
	f.crlf = strings.Contains(text, "\r\n") && strings.Count(text, "\r\n") == strings.Count(text, "\n")
	norm := text
	if f.crlf {
		norm = strings.ReplaceAll(text, "\r\n", "\n")
	}
	if !strings.HasPrefix(norm, "---\n") {
		f.Body = norm
		return f
	}
	rest := norm[4:]
	lines := strings.Split(rest, "\n")
	closeAt := -1
	for i, l := range lines {
		if strings.TrimRight(l, " \t") == "---" {
			closeAt = i
			break
		}
	}
	if closeAt < 0 {
		f.Body = norm
		return f
	}
	f.Has = true
	f.Lines = lines[:closeAt]
	f.closing = lines[closeAt]
	if closeAt+1 < len(lines) {
		f.closeNL = true
		f.Body = strings.Join(lines[closeAt+1:], "\n")
	}
	f.read()
	return f
}

// read finds the keys and their line ranges, and parses each value.
func (f *Front) read() {
	f.Keys, f.index = nil, map[string]*frontKey{}
	var cur *frontKey
	for i, l := range f.Lines {
		if m := fmKeyRe.FindStringSubmatch(l); m != nil {
			cur = &frontKey{Name: unquote(m[1]), start: i, end: i + 1}
			f.Keys = append(f.Keys, cur)
			if _, dup := f.index[cur.Name]; !dup {
				f.index[cur.Name] = cur
			}
			continue
		}
		if cur != nil && continues(l) && (strings.TrimSpace(l) != "" || f.continuesAfter(i)) {
			cur.end = i + 1
			continue
		}
		cur = nil
	}
	for _, k := range f.Keys {
		f.parseValue(k)
	}
}

// continues reports a line that can belong to the key above: indented or a
// sequence item.
func continues(l string) bool {
	return l != "" && (l[0] == ' ' || l[0] == '\t' || l[0] == '-')
}

// continuesAfter reports whether a whitespace-only line at i sits inside a
// key's value: the next line with text still belongs to it.
func (f *Front) continuesAfter(i int) bool {
	for _, l := range f.Lines[i+1:] {
		if strings.TrimSpace(l) != "" {
			return continues(l)
		}
	}
	return false
}

// parseValue reads one key's value from its lines.
func (f *Front) parseValue(k *frontKey) {
	m := fmKeyRe.FindStringSubmatch(f.Lines[k.start])
	inline := ""
	if m != nil {
		inline = m[2]
	}
	var cont []string
	for _, l := range f.Lines[k.start+1 : k.end] {
		if t := strings.TrimSpace(l); t == "" || strings.HasPrefix(t, "#") {
			continue
		}
		cont = append(cont, l)
	}
	if inline != "" {
		if len(cont) > 0 {
			k.Kind = kindUnsupported // a plain scalar over several lines
			return
		}
		f.inlineValue(k, inline)
		return
	}
	if len(cont) == 0 {
		k.Kind = kindNull
		return
	}
	// A block sequence: every line an item `- …` at one indent, or a map
	// item's further keys indented under it.
	im := fmItemRe.FindStringSubmatch(cont[0])
	if im == nil {
		k.Kind = kindUnsupported
		return
	}
	k.indent = im[1]
	var list []string
	var maps []fmMap
	isMaps := false
	for idx, l := range cont {
		if it := fmItemRe.FindStringSubmatch(l); it != nil && it[1] == k.indent {
			v := it[2]
			if sm := fmItemMapRe.FindStringSubmatch(v); sm != nil && !strings.HasPrefix(v, `"`) && !strings.HasPrefix(v, `'`) {
				if idx > 0 && !isMaps {
					k.Kind = kindUnsupported
					return
				}
				isMaps = true
				sv, ok := scalarOf(sm[2])
				if !ok {
					k.Kind = kindUnsupported
					return
				}
				maps = append(maps, fmMap{Keys: []string{sm[1]}, Vals: map[string]string{sm[1]: sv}})
				continue
			}
			if isMaps {
				k.Kind = kindUnsupported
				return
			}
			sv, ok := scalarOf(v)
			if !ok {
				k.Kind = kindUnsupported
				return
			}
			list = append(list, sv)
			k.raw = append(k.raw, v)
			continue
		}
		if sm := fmSubRe.FindStringSubmatch(l); sm != nil && isMaps && len(sm[1]) > len(k.indent) {
			sv, ok := scalarOf(sm[3])
			if !ok {
				k.Kind = kindUnsupported
				return
			}
			last := &maps[len(maps)-1]
			if _, seen := last.Vals[sm[2]]; !seen {
				last.Keys = append(last.Keys, sm[2])
			}
			last.Vals[sm[2]] = sv
			continue
		}
		k.Kind = kindUnsupported
		return
	}
	if isMaps {
		k.Kind, k.Maps = kindMaps, maps
		return
	}
	k.Kind, k.List = kindList, list
}

// inlineValue reads a value written on the key's line.
func (f *Front) inlineValue(k *frontKey, v string) {
	if strings.HasPrefix(v, "[") {
		items, raw, ok := flowList(v)
		if !ok {
			k.Kind = kindUnsupported
			return
		}
		k.Kind, k.List, k.raw, k.flow = kindList, items, raw, true
		return
	}
	s, ok := scalarOf(v)
	if !ok {
		k.Kind = kindUnsupported
		return
	}
	if s == "" && (v == "~" || v == "null" || v == "Null" || v == "NULL") {
		k.Kind = kindNull
		return
	}
	k.Kind, k.Scalar = kindScalar, s
}

// scalarOf reads a plain or quoted scalar; ok is false for forms the reader
// does not support (block scalars, anchors, aliases, tags, flow maps).
func scalarOf(v string) (string, bool) {
	v = strings.TrimSpace(v)
	if v == "" || v == "~" || v == "null" || v == "Null" || v == "NULL" {
		return "", true
	}
	switch v[0] {
	case '"':
		end := closingQuote(v)
		if end < 0 || strings.TrimSpace(stripComment(v[end+1:])) != "" {
			return "", false
		}
		s, err := strconv.Unquote(v[:end+1])
		if err != nil {
			return "", false
		}
		return s, true
	case '\'':
		body := v[1:]
		var b strings.Builder
		for i := 0; i < len(body); i++ {
			if body[i] == '\'' {
				if i+1 < len(body) && body[i+1] == '\'' {
					b.WriteByte('\'')
					i++
					continue
				}
				if strings.TrimSpace(stripComment(body[i+1:])) != "" {
					return "", false
				}
				return b.String(), true
			}
			b.WriteByte(body[i])
		}
		return "", false
	case '|', '>', '&', '*', '!', '{', '[', '@', '`':
		return "", false
	}
	return strings.TrimSpace(stripComment(v)), true
}

// closingQuote finds the index of a double-quoted scalar's closing quote.
func closingQuote(v string) int {
	for i := 1; i < len(v); i++ {
		switch v[i] {
		case '\\':
			i++
		case '"':
			return i
		}
	}
	return -1
}

// stripComment removes a ` #` comment from a plain scalar.
func stripComment(v string) string {
	if strings.HasPrefix(v, "#") {
		return ""
	}
	if i := strings.Index(v, " #"); i >= 0 {
		return v[:i]
	}
	if i := strings.Index(v, "\t#"); i >= 0 {
		return v[:i]
	}
	return v
}

// flowList reads `[a, "b", c]` with scalar items only, returning the items
// and their text as written.
func flowList(v string) ([]string, []string, bool) {
	v = strings.TrimSpace(stripFlowComment(v))
	if !strings.HasPrefix(v, "[") || !strings.HasSuffix(v, "]") {
		return nil, nil, false
	}
	inner := strings.TrimSpace(v[1 : len(v)-1])
	if inner == "" {
		return []string{}, []string{}, true
	}
	var out, raw []string
	var cur strings.Builder
	quote := byte(0)
	flush := func() bool {
		s, ok := scalarOf(cur.String())
		if !ok {
			return false
		}
		out = append(out, s)
		raw = append(raw, strings.TrimSpace(cur.String()))
		cur.Reset()
		return true
	}
	for i := 0; i < len(inner); i++ {
		c := inner[i]
		switch {
		case quote == '"' && c == '\\' && i+1 < len(inner):
			cur.WriteByte(c)
			cur.WriteByte(inner[i+1])
			i++
			continue
		case quote != 0 && c == quote:
			if quote == '\'' && i+1 < len(inner) && inner[i+1] == '\'' {
				cur.WriteString("''")
				i++
				continue
			}
			quote = 0
		case quote == 0 && (c == '"' || c == '\''):
			quote = c
		case quote == 0 && (c == '[' || c == ']' || c == '{' || c == '}'):
			return nil, nil, false
		case quote == 0 && c == ',':
			if !flush() {
				return nil, nil, false
			}
			continue
		}
		cur.WriteByte(c)
	}
	if quote != 0 || !flush() {
		return nil, nil, false
	}
	return out, raw, true
}

func stripFlowComment(v string) string {
	if i := strings.LastIndex(v, "]"); i >= 0 {
		rest := strings.TrimSpace(v[i+1:])
		if rest == "" || strings.HasPrefix(rest, "#") {
			return v[:i+1]
		}
	}
	return v
}

// get returns a key (nil when absent).
func (f *Front) get(name string) *frontKey { return f.index[name] }

// str reads a scalar key ("" when absent, null or not a scalar).
func (f *Front) str(name string) string {
	if k := f.get(name); k != nil && k.Kind == kindScalar {
		return k.Scalar
	}
	return ""
}

// strings reads a key as a list: a list's items, or a lone scalar.
func (f *Front) strings(name string) []string {
	k := f.get(name)
	switch {
	case k == nil:
		return nil
	case k.Kind == kindList:
		return k.List
	case k.Kind == kindScalar && k.Scalar != "":
		return []string{k.Scalar}
	}
	return nil
}

// supported reports a key that is absent or in a form the vault can read
// and rewrite.
func (f *Front) supported(name string) bool {
	k := f.get(name)
	return k == nil || k.Kind != kindUnsupported
}

// fmEdit is one change: the new lines of a key, nil to remove it.
type fmEdit struct {
	name  string
	lines []string
}

// apply returns the note with the edits applied: a key's lines replaced in
// place, a removed key's lines dropped, a new key appended at the end of the
// frontmatter. A note without frontmatter gets one. body replaces the body
// when non-nil.
func (f *Front) apply(edits []fmEdit, body *string) string {
	repl := map[int][]string{} // start line → replacement
	drop := map[int]bool{}
	var appended []string
	for _, e := range edits {
		k := f.get(e.name)
		if k == nil {
			appended = append(appended, e.lines...)
			continue
		}
		for i := k.start; i < k.end; i++ {
			drop[i] = true
		}
		repl[k.start] = e.lines
	}
	var out []string
	for i, l := range f.Lines {
		if r, ok := repl[i]; ok {
			out = append(out, r...)
		}
		if drop[i] {
			continue
		}
		out = append(out, l)
	}
	// New keys go after the last key's lines, before trailing blank lines.
	at := len(out)
	for at > 0 && strings.TrimSpace(out[at-1]) == "" {
		at--
	}
	out = append(out[:at], append(appended, out[at:]...)...)
	b := f.Body
	if body != nil {
		b = *body
	}
	closing, nl := f.closing, f.closeNL
	if !f.Has {
		closing, nl = "---", true
	}
	if b != "" {
		nl = true
	}
	text := "---\n"
	for _, l := range out {
		text += l + "\n"
	}
	text += closing
	if nl {
		text += "\n" + b
	}
	if f.crlf {
		text = strings.ReplaceAll(text, "\n", "\r\n")
	}
	return text
}

// fmScalar writes a scalar, quoted only when YAML needs it.
func fmScalar(s string) string {
	if s == "" {
		return `""`
	}
	if needsQuote(s) {
		return strconv.Quote(s)
	}
	return s
}

var (
	fmNumberRe = regexp.MustCompile(`^[-+]?(\d[\d_]*(\.\d*)?|\.\d+)([eE][-+]?\d+)?$|^0x[0-9a-fA-F]+$|^0o[0-7]+$`)
	fmWordRe   = regexp.MustCompile(`^(?i:true|false|yes|no|on|off|null|~|y|n|\.inf|-\.inf|\.nan)$`)
)

func needsQuote(s string) bool {
	if strings.TrimSpace(s) != s || strings.ContainsAny(s, "\n\r\t\"\\") {
		return true
	}
	if strings.ContainsRune(`-?:,[]{}#&*!|>'%@`+"`", rune(s[0])) {
		return true
	}
	if strings.Contains(s, ": ") || strings.Contains(s, " #") || strings.HasSuffix(s, ":") {
		return true
	}
	return fmNumberRe.MatchString(s) || fmWordRe.MatchString(s)
}

// fmScalarLine is `key: value`.
func fmScalarLine(key, v string) []string { return []string{fmKey(key) + ": " + fmScalar(v)} }

// fmRawLine is `key: value` with the value written as is (dates, numbers).
func fmRawLine(key, v string) []string { return []string{fmKey(key) + ": " + v} }

// fmListLines writes a list in the style the key had: flow, or a block list
// with the key's item indent (two spaces for a new key, as TaskNotes writes).
// An item the old list held keeps the text it was written with.
func fmListLines(key string, items []string, old *frontKey) []string {
	rawOf := map[string][]string{}
	if old != nil && old.Kind == kindList {
		for i, v := range old.List {
			if i < len(old.raw) {
				rawOf[v] = append(rawOf[v], old.raw[i])
			}
		}
	}
	text := func(v string) string {
		if r := rawOf[v]; len(r) > 0 {
			rawOf[v] = r[1:]
			return r[0]
		}
		return fmScalar(v)
	}
	if len(items) == 0 {
		return []string{fmKey(key) + ": []"}
	}
	if old != nil && old.flow {
		parts := make([]string, len(items))
		for i, it := range items {
			parts[i] = text(it)
		}
		return []string{fmKey(key) + ": [" + strings.Join(parts, ", ") + "]"}
	}
	indent := "  "
	if old != nil && old.Kind == kindList && !old.flow && len(old.List) > 0 {
		indent = old.indent
	}
	out := []string{fmKey(key) + ":"}
	for _, it := range items {
		out = append(out, indent+"- "+text(it))
	}
	return out
}

// fmMapsLines writes a sequence of flat maps (time entries).
func fmMapsLines(key string, maps []fmMap) []string {
	if len(maps) == 0 {
		return []string{fmKey(key) + ": []"}
	}
	out := []string{fmKey(key) + ":"}
	for _, m := range maps {
		for i, k := range m.Keys {
			prefix := "    "
			if i == 0 {
				prefix = "  - "
			}
			out = append(out, prefix+k+": "+fmScalar(m.Vals[k]))
		}
	}
	return out
}

// fmKey writes a key, quoted when it holds characters a plain key cannot.
func fmKey(k string) string {
	if strings.ContainsAny(k, ":#") || strings.TrimSpace(k) != k {
		return strconv.Quote(k)
	}
	return k
}
