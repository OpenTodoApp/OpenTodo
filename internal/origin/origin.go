// Package origin is a task's origin (OpenSpec change task-origin): where the
// task came from, as one value {kind, provider?, id?, url?, title?}. It holds
// the one validation every write path uses (internal/sync's kOrigin check, the
// CLI, the agent tools, the importers, email to task and later pollers) and the
// table that recognises issue hosts in a URL.
//
// The recognition rules are implemented twice, here and in
// web/src/lib/taskOrigin.ts, and both are checked against the shared vectors in
// testdata/origin_vectors.json. Nothing here makes a request: recognition reads
// the URL's host and path only.
package origin

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/e2ee"
)

// Kinds of origin. The list is closed: the schema refuses any other kind.
const (
	KindURL    = "url"
	KindEmail  = "email"
	KindIssue  = "issue"
	KindImport = "import"
)

// Kinds lists every accepted kind.
var Kinds = []string{KindURL, KindEmail, KindIssue, KindImport}

// Limits on the members (design D1). MaxURL counts bytes, MaxID and MaxTitle
// characters; MaxTitle is the capture screen's title limit.
const (
	MaxURL      = 2048
	MaxID       = 512
	MaxTitle    = 500
	MaxProvider = 32
)

// Origin is the plaintext value. Empty members are absent: a provider, id, url
// or title that is set is never the empty string.
type Origin struct {
	Kind     string `json:"kind"`
	Provider string `json:"provider,omitempty"`
	ID       string `json:"id,omitempty"`
	URL      string `json:"url,omitempty"`
	Title    string `json:"title,omitempty"`
}

var providerRe = regexp.MustCompile(`^[a-z0-9-]{1,32}$`)

// ValidKind reports whether k is one of Kinds.
func ValidKind(k string) bool { return slices.Contains(Kinds, k) }

// ValidProvider reports whether p is 1 to MaxProvider lower-case letters,
// digits or hyphens.
func ValidProvider(p string) bool { return providerRe.MatchString(p) }

// ValidURL reports whether s is an http or https URL with a host, at most
// MaxURL bytes long.
func ValidURL(s string) bool {
	if s == "" || len(s) > MaxURL {
		return false
	}
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// Validate checks a decoded origin against the rules of the "Origin
// validation" and "Origin lengths and required members" requirements.
func (o Origin) Validate() error {
	if !ValidKind(o.Kind) {
		return fmt.Errorf("origin kind must be one of %s", strings.Join(Kinds, ", "))
	}
	if o.Provider != "" && !ValidProvider(o.Provider) {
		return fmt.Errorf("origin provider must be 1 to %d lower-case letters, digits or hyphens", MaxProvider)
	}
	if utf8.RuneCountInString(o.ID) > MaxID {
		return fmt.Errorf("origin id must be at most %d characters", MaxID)
	}
	if o.URL != "" && !ValidURL(o.URL) {
		return fmt.Errorf("origin url must be an http or https URL of at most %d bytes", MaxURL)
	}
	if utf8.RuneCountInString(o.Title) > MaxTitle {
		return fmt.Errorf("origin title must be at most %d characters", MaxTitle)
	}
	if o.Kind == KindURL && o.URL == "" {
		return errors.New(`origin of kind "url" needs a url`)
	}
	if o.Kind != KindURL && o.ID == "" {
		return fmt.Errorf("origin of kind %q needs an id", o.Kind)
	}
	return nil
}

// wire is the strict decoding shape: pointers tell an absent member from an
// empty one, and an empty one is refused.
type wire struct {
	Kind     *string `json:"kind"`
	Provider *string `json:"provider"`
	ID       *string `json:"id"`
	URL      *string `json:"url"`
	Title    *string `json:"title"`
}

// Decode reads a plaintext origin object strictly (no unknown members, every
// member a non-empty string) and validates it. It refuses null and ciphertext;
// CheckValue accepts those.
func Decode(raw json.RawMessage) (Origin, error) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || raw[0] != '{' {
		return Origin{}, errors.New("origin must be an object")
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var w wire
	if err := dec.Decode(&w); err != nil {
		return Origin{}, errors.New("origin must be an object with only kind, provider, id, url and title, each a string")
	}
	if dec.More() {
		return Origin{}, errors.New("origin must be one object")
	}
	if w.Kind == nil {
		return Origin{}, errors.New("origin needs a kind")
	}
	o := Origin{Kind: *w.Kind}
	for _, m := range []struct {
		name string
		src  *string
		dst  *string
	}{{"provider", w.Provider, &o.Provider}, {"id", w.ID, &o.ID}, {"url", w.URL, &o.URL}, {"title", w.Title, &o.Title}} {
		if m.src == nil {
			continue
		}
		if *m.src == "" {
			return Origin{}, fmt.Errorf("origin %s must not be empty", m.name)
		}
		*m.dst = *m.src
	}
	return o, o.Validate()
}

// CheckValue validates a stored or submitted origin value: JSON null (no
// origin), a ciphertext string of an encrypted account (opaque, bounded only by
// the op value limit), or a valid plaintext object.
func CheckValue(raw json.RawMessage) error {
	raw = bytes.TrimSpace(raw)
	if string(raw) == "null" {
		return nil
	}
	if len(raw) > 0 && raw[0] == '"' {
		if e2ee.IsCiphertextJSON(raw) {
			return nil
		}
		return errors.New("origin must be null, an object or a ciphertext string")
	}
	_, err := Decode(raw)
	return err
}

// Host is the lower-cased host name of o.URL without "www.", or "" when it has
// none (web/src/lib/taskOrigin.ts originHost reads it the same way).
func (o Origin) Host() string {
	if o.URL == "" {
		return ""
	}
	u, err := url.Parse(o.URL)
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
}

// Label is the short text people see for the origin: a message open in a web
// mail client (an email origin with a URL and a provider) reads as the provider,
// "Gmail" or "Outlook" (extension-v2); else the external id, else the URL's
// host. Readers that show an email origin without a link as a word (the row
// chip) decide that themselves.
func (o Origin) Label() string {
	if o.Kind == KindEmail && o.URL != "" && o.Provider != "" {
		return strings.ToUpper(o.Provider[:1]) + o.Provider[1:]
	}
	if o.ID != "" {
		return o.ID
	}
	return o.Host()
}
