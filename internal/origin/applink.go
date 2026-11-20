package origin

import (
	"regexp"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

// App links (OpenSpec change app-links, design D2): a link that opens an item
// in another app, such as zotero://select/items/ABC or mid:<message-id>. One
// grammar and one deny list, implemented here, in web/src/lib/appLinks.ts and
// in both shells, pinned by testdata/app_links.vectors.json. Whether a link
// opens is decided on the viewer's device against their own list; the server
// only checks the grammar and the deny list.

// MaxAppLinkSchemes and MaxSchemeLen bound a person's list of schemes (D1).
const (
	MaxAppLinkSchemes = 20
	MaxSchemeLen      = 32
)

// DeniedSchemes never open as app links and are refused in the list: script,
// file and browser-internal schemes, and the system handlers known to run code
// (ms-msdt, search-ms, ms-officecmd, jnlp). Every scheme starting "ms-cxh" is
// denied too.
var DeniedSchemes = []string{"javascript", "data", "vbscript", "file", "blob", "about", "filesystem", "view-source", "intent", "opentodo",
	"chrome", "chrome-extension", "moz-extension", "resource", "jar", "ms-appx", "ms-appx-web",
	"ms-msdt", "search-ms", "search", "ms-officecmd", "jnlp"}

// deniedScheme reports whether a lower-cased scheme is denied or has its own rules.
func deniedScheme(s string) bool {
	return slices.Contains(DeniedSchemes, s) || strings.HasPrefix(s, "ms-cxh") || slices.Contains(ownRules, s)
}

// hiddenRune reports a character that does not show as itself: a control or
// format character (bidi overrides included), a line or paragraph separator, or a space.
func hiddenRune(r rune) bool {
	return unicode.In(r, unicode.Cc, unicode.Cf, unicode.Zl, unicode.Zp, unicode.Zs)
}

// ownRules are the schemes that keep their own handling and are never app links.
var ownRules = []string{"http", "https", "mailto"}

var (
	schemeRe    = regexp.MustCompile(`^[a-z][a-z0-9+.-]{0,31}$`)
	appLinkRe   = regexp.MustCompile(`^([A-Za-z][A-Za-z0-9+.-]{0,31}):(.+)$`)
	listEntryRe = regexp.MustCompile(`^([a-z][a-z0-9+.-]{0,31})(?::([a-z0-9][a-z0-9-]{0,31}))?$`)
)

// AppLinkScheme is the lower-cased scheme of raw when raw is an app link: a
// scheme of the RFC 3986 grammar (at most MaxSchemeLen characters), a colon and
// a non-empty rest, at most MaxURL bytes of valid UTF-8 in all, with no
// whitespace, control, format or separator character, whose scheme is neither
// denied nor one of http, https and mailto.
func AppLinkScheme(raw string) (string, bool) {
	if raw == "" || len(raw) > MaxURL || !utf8.ValidString(raw) || strings.ContainsFunc(raw, hiddenRune) {
		return "", false
	}
	m := appLinkRe.FindStringSubmatch(raw)
	if m == nil {
		return "", false
	}
	scheme := strings.ToLower(m[1])
	if deniedScheme(scheme) {
		return "", false
	}
	return scheme, true
}

// IsAppLink reports whether raw is an app link.
func IsAppLink(raw string) bool {
	_, ok := AppLinkScheme(raw)
	return ok
}

// ValidSchemeEntry reports whether entry may be on a person's list: a lower-case
// scheme of the grammar, optionally narrowed to one action ("obsidian:open"),
// neither denied nor one with its own rules.
func ValidSchemeEntry(entry string) bool {
	m := listEntryRe.FindStringSubmatch(entry)
	if m == nil || !schemeRe.MatchString(m[1]) {
		return false
	}
	return !deniedScheme(m[1])
}

// AllowsAppLink reports whether a list of entries lets raw open: raw is an app
// link and the list holds its scheme, or "scheme:action" where the part after
// "scheme://" (or "scheme:") up to "?" or "/" is that action. Entries that are
// not valid are ignored.
func AllowsAppLink(list []string, raw string) bool {
	scheme, ok := AppLinkScheme(raw)
	if !ok {
		return false
	}
	rest := raw[len(scheme)+1:]
	rest = strings.TrimPrefix(rest, "//")
	if i := strings.IndexAny(rest, "?/#"); i >= 0 {
		rest = rest[:i]
	}
	action := strings.ToLower(rest)
	for _, e := range list {
		if !ValidSchemeEntry(e) {
			continue
		}
		s, a, narrowed := strings.Cut(e, ":")
		if s == scheme && (!narrowed || a == action) {
			return true
		}
	}
	return false
}
