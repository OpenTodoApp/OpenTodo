package main

import (
	"bytes"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
)

// scrubber hands out stable placeholders: the same input maps to the same
// output across every file of one run, so a subtask's RELATED-TO still names
// its parent's placeholder UID and a resource name still matches its UID.
type scrubber struct {
	seen map[string]map[string]string // kind → original → placeholder
}

func newScrubber() *scrubber { return &scrubber{seen: map[string]map[string]string{}} }

func (s *scrubber) placeholder(kind, original, format string) string {
	m := s.seen[kind]
	if m == nil {
		m = map[string]string{}
		s.seen[kind] = m
	}
	if p, ok := m[original]; ok {
		return p
	}
	p := fmt.Sprintf(format, len(m)+1)
	m[original] = p
	return p
}

// textProps are the free-text properties and the neutral word their values
// become (numbered, the same text giving the same number).
var textProps = map[string]string{
	"SUMMARY":      "Task %d",
	"DESCRIPTION":  "Notes %d",
	"LOCATION":     "Place %d",
	"COMMENT":      "Comment %d",
	"CONTACT":      "Contact %d",
	"RESOURCES":    "Resource %d",
	"X-WR-CALNAME": "Calendar %d",
	"X-WR-CALDESC": "Calendar notes %d",
}

// uidProps carry a UID of the client: the task's, a related task's or an
// alarm's.
var uidProps = map[string]bool{"UID": true, "RELATED-TO": true, "X-WR-ALARMUID": true}

// nameParams hold a person's or a place's name or address.
var nameParams = map[string]string{"CN": "Person %d", "X-TITLE": "Place %d", "X-ADDRESS": "Place %d", "X-APPLE-MAPKIT-HANDLE": "handle-%d"}

var (
	emailRe = regexp.MustCompile(`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`)
	urlRe   = regexp.MustCompile(`(?i)\b(?:https?|webcal|ftp)://[^\s"<>]+`)
	geoRe   = regexp.MustCompile(`(?i)\bgeo:-?[\d.]+,-?[\d.]+`)
)

// calendar sanitises one body and returns it with CRLF line endings, folded
// at 75 octets, and a one-line summary of what it holds.
func (s *scrubber) calendar(ics string) ([]byte, string) {
	var b bytes.Buffer
	var comps, uids []string
	for _, line := range caldav.Unfold([]byte(ics)) {
		if line == "" {
			continue
		}
		p, err := caldav.ParseLine(line)
		if err != nil {
			// Not a content line the server would read either: keep it, scrubbed.
			writeFolded(&b, s.free(line))
			continue
		}
		if p.Name == "BEGIN" && p.Value != "VCALENDAR" && p.Value != "VTIMEZONE" && p.Value != "STANDARD" && p.Value != "DAYLIGHT" {
			comps = append(comps, p.Value)
		}
		s.prop(&p)
		if p.Name == "UID" {
			uids = append(uids, p.Value)
		}
		writeFolded(&b, p.Line())
	}
	return b.Bytes(), strings.Join(comps, ",") + " " + strings.Join(uids, ",")
}

// prop sanitises one property in place.
func (s *scrubber) prop(p *caldav.Prop) {
	for i, pa := range p.Params {
		for j, v := range pa.Values {
			if f, ok := nameParams[strings.ToUpper(pa.Name)]; ok && v != "" {
				kind := strings.ToUpper(pa.Name)
				if f == "Place %d" {
					kind = "place"
				}
				p.Params[i].Values[j] = s.placeholder(kind, v, f)
				continue
			}
			p.Params[i].Values[j] = s.free(v)
		}
	}
	switch name := strings.ToUpper(p.Name); {
	case uidProps[name]:
		if p.Value != "" {
			p.Value = s.uid(caldav.UnescapeText(p.Value))
		}
	case name == "CATEGORIES":
		var out []string
		for _, c := range caldav.SplitText(p.Value) {
			if c != "" {
				out = append(out, s.placeholder("category", c, "label-%d"))
			}
		}
		p.Value = strings.Join(out, ",")
	case textProps[name] != "":
		if p.Value != "" {
			kind := name
			if name == "LOCATION" {
				kind = "place"
			}
			p.Value = s.placeholder(kind, caldav.UnescapeText(p.Value), textProps[name])
		}
	case name == "GEO":
		p.Value = "0.0;0.0"
	default:
		p.Value = s.free(p.Value)
	}
}

func (s *scrubber) uid(u string) string { return s.placeholder("uid", u, "uid-%d") }

// free replaces email addresses, URLs and coordinates inside any other value.
func (s *scrubber) free(v string) string {
	v = urlRe.ReplaceAllStringFunc(v, func(u string) string { return s.placeholder("url", u, "https://example.com/%d") })
	v = emailRe.ReplaceAllStringFunc(v, func(e string) string { return s.placeholder("email", strings.ToLower(e), "person-%d@example.com") })
	return geoRe.ReplaceAllString(v, "geo:0.0,0.0")
}

// path sanitises a request path: the host goes, the account id, calendar ids
// and resource names become placeholders (a resource named after its UID
// gets that UID's placeholder).
func (s *scrubber) path(raw string) string {
	if u, err := url.Parse(raw); err == nil && u.Host != "" {
		raw = u.EscapedPath()
	}
	if !strings.HasPrefix(raw, "/dav/") {
		return s.free(raw)
	}
	parts := strings.Split(raw, "/")
	// /dav/calendars/<account>/<calendar>/<resource>
	for i, part := range parts {
		if part == "" {
			continue
		}
		switch {
		case i == 3 && (parts[2] == "calendars" || parts[2] == "principals"):
			parts[i] = "<account>"
		case i == 4 && parts[2] == "calendars":
			if part != "inbox" {
				parts[i] = s.placeholder("calendar", part, "calendar-%d")
			}
		case i == 5 && parts[2] == "calendars":
			name, _ := url.PathUnescape(part)
			stem := strings.TrimSuffix(name, ".ics")
			if m := s.seen["uid"]; m != nil && m[stem] != "" {
				parts[i] = m[stem] + ".ics"
			} else {
				parts[i] = s.placeholder("resource", name, "resource-%d.ics")
			}
		}
	}
	return strings.Join(parts, "/")
}

// writeFolded writes one content line folded at 75 octets without splitting a
// UTF-8 sequence (RFC 5545 3.1), as the server serialises its own.
func writeFolded(b *bytes.Buffer, line string) {
	limit := 75
	for len(line) > limit {
		cut := limit
		for cut > 0 && !utf8.RuneStart(line[cut]) {
			cut--
		}
		b.WriteString(line[:cut])
		b.WriteString("\r\n ")
		line = line[cut:]
		limit = 74
	}
	b.WriteString(line)
	b.WriteString("\r\n")
}
