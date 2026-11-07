package mcpoauth

import (
	"errors"
	"net/url"
	"strings"
	"unicode"
)

// Platform is an AI connector platform whose redirect addresses this server
// knows (OpenSpec change mcp-oauth-connector-redirects, design D1). Dynamic
// registration accepts only these addresses, and an owner can create a client
// for one of them in Settings.
type Platform struct {
	// ID is the value `platform` takes in the client API.
	ID string `json:"id"`
	// Name is the app a person recognises.
	Name string `json:"name"`
	// Exact addresses match only themselves.
	Exact []string `json:"-"`
	// Prefixes match the prefix followed by exactly one opaque segment.
	Prefixes []string `json:"-"`
	// KeepsRefresh is true when the provider requires the same refresh token
	// back on a refresh (mcp-oauth-refresh-rotation D1).
	KeepsRefresh bool `json:"-"`
}

// Platforms is the table of known AI connector platforms. Each entry's
// addresses come from the provider's own documentation, named in the comment;
// a provider is added or changed here and nowhere else.
var Platforms = []Platform{
	{
		// Google registers six addresses per connector (production, sandbox and
		// test hosts, each under /r/ and /a/) and the suffix is opaque.
		// Source: https://developers.google.com/connected-apps/mcp/oauth
		ID:   "google",
		Name: "Gemini",
		Prefixes: []string{
			"https://oauth-redirect.googleusercontent.com/r/",
			"https://oauth-redirect.googleusercontent.com/a/",
			"https://oauth-redirect-sandbox.googleusercontent.com/r/",
			"https://oauth-redirect-sandbox.googleusercontent.com/a/",
			"https://oauth-redirect-test.googleusercontent.com/r/",
			"https://oauth-redirect-test.googleusercontent.com/a/",
		},
		KeepsRefresh: true,
	},
	{
		// ChatGPT uses the stable address when the authorization server returns
		// RFC 9207 `iss` (and for servers published before callback ids), and
		// otherwise https://chatgpt.com/connector/oauth/{callback_id}.
		// Source: https://developers.openai.com/apps-sdk/build/auth ("Redirect URL")
		ID:       "openai",
		Name:     "ChatGPT",
		Exact:    []string{"https://chatgpt.com/connector_platform_oauth_redirect"},
		Prefixes: []string{"https://chatgpt.com/connector/oauth/"},
	},
	{
		// claude.ai on the web, Desktop, mobile and Cowork share one callback.
		// Source: https://claude.com/docs/connectors/building/authentication
		// ("Callback URLs"). Anthropic's help article asked servers that
		// allow-list callbacks to add the claude.com form too:
		// https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers
		ID:    "anthropic",
		Name:  "Claude",
		Exact: []string{"https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"},
	},
}

// PlatformByID returns the platform with this id.
func PlatformByID(id string) (Platform, bool) {
	for _, p := range Platforms {
		if p.ID == id {
			return p, true
		}
	}
	return Platform{}, false
}

// Registration is the redirect list a client of this platform stores: its
// exact addresses and its prefixes, so whichever address the app names is
// accepted.
func (p Platform) Registration() []string {
	out := make([]string, 0, len(p.Exact)+len(p.Prefixes))
	out = append(out, p.Exact...)
	return append(out, p.Prefixes...)
}

// Matches reports whether uri is one of this platform's redirect addresses
// (design D2).
func (p Platform) Matches(uri string) bool {
	for _, e := range p.Exact {
		if uri == e {
			return true
		}
	}
	for _, pre := range p.Prefixes {
		if strings.HasPrefix(uri, pre) && opaqueSegment(uri[len(pre):]) {
			return true
		}
	}
	return false
}

// holds reports whether entry is one of this platform's stored addresses: an
// exact address or a prefix itself.
func (p Platform) holds(entry string) bool {
	for _, e := range p.Exact {
		if entry == e {
			return true
		}
	}
	return isPrefixOf(p, entry)
}

func isPrefixOf(p Platform, entry string) bool {
	for _, pre := range p.Prefixes {
		if entry == pre {
			return true
		}
	}
	return false
}

// PlatformOf returns the platform a requested redirect address belongs to.
func PlatformOf(uri string) (Platform, bool) {
	for _, p := range Platforms {
		if p.Matches(uri) {
			return p, true
		}
	}
	return Platform{}, false
}

// platformPrefix reports whether a stored entry is a known platform's prefix,
// the only kind of entry that matches more than itself.
func platformPrefix(entry string) bool {
	for _, p := range Platforms {
		if isPrefixOf(p, entry) {
			return true
		}
	}
	return false
}

// keepsRefreshEntry reports whether a stored entry, or an address under one,
// belongs to a platform that keeps its refresh token.
func keepsRefreshEntry(entry string) bool {
	for _, p := range Platforms {
		if p.KeepsRefresh && (p.holds(entry) || p.Matches(entry)) {
			return true
		}
	}
	return false
}

// GoogleRegistration is the default redirect list of a client created without
// a platform or an address: Google's six connector prefixes.
func GoogleRegistration() []string {
	p, _ := PlatformByID("google")
	return p.Registration()
}

// opaqueSegment is the one path segment a platform prefix may be followed by:
// not empty, not a dot segment, and nothing that would start another segment,
// a query or a fragment, or hide one behind an escape.
func opaqueSegment(s string) bool {
	if s == "" || s == "." || s == ".." || len(s) > 512 {
		return false
	}
	for _, r := range s {
		if r == '/' || r == '\\' || r == '?' || r == '#' || r == '%' || unicode.IsSpace(r) || unicode.IsControl(r) {
			return false
		}
	}
	return true
}

// MaxCustomRedirects bounds the addresses of one Settings-created client.
const MaxCustomRedirects = 10

// ErrCustomRedirect is a custom redirect address that breaks a rule; its
// message says which.
var ErrCustomRedirect = errors.New("invalid redirect address")

type customRedirectError struct{ reason string }

func (e customRedirectError) Error() string { return e.reason }
func (e customRedirectError) Unwrap() error { return ErrCustomRedirect }

// ValidCustomRedirect checks an address an owner typed for a client (design
// D4): an absolute https address with a host, matched exactly, so no wildcard,
// fragment or user information.
func ValidCustomRedirect(uri string) error {
	fail := func(reason string) error { return customRedirectError{reason} }
	if uri == "" {
		return fail("the redirect address is empty")
	}
	if len(uri) > 2000 {
		return fail("the redirect address is longer than 2,000 characters")
	}
	for _, r := range uri {
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			return fail("the redirect address contains white space")
		}
	}
	if strings.Contains(uri, "*") {
		return fail("the redirect address must be exact; wildcards are not supported")
	}
	u, err := url.Parse(uri)
	if err != nil || !u.IsAbs() {
		return fail("the redirect address is not an absolute address")
	}
	if u.Scheme != "https" || !strings.HasPrefix(uri, "https://") {
		return fail("the redirect address must start with https://")
	}
	if u.Host == "" || u.Hostname() == "" || u.Opaque != "" {
		return fail("the redirect address has no host")
	}
	if u.User != nil {
		return fail("the redirect address must not contain a user name or password")
	}
	if u.Fragment != "" || strings.Contains(uri, "#") {
		return fail("the redirect address must not contain a fragment (#)")
	}
	return nil
}
