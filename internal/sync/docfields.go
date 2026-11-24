package sync

import (
	"encoding/base64"
	"regexp"
	"strings"
)

// docEnvelope matches the prefix of a kDoc value: a lower-case format name and a
// version, e.g. "ydoc:v1:" (a Yjs update) or "enc:v1:" (e2ee ciphertext).
var docEnvelope = regexp.MustCompile(`^[a-z][a-z0-9]{0,15}:v[0-9]{1,3}:`)

// DocFields lists the kDoc fields as "entity.field". Readers that present
// values to people (history, webhooks; internal/activity keeps its own copy)
// leave these out: the field's plain-text projection (task.description for
// task.notes_doc) carries the readable content.
var DocFields = map[string]bool{
	"task.notes_doc": true,
	// A project's note (OpenSpec change project-notes): project.description is its projection.
	"project.notes_doc": true,
	// A standalone note (notes-overview): note.description is its projection.
	"note.notes_doc": true,
}

// IsDocField reports whether entity.field holds an opaque document.
func IsDocField(entity, field string) bool { return DocFields[entity+"."+field] }

// ValidDoc reports whether s is an acceptable kDoc value (see kDoc).
func ValidDoc(s string) bool {
	if s == "" {
		return true
	}
	if len(s) > MaxDocBytes {
		return false
	}
	m := docEnvelope.FindStringIndex(s)
	if m == nil {
		return false
	}
	payload := strings.TrimRight(s[m[1]:], "=")
	if payload == "" {
		return false
	}
	enc := base64.RawStdEncoding
	if strings.ContainsAny(payload, "-_") {
		enc = base64.RawURLEncoding
	}
	_, err := enc.DecodeString(payload)
	return err == nil
}
