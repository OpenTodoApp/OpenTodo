package email

// HTML mail as task notes (OpenSpec change email-html-notes): an HTML body
// becomes the Markdown subset the notes editor renders (web/src/lib/richtext.ts:
// headings, **bold**, _italic_, ~~strike~~, [text](url), - and 1. lists, a
// newline as a line break), so a newsletter keeps its structure and its long
// tracking links hide behind their text. It is plain string scanning: nothing in
// the HTML is fetched or run, and only http(s) links survive.

import (
	"html"
	"net/url"
	"regexp"
	"strings"
)

var (
	reAttr = regexp.MustCompile(`([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?`)
	// Styles that hide an element: the preview text and spacers of newsletters.
	reHiddenStyle = regexp.MustCompile(`(?i)display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all|max-height\s*:\s*0(?:px)?\s*(?:;|$|!)`)
	// Characters that render as nothing: the filler newsletters put after their preview text.
	invisible = strings.NewReplacer("\u034f", "", "\u200b", "", "\u200c", "", "\u200d", "", "\u200e", "", "\u200f", "",
		"\u2060", "", "\u2061", "", "\u2062", "", "\u2063", "", "\u2064", "", "\ufeff", "", "\u00ad", "", "\u061c", "")
	reWhite = regexp.MustCompile(`[ \t\n\r\f\v\x{00a0}]+`)
	// A line the notes would read as a heading or a list item.
	reBlockStart = regexp.MustCompile(`^(?:#|[-+] )`)
	reOrdered    = regexp.MustCompile(`^(\d{1,9})([.)] )`)
	// Elements whose content is never text.
	dropped = map[string]bool{"script": true, "style": true, "head": true, "title": true, "noscript": true, "template": true, "svg": true, "object": true, "iframe": true, "select": true, "textarea": true}
	void    = map[string]bool{"area": true, "base": true, "br": true, "col": true, "embed": true, "hr": true, "img": true, "input": true, "link": true, "meta": true, "source": true, "track": true, "wbr": true}
	// Blocks that end a line (div, rows) or a paragraph (the rest).
	lineBlocks = map[string]bool{"div": true, "tr": true, "dt": true, "dd": true, "center": true}
	paraBlocks = map[string]bool{"p": true, "table": true, "blockquote": true, "pre": true, "section": true, "article": true, "header": true, "footer": true, "main": true, "aside": true, "nav": true, "hr": true, "dl": true, "figure": true, "address": true, "form": true}
	inlineMark = map[string]string{"b": "**", "strong": "**", "i": "_", "em": "_", "s": "~~", "strike": "~~", "del": "~~"}
)

// maxHrefLen drops links longer than this (their text stays).
const maxHrefLen = 2048

type mdSpan struct {
	mark, href string
	link       bool
	b          strings.Builder
}

type mdList struct {
	ordered bool
	n       int
	indent  string
}

type mdWriter struct {
	out    strings.Builder
	spans  []*mdSpan
	prefix string // heading marks or list marker of the line being written
	gap    int    // newlines owed before the next line: 1 a line break, 2 a paragraph
	lists  []mdList
	inLi   int
	pre    int
}

// HTMLToMarkdown turns an HTML mail body into notes Markdown.
func HTMLToMarkdown(s string) string {
	w := &mdWriter{spans: []*mdSpan{{}}}
	for i := 0; i < len(s); {
		lt := strings.IndexByte(s[i:], '<')
		if lt < 0 {
			w.text(s[i:])
			break
		}
		w.text(s[i : i+lt])
		i += lt
		if strings.HasPrefix(s[i:], "<!--") {
			end := strings.Index(s[i+4:], "-->")
			if end < 0 {
				break
			}
			i += 4 + end + 3
			continue
		}
		end := tagEnd(s, i)
		if end < 0 || i+1 >= len(s) || !(isLetter(s[i+1]) || s[i+1] == '/' || s[i+1] == '!' || s[i+1] == '?') {
			w.text("<")
			i++
			continue
		}
		name, attrs, closing := parseTag(s[i+1 : end])
		i = end + 1
		if closing {
			w.end(name)
			continue
		}
		if dropped[name] || (!void[name] && hidden(attrs)) {
			i = skipElement(s, i, name)
			continue
		}
		w.start(name, attrs)
	}
	for len(w.spans) > 1 {
		w.closeSpan()
	}
	w.line()
	return normalizeText(w.out.String())
}

func isLetter(c byte) bool { return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' }

// tagEnd is the index of the '>' closing the tag at i, outside quoted attribute values.
func tagEnd(s string, i int) int {
	var quote byte
	for j := i + 1; j < len(s); j++ {
		switch c := s[j]; {
		case quote != 0:
			if c == quote {
				quote = 0
			}
		case c == '"' || c == '\'':
			quote = c
		case c == '>':
			return j
		}
	}
	return -1
}

func parseTag(t string) (name string, attrs map[string]string, closing bool) {
	t = strings.TrimSpace(t)
	if strings.HasPrefix(t, "/") {
		closing, t = true, t[1:]
	}
	n := 0
	for n < len(t) && (isLetter(t[n]) || t[n] >= '0' && t[n] <= '9' || t[n] == '-' || t[n] == ':') {
		n++
	}
	name, attrs = strings.ToLower(t[:n]), map[string]string{}
	for _, m := range reAttr.FindAllStringSubmatch(t[n:], -1) {
		attrs[strings.ToLower(m[1])] = html.UnescapeString(m[2] + m[3] + m[4])
	}
	return name, attrs, closing
}

func hidden(attrs map[string]string) bool {
	if _, ok := attrs["hidden"]; ok {
		return true
	}
	return reHiddenStyle.MatchString(attrs["style"])
}

// skipElement returns the index after the end tag that closes the element named
// name whose start tag ended just before i (nesting of the same name counted).
func skipElement(s string, i int, name string) int {
	depth := 1
	for depth > 0 {
		next := strings.IndexByte(s[i:], '<')
		if next < 0 {
			return len(s)
		}
		i += next
		end := tagEnd(s, i)
		if end < 0 {
			return len(s)
		}
		if n, _, closing := parseTag(s[i+1 : end]); n == name {
			if closing {
				depth--
			} else if !strings.HasSuffix(strings.TrimSpace(s[i+1:end]), "/") {
				depth++
			}
		}
		i = end + 1
	}
	return i
}

func (w *mdWriter) top() *mdSpan { return w.spans[len(w.spans)-1] }

// text appends decoded, escaped text to the open span.
func (w *mdWriter) text(raw string) {
	if raw == "" {
		return
	}
	t := invisible.Replace(html.UnescapeString(raw))
	if w.pre > 0 {
		for i, l := range strings.Split(strings.ReplaceAll(t, "\r\n", "\n"), "\n") {
			if i > 0 {
				w.line()
				w.gap = max(w.gap, 1)
			}
			w.top().b.WriteString(escapeInline(l))
		}
		return
	}
	t = reWhite.ReplaceAllString(t, " ")
	b := &w.top().b
	if strings.HasPrefix(t, " ") && (b.Len() == 0 || strings.HasSuffix(b.String(), " ")) {
		t = t[1:]
	}
	b.WriteString(escapeInline(t))
}

// escapeInline escapes what the notes would read as formatting.
func escapeInline(s string) string {
	var b strings.Builder
	for _, r := range s {
		if strings.ContainsRune("\\`*_~[]", r) {
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

func (w *mdWriter) space() {
	if b := &w.top().b; b.Len() > 0 && !strings.HasSuffix(b.String(), " ") {
		b.WriteByte(' ')
	}
}

// block ends the current line and owes n newlines before the next one. Inside a
// link or a list item a block is only a space, so the link or item stays whole.
func (w *mdWriter) block(n int) {
	if len(w.spans) > 1 || w.inLi > 0 {
		w.space()
		return
	}
	w.line()
	w.gap = max(w.gap, n)
}

// line writes the current line, if it has text, after the newlines owed.
func (w *mdWriter) line() {
	root := w.spans[0]
	t := strings.TrimSpace(root.b.String())
	root.b.Reset()
	if t == "" {
		return
	}
	if w.prefix == "" {
		if reBlockStart.MatchString(t) {
			t = `\` + t
		} else {
			t = reOrdered.ReplaceAllString(t, `$1\$2`)
		}
	}
	if w.out.Len() > 0 {
		w.out.WriteString(strings.Repeat("\n", max(w.gap, 1)))
	}
	w.out.WriteString(w.prefix + t)
	w.prefix, w.gap = "", 0
}

func (w *mdWriter) start(name string, attrs map[string]string) {
	switch {
	case name == "br":
		if len(w.spans) > 1 || w.inLi > 0 {
			w.space()
		} else if strings.TrimSpace(w.spans[0].b.String()) == "" {
			w.gap = max(w.gap, 2) // an empty line: Gmail's <div><br></div> between paragraphs
		} else {
			w.line()
			w.gap = max(w.gap, 1)
		}
	case len(name) == 2 && name[0] == 'h' && name[1] >= '1' && name[1] <= '6':
		w.block(2)
		if len(w.spans) == 1 && w.inLi == 0 {
			w.prefix = strings.Repeat("#", int(name[1]-'0')) + " "
		}
	case name == "ul" || name == "ol":
		indent := ""
		if n := len(w.lists); n > 0 {
			l := w.lists[n-1]
			indent = l.indent + strings.Repeat(" ", len(marker(l))+1)
			w.line()
			w.gap = 1
		} else {
			w.block(2)
		}
		w.lists = append(w.lists, mdList{ordered: name == "ol", indent: indent})
	case name == "li":
		if len(w.lists) == 0 {
			w.block(1)
			return
		}
		for len(w.spans) > 1 {
			w.closeSpan()
		}
		w.inLi = 0
		w.line()
		w.inLi = len(w.lists)
		l := &w.lists[len(w.lists)-1]
		l.n++
		w.gap = max(w.gap, 1)
		w.prefix = l.indent + marker(*l) + " "
	case name == "a":
		w.spans = append(w.spans, &mdSpan{link: true, href: attrs["href"]})
	case inlineMark[name] != "":
		w.spans = append(w.spans, &mdSpan{mark: inlineMark[name]})
	case name == "img":
		if len(w.spans) > 1 && w.top().link && strings.TrimSpace(attrs["alt"]) != "" {
			w.space()
			w.text(attrs["alt"])
		}
	case name == "td" || name == "th":
		w.space()
	case name == "pre":
		w.block(2)
		w.pre++
	case lineBlocks[name]:
		w.block(1)
	case paraBlocks[name]:
		w.block(2)
	}
}

func marker(l mdList) string {
	if l.ordered {
		return itoa(max(l.n, 1)) + "."
	}
	return "-"
}

func itoa(n int) string {
	var d []byte
	for ; n > 0 || len(d) == 0; n /= 10 {
		d = append([]byte{byte('0' + n%10)}, d...)
	}
	return string(d)
}

func (w *mdWriter) end(name string) {
	switch {
	case name == "a" || inlineMark[name] != "":
		for i := len(w.spans) - 1; i > 0; i-- {
			if s := w.spans[i]; (name == "a") == s.link && (s.link || s.mark == inlineMark[name]) {
				for len(w.spans) > i {
					w.closeSpan()
				}
				return
			}
		}
	case len(name) == 2 && name[0] == 'h' && name[1] >= '1' && name[1] <= '6':
		w.block(2)
	case name == "ul" || name == "ol":
		if len(w.lists) == 0 {
			return
		}
		for len(w.spans) > 1 {
			w.closeSpan()
		}
		w.inLi = 0
		w.line()
		w.lists = w.lists[:len(w.lists)-1]
		w.inLi = len(w.lists)
		w.gap = 2
		if len(w.lists) > 0 {
			w.gap = 1
		}
	case name == "li":
		// The item ends at the next item or the end of its list.
	case name == "td" || name == "th":
		w.space()
	case name == "pre":
		w.pre = max(w.pre-1, 0)
		w.block(2)
	case lineBlocks[name]:
		w.block(1)
	case paraBlocks[name]:
		w.block(2)
	}
}

// closeSpan pops the innermost span into its parent: a mark around its text, or a
// link [text](url) when the target is http(s) and the text is not empty.
func (w *mdWriter) closeSpan() {
	s := w.top()
	w.spans = w.spans[:len(w.spans)-1]
	inner := s.b.String()
	t := strings.TrimSpace(inner)
	parent := &w.top().b
	if strings.HasPrefix(inner, " ") {
		w.space()
	}
	switch {
	case t == "":
	case s.link:
		if href, ok := linkTarget(s.href); ok {
			if t == escapeInline(s.href) || t == escapeInline(strings.TrimSuffix(s.href, "/")) {
				t = escapeInline(hostOf(href))
			}
			parent.WriteString("[" + t + "](" + href + ")")
		} else {
			parent.WriteString(t)
		}
	default:
		parent.WriteString(s.mark + t + s.mark)
	}
	if strings.HasSuffix(inner, " ") && t != "" {
		parent.WriteByte(' ')
	}
}

// linkTarget is the href made safe for [text](url): http(s) only, and the
// characters that would end or split the target percent-encoded.
func linkTarget(href string) (string, bool) {
	href = strings.TrimSpace(invisible.Replace(href))
	lower := strings.ToLower(href)
	if (!strings.HasPrefix(lower, "http://") && !strings.HasPrefix(lower, "https://")) || len(href) > maxHrefLen {
		return "", false
	}
	if _, err := url.Parse(href); err != nil {
		return "", false
	}
	return strings.NewReplacer(" ", "%20", "(", "%28", ")", "%29", "\n", "", "\r", "", "\t", "").Replace(href), true
}

func hostOf(href string) string {
	if u, err := url.Parse(href); err == nil && u.Host != "" {
		return strings.TrimPrefix(u.Host, "www.")
	}
	return href
}
