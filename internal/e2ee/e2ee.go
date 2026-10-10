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
	"task":    {"title", "description", "ical_extra"},
	"project": {"name"},
	"label":   {"name"},
	"section": {"name"},
	"view":    {"name", "query"},
	"comment": {"body"},
}

// IsContentField reports whether entity.field is encrypted for encrypted accounts.
func IsContentField(entity, field string) bool {
	for _, f := range ContentFields[entity] {
		if f == field {
			return true
		}
	}
	return false
}

// IsCiphertext reports whether a string value is a ciphertext envelope.
func IsCiphertext(s string) bool { return strings.HasPrefix(s, Prefix) }

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
