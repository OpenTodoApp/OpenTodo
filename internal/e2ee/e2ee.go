// Package e2ee is the server side of optional end-to-end encryption (OpenSpec
// change `e2ee`). The server runs no cryptography: it stores the wrapped key
// record the browser produces, recognises ciphertext values so server-side
// features can degrade explicitly instead of showing "enc:v1:…" to people, and
// lists the content fields that are encrypted. See docs/e2ee.md.
//
// Ciphertext travels through the unchanged op log as an ordinary string value:
//
//	"enc:v1:" + base64url(nonce(12) || AES-256-GCM(plaintext, aad))
//	aad = entity + "\x00" + entityId + "\x00" + field
//
// The server validates, stores and serves it like any other string.
package e2ee

import (
	"encoding/json"
	"regexp"
	"strings"
)

// Prefix marks a ciphertext value of any format version. PrefixV1 is the
// current format.
const (
	Prefix   = "enc:"
	PrefixV1 = "enc:v1:"
)

// Placeholder is what server-built text (notifications, reminder pushes) shows
// instead of a ciphertext value.
const Placeholder = "Encrypted item"

// ContentFields are the fields a device encrypts for an account with
// encryption enabled, inside the account's personal scope only (shared
// projects are never encrypted; sharing is refused for encrypted accounts).
// Everything else stays plaintext so scheduling, ordering and structure keep
// working everywhere (design D2, adapted in design.md "Implementation notes":
// task.labels holds label ids, so the label names are encrypted instead).
// Keep in step with CONTENT_FIELDS in web/src/lib/e2ee.ts.
var ContentFields = map[string][]string{
	// A task's origin (OpenSpec change task-origin, design D2) is an object;
	// devices serialise it and encrypt it whole into one ciphertext string.
	// A task's location (OpenSpec task-locations, design D1) is an object too.
	"task":    {"title", "description", "ical_extra", "notes_doc", "origin", "location"},
	"project": {"name", "description", "notes_doc"},
	"label":   {"name"},
	"section": {"name"},
	"view":    {"name", "query"},
	// A guest's typed name on a task page reply (OpenSpec task-pages, design D6).
	"comment": {"body", "guest_name"},
	// Attachments (OpenSpec attachments, design D8): the bytes are an envelope too.
	"attachment": {"name", "mime", "url"},
	// Custom field definitions (OpenSpec custom-fields, design D4).
	"field": {"name", "options"},
	// A time entry's note (OpenSpec time-tracking, design D1); its times stay
	// plaintext so totals and the CSV work on the server.
	"time_entry": {"note"},
	// The review record's line for tomorrow (OpenSpec close-the-day, design D5);
	// the close time and the other rhythm stamps stay plaintext.
	"review": {"tomorrow_note"},
	// A place (OpenSpec task-locations, design D1): its coordinates are one
	// object, encrypted whole; its position and timestamps stay plaintext.
	"place": {"name", "address", "geo"},
}

// ContentPrefixes are families of content fields named by a prefix: a task's
// custom field values `fields.<id>` (OpenSpec custom-fields, design D4). Only
// string values are encrypted (text, link, date, choice); numbers and booleans
// stay plaintext like priority. Keep in step with CONTENT_PREFIXES in
// web/src/lib/e2ee.ts.
var ContentPrefixes = map[string][]string{
	"task": {"fields."},
}

// AllContentFields is ContentFields plus the prefixes of ContentPrefixes (each
// ending in "."), the form sync.PurgeSupersededContent takes.
func AllContentFields() map[string][]string {
	out := make(map[string][]string, len(ContentFields))
	for e, fs := range ContentFields {
		out[e] = append([]string(nil), fs...)
	}
	for e, ps := range ContentPrefixes {
		out[e] = append(out[e], ps...)
	}
	return out
}

// IsContentField reports whether entity.field is encrypted for encrypted accounts.
func IsContentField(entity, field string) bool {
	for _, f := range ContentFields[entity] {
		if f == field {
			return true
		}
	}
	for _, p := range ContentPrefixes[entity] {
		if strings.HasPrefix(field, p) && len(field) > len(p) {
			return true
		}
	}
	return false
}

// IsCiphertext reports whether a string value is a ciphertext envelope.
func IsCiphertext(s string) bool { return strings.HasPrefix(s, Prefix) }

var envelopeRe = regexp.MustCompile(`^enc:v[0-9]+:[A-Za-z0-9_-]{38,}$`)

// IsEnvelope reports whether s is a well-formed ciphertext envelope: "enc:vN:" and
// at least a nonce and a tag of base64url. Stricter than IsCiphertext, like
// isEnvelope in web/src/lib/crypto.ts: an assistant writing ciphertext for an
// encrypted account (OpenSpec change mcp-projects, design D3) must send one. The
// server still cannot tell whether it was made with the right key.
func IsEnvelope(s string) bool { return envelopeRe.MatchString(s) }

// IsCiphertextJSON reports whether a JSON value is a string holding a ciphertext envelope.
func IsCiphertextJSON(raw json.RawMessage) bool {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return false
	}
	return IsCiphertext(s)
}

// Display returns s, or Placeholder when s is ciphertext. Server-built text uses
// it so an encrypted title never reaches a notification as "enc:v1:…".
func Display(s string) string {
	if IsCiphertext(s) {
		return Placeholder
	}
	return s
}
