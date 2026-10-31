package origin

import (
	"net/url"
	"strings"
	"unicode/utf8"
)

// Obsidian note links (OpenSpec change obsidian-origin, design D2). An origin of
// kind "obsidian" is the one kind whose URL is not http(s): it is Obsidian's own
// link to a note, `obsidian://open?vault=<vault>&file=<note>`, in exactly that
// shape. Every other Obsidian action (new, search, a community plugin's
// adv-uri) can write or run something, and `path=` opens any file on the
// device, so they are refused. web/src/lib/taskOrigin.ts obsidianURL and the
// shells' external-link check implement the same rule; all of them run the
// "obsidian" vectors in testdata/origin_vectors.json.

const (
	obsidianPrefix = "obsidian://open?"
	// MaxVault and MaxFile are the decoded lengths, in characters, of the two
	// query members.
	MaxVault = 255
	MaxFile  = 1024
)

// ObsidianLink is a parsed Obsidian note link: the vault's name and the note's
// vault-relative path as written in the link (without ".md" when the link
// leaves it out).
type ObsidianLink struct {
	Vault string
	File  string
}

// valueChar reports whether b may appear unencoded in a query value. Anything
// else, '+', '&', '=', '#', '?' and spaces included, must be percent-encoded,
// so a link has one reading on every side.
func valueChar(b byte) bool {
	switch {
	case 'a' <= b && b <= 'z', 'A' <= b && b <= 'Z', '0' <= b && b <= '9':
		return true
	}
	return strings.IndexByte("-._~!$'()*,;:@/%", b) >= 0
}

// decodeValue percent-decodes one query value: every escape well formed, the
// result valid UTF-8 without control characters.
func decodeValue(raw string) (string, bool) {
	for i := 0; i < len(raw); i++ {
		if !valueChar(raw[i]) {
			return "", false
		}
	}
	s, err := url.PathUnescape(raw)
	if err != nil || !utf8.ValidString(s) {
		return "", false
	}
	for _, r := range s {
		if r < 0x20 || r == 0x7f || (r >= 0x80 && r < 0xa0) {
			return "", false
		}
	}
	return s, true
}

// ParseObsidianURL reads an Obsidian note link of the one accepted shape:
// scheme obsidian, action open, no path, fragment, port or user information,
// and a query of exactly `vault` (1 to MaxVault characters) and `file` (1 to
// MaxFile characters, not starting with "/"), once each, at most MaxURL bytes
// in all.
func ParseObsidianURL(raw string) (ObsidianLink, bool) {
	if len(raw) > MaxURL || !strings.HasPrefix(raw, obsidianPrefix) {
		return ObsidianLink{}, false
	}
	parts := strings.Split(raw[len(obsidianPrefix):], "&")
	if len(parts) != 2 {
		return ObsidianLink{}, false
	}
	var l ObsidianLink
	seen := map[string]bool{}
	for _, p := range parts {
		name, value, ok := strings.Cut(p, "=")
		if !ok || seen[name] {
			return ObsidianLink{}, false
		}
		seen[name] = true
		v, ok := decodeValue(value)
		if !ok {
			return ObsidianLink{}, false
		}
		n := utf8.RuneCountInString(v)
		switch name {
		case "vault":
			if n < 1 || n > MaxVault {
				return ObsidianLink{}, false
			}
			l.Vault = v
		case "file":
			if n < 1 || n > MaxFile || strings.HasPrefix(v, "/") {
				return ObsidianLink{}, false
			}
			l.File = v
		default:
			return ObsidianLink{}, false
		}
	}
	return l, true
}

// NotePath is the note's vault-relative path the link opens: File, with ".md"
// added when its last segment has no extension.
func (l ObsidianLink) NotePath() string {
	last := l.File[strings.LastIndexByte(l.File, '/')+1:]
	if strings.LastIndexByte(last, '.') > 0 {
		return l.File
	}
	return l.File + ".md"
}

// ValidObsidianURL reports whether raw is a valid Obsidian note link whose
// note is id: the origin's label (its id) and its link name the same note, so
// a crafted origin cannot show one note and open another.
func ValidObsidianURL(raw, id string) bool {
	l, ok := ParseObsidianURL(raw)
	return ok && id != "" && (id == l.NotePath() || id == l.File+".md")
}

// NoteName is the last segment of a vault-relative path without ".md", the
// name an Obsidian origin reads as when it has no title.
func NoteName(id string) string {
	return strings.TrimSuffix(id[strings.LastIndexByte(id, '/')+1:], ".md")
}
