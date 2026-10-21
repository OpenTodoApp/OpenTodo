// Package vault keeps one folder of Markdown files in two-way sync with an
// account (OpenSpec change markdown-vault): every project is a file, every task
// a checklist line in the Obsidian Tasks format, and the folder is an ordinary
// sync device that pulls and pushes operations through the log. It is linked
// into the `ot` CLI only, never into the server, and uses the standard library
// plus OpenTodo's pure helper packages.
package vault

import (
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

// The Obsidian Tasks markers the vault maps (design D4). Each may be followed
// by the emoji variation selector U+FE0F, which the parser ignores.
const (
	markDue      = "📅"
	markStart    = "🛫"
	markDone     = "✅"
	markCreated  = "➕"
	markRecur    = "🔁"
	markID       = "🆔"
	markBlocked  = "⛔"
	markHighest  = "🔺"
	markHigh     = "⏫"
	markMedium   = "🔼"
	markLow      = "🔽"
	markLowest   = "⏬"
	variationSel = "️"
)

// valueMarkers take a value after them; priorityMarkers stand alone.
var (
	valueMarkers    = []string{markDue, markStart, markDone, markCreated, markRecur, markID, markBlocked}
	priorityMarkers = map[string]int{markHighest: 1, markHigh: 2, markMedium: 3, markLow: 4, markLowest: 4}
	// unknownMarkers are Obsidian Tasks fields the vault does not map: kept as
	// text after the title, never parsed into a field (`⏳` scheduled, `❌`
	// cancelled, `🏁` on completion, `⏰` reminders of other plugins).
	unknownMarkers = []string{"⏳", "❌", "🏁", "⏰"}
)

// priorityMarker is how a priority is written; 4 (the default) has none.
var priorityMarker = map[int]string{1: markHighest, 2: markHigh, 3: markMedium}

// The inline fields (Dataview `[key:: value]`) the vault maps, and the
// read-only ones it writes from the app and never pushes.
var (
	inlineFields   = map[string]bool{"time": true, "tz": true, "deadline": true, "estimate": true, "someday": true, "evening": true}
	readOnlyFields = map[string]bool{"origin": true, "location": true, "tracked": true}
)

var (
	taskLineRe = regexp.MustCompile(`^([ \t]*)- \[([ xX])\](?:[ \t]+(.*))?$`)
	dateRe     = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}`)
	idRe       = regexp.MustCompile(`^[A-Za-z0-9_-]+`)
	blockedRe  = regexp.MustCompile(`^[A-Za-z0-9_-]+(?:[ \t]*,[ \t]*[A-Za-z0-9_-]+)*`)
	inlineRe   = regexp.MustCompile(`^\[([A-Za-z][A-Za-z0-9_\- ]*(?::[^:\]]+)?)::[ \t]*([^\]]*)\]`)
	tagRe      = regexp.MustCompile(`^#([\p{L}\p{N}_/\-]+)`)
)

// Line is one parsed task line. Fields hold the text as written; Bad lists the
// fields whose value did not parse (the task keeps its value for those).
type Line struct {
	// Indent is the line's indentation: two spaces or one tab per nesting level.
	Indent string
	Done   bool
	Title  string
	// Trailing is the text the vault does not understand (`⏳ 2026-10-24`,
	// `[[links]]`, unknown inline fields), kept on the line after the title.
	Trailing string
	Due      string
	Start    string // a date, or "someday" from [someday:: true]
	DoneDate string
	Created  string
	Recur    string
	Priority int // 0: no marker (4)
	ID       string
	Blocked  []string
	Tags     []string
	Time     string
	TZ       string
	Deadline string
	Estimate string
	Evening  bool
	// ReadOnly holds the read-only inline fields as written: origin, location,
	// tracked and field:<name>.
	ReadOnly map[string]string
	// Has records which fields the line carries at all.
	Has map[string]bool
}

// isTaskLine reports whether a line is a task line and returns its parts.
func isTaskLine(s string) (indent string, done bool, content string, ok bool) {
	m := taskLineRe.FindStringSubmatch(s)
	if m == nil {
		return "", false, "", false
	}
	return m[1], m[2] != " ", m[3], true
}

// widthOf is the indentation width with a tab counted as two spaces.
func widthOf(indent string) int {
	w := 0
	for _, r := range indent {
		if r == '\t' {
			w += 2
		} else {
			w++
		}
	}
	return w
}

// token is one piece of a task line's content after the checkbox.
type token struct {
	kind  string // "text", "unknown", or a field name
	text  string // the raw text of the token
	value string
}

// atMarker returns the marker starting s, if any, ignoring a variation selector.
func atMarker(s string, markers []string) (string, int) {
	for _, m := range markers {
		if strings.HasPrefix(s, m) {
			n := len(m)
			if strings.HasPrefix(s[n:], variationSel) {
				n += len(variationSel)
			}
			return m, n
		}
	}
	return "", 0
}

func atPriority(s string) (int, int) {
	for m, p := range priorityMarkers {
		if strings.HasPrefix(s, m) {
			n := len(m)
			if strings.HasPrefix(s[n:], variationSel) {
				n += len(variationSel)
			}
			return p, n
		}
	}
	return 0, 0
}

func skipSpace(s string) string { return strings.TrimLeft(s, " \t") }

// isTag reports a #tag: letters, digits, `_`, `/` and `-`, not digits only (so
// `#42` in "PR #42" stays text, as in Obsidian).
func isTag(name string) bool {
	for _, r := range name {
		if !unicode.IsDigit(r) {
			return true
		}
	}
	return false
}

// fieldAt recognises a mapped or read-only field at the start of s and returns
// the token and its byte length. Unknown starters return kind "unknown".
func fieldAt(s string) (token, int, bool) {
	if m, n := atMarker(s, valueMarkers); m != "" {
		rest := s[n:]
		sp := len(rest) - len(skipSpace(rest))
		rest = rest[sp:]
		var v string
		switch m {
		case markDue, markStart, markDone, markCreated:
			v = dateRe.FindString(rest)
		case markID:
			v = idRe.FindString(rest)
		case markBlocked:
			v = blockedRe.FindString(rest)
		case markRecur:
			v = strings.TrimRight(recurText(rest), " \t")
		}
		kind := map[string]string{markDue: "due", markStart: "start", markDone: "done", markCreated: "created", markRecur: "recur", markID: "id", markBlocked: "blocked"}[m]
		return token{kind: kind, text: s[:n+sp+len(v)], value: v}, n + sp + len(v), true
	}
	if p, n := atPriority(s); p > 0 {
		return token{kind: "priority", text: s[:n], value: string(rune('0' + p))}, n, true
	}
	if m, n := atMarker(s, unknownMarkers); m != "" {
		return token{kind: "unknown", text: s[:n]}, n, true
	}
	if strings.HasPrefix(s, "[[") {
		if end := strings.Index(s, "]]"); end >= 0 {
			return token{kind: "unknown", text: s[:end+2]}, end + 2, true
		}
	}
	if m := inlineRe.FindStringSubmatch(s); m != nil {
		key := strings.TrimSpace(m[1])
		val := strings.TrimSpace(m[2])
		switch {
		case inlineFields[key]:
			return token{kind: key, text: m[0], value: val}, len(m[0]), true
		case readOnlyFields[key] || strings.HasPrefix(key, "field:"):
			return token{kind: "ro:" + key, text: m[0], value: val}, len(m[0]), true
		}
		return token{kind: "unknown", text: m[0]}, len(m[0]), true
	}
	if m := tagRe.FindStringSubmatch(s); m != nil && isTag(m[1]) {
		end := len(m[0])
		if end == len(s) || s[end] == ' ' || s[end] == '\t' {
			return token{kind: "tag", text: m[0], value: m[1]}, end, true
		}
	}
	return token{}, 0, false
}

// recurText is a rule's text: everything up to the next recognised field.
func recurText(s string) string {
	for i := 0; i < len(s); {
		if i > 0 && (s[i-1] == ' ' || s[i-1] == '\t') {
			if _, n, ok := fieldAt(s[i:]); ok && n > 0 {
				return s[:i]
			}
		}
		_, size := utf8.DecodeRuneInString(s[i:])
		i += size
	}
	return s
}

// tokenize splits a task line's content into text, unknown and field tokens.
// A backslash before a marker keeps it as text (the printer escapes titles).
func tokenize(s string) []token {
	var out []token
	var text strings.Builder
	flush := func() {
		if text.Len() > 0 {
			out = append(out, token{kind: "text", text: text.String()})
			text.Reset()
		}
	}
	boundary := true
	for i := 0; i < len(s); {
		if boundary && s[i] == '\\' && i+1 < len(s) {
			if _, n, ok := fieldAt(s[i+1:]); ok && n > 0 {
				text.WriteString(s[i+1 : i+1+n])
				i += 1 + n
				boundary = false
				continue
			}
		}
		if boundary {
			if tok, n, ok := fieldAt(s[i:]); ok && n > 0 {
				flush()
				out = append(out, tok)
				i += n
				boundary = true
				continue
			}
		}
		r, size := utf8.DecodeRuneInString(s[i:])
		text.WriteRune(r)
		boundary = r == ' ' || r == '\t'
		i += size
	}
	flush()
	return out
}

// ParseLine parses the content of a task line (after `- [ ] `).
func ParseLine(indent string, done bool, content string) Line {
	l := Line{Indent: indent, Done: done, ReadOnly: map[string]string{}, Has: map[string]bool{}}
	var title, trailing []string
	unknown := false
	for _, tok := range tokenize(content) {
		switch tok.kind {
		case "text":
			if t := strings.TrimSpace(tok.text); t != "" {
				if unknown {
					trailing = append(trailing, t)
				} else {
					title = append(title, t)
				}
			}
			continue
		case "unknown":
			unknown = true
			trailing = append(trailing, strings.TrimSpace(tok.text))
			continue
		}
		l.Has[tok.kind] = true
		switch tok.kind {
		case "due":
			l.Due = tok.value
		case "start":
			l.Start = tok.value
		case "done":
			l.DoneDate = tok.value
		case "created":
			l.Created = tok.value
		case "recur":
			l.Recur = tok.value
		case "id":
			l.ID = tok.value
		case "blocked":
			for _, id := range strings.Split(tok.value, ",") {
				if id = strings.TrimSpace(id); id != "" {
					l.Blocked = append(l.Blocked, id)
				}
			}
		case "priority":
			l.Priority = int(tok.value[0] - '0')
		case "tag":
			l.Tags = append(l.Tags, tok.value)
		case "time":
			l.Time = tok.value
		case "tz":
			l.TZ = tok.value
		case "deadline":
			l.Deadline = tok.value
		case "estimate":
			l.Estimate = tok.value
		case "someday":
			if strings.EqualFold(tok.value, "true") {
				l.Start = "someday"
				l.Has["start"] = true
			}
		case "evening":
			l.Evening = strings.EqualFold(tok.value, "true")
		default:
			if strings.HasPrefix(tok.kind, "ro:") {
				l.ReadOnly[strings.TrimPrefix(tok.kind, "ro:")] = tok.value
			}
		}
	}
	l.Title = strings.Join(title, " ")
	l.Trailing = strings.Join(trailing, " ")
	return l
}

// escapeTitle puts a backslash before every word of a title that the parser
// would read as a field, so a printed title always parses back to itself.
func escapeTitle(title string) string {
	var b strings.Builder
	boundary := true
	for i := 0; i < len(title); {
		if boundary {
			if _, n, ok := fieldAt(title[i:]); ok && n > 0 {
				b.WriteByte('\\')
				b.WriteString(title[i : i+n])
				i += n
				boundary = false
				continue
			}
		}
		r, size := utf8.DecodeRuneInString(title[i:])
		b.WriteRune(r)
		boundary = r == ' ' || r == '\t'
		i += size
	}
	return b.String()
}

// PrintLine writes a task line in the vault's field order (design D4).
func PrintLine(l Line) string {
	var b strings.Builder
	b.WriteString(l.Indent)
	if l.Done {
		b.WriteString("- [x] ")
	} else {
		b.WriteString("- [ ] ")
	}
	parts := []string{escapeTitle(l.Title)}
	if l.Title == "" {
		parts = nil
	}
	if l.Trailing != "" {
		parts = append(parts, l.Trailing)
	}
	if l.Due != "" {
		parts = append(parts, markDue+" "+l.Due)
	}
	if l.Time != "" {
		parts = append(parts, "[time:: "+l.Time+"]")
	}
	if l.TZ != "" {
		parts = append(parts, "[tz:: "+l.TZ+"]")
	}
	switch {
	case l.Start == "someday":
		parts = append(parts, "[someday:: true]")
	case l.Start != "":
		parts = append(parts, markStart+" "+l.Start)
	}
	if l.Deadline != "" {
		parts = append(parts, "[deadline:: "+l.Deadline+"]")
	}
	if l.Estimate != "" {
		parts = append(parts, "[estimate:: "+l.Estimate+"]")
	}
	if l.Evening {
		parts = append(parts, "[evening:: true]")
	}
	if m := priorityMarker[l.Priority]; m != "" {
		parts = append(parts, m)
	}
	if l.Recur != "" {
		parts = append(parts, markRecur+" "+l.Recur)
	}
	for _, t := range l.Tags {
		parts = append(parts, "#"+t)
	}
	if len(l.Blocked) > 0 {
		parts = append(parts, markBlocked+" "+strings.Join(l.Blocked, ","))
	}
	if l.Created != "" {
		parts = append(parts, markCreated+" "+l.Created)
	}
	if l.Done && l.DoneDate != "" {
		parts = append(parts, markDone+" "+l.DoneDate)
	}
	keys := make([]string, 0, len(l.ReadOnly))
	for k := range l.ReadOnly {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		return readOnlyRank(keys[i]) < readOnlyRank(keys[j]) || (readOnlyRank(keys[i]) == readOnlyRank(keys[j]) && keys[i] < keys[j])
	})
	for _, k := range keys {
		parts = append(parts, "["+k+":: "+l.ReadOnly[k]+"]")
	}
	if l.ID != "" {
		parts = append(parts, markID+" "+l.ID)
	}
	b.WriteString(strings.Join(parts, " "))
	return b.String()
}

// readOnlyRank orders the read-only fields: origin, location, tracked, then
// custom fields by name.
func readOnlyRank(k string) int {
	switch k {
	case "origin":
		return 0
	case "location":
		return 1
	case "tracked":
		return 2
	}
	return 3
}
