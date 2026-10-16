package sync

import (
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/e2ee"
)

// MaxFieldText bounds a text or link value in characters (spec "Typed values
// and their limits").
const MaxFieldText = 2000

// FieldTypes are the definition types this server knows. A definition's type
// is a plain string so a later type is additive: clients show an unknown type
// read-only as text.
var FieldTypes = map[string]bool{"text": true, "number": true, "date": true, "choice": true, "link": true, "checkbox": true}

// Custom fields (OpenSpec change custom-fields, design D2/D3). A task's values
// are stored as one op field per definition (`fields.<id>`); every reader that
// presents a task to people or programs (REST, export, webhooks, assistant
// tools) shows them as one `fields` object keyed by definition id instead.

// FoldFieldValues returns a copy of a task with its `fields.<id>` keys moved
// into a `fields` object (always present, `{}` when the task holds none). The
// caller's entity is not modified.
func FoldFieldValues(e Entity) Entity {
	if e == nil {
		return nil
	}
	out := make(Entity, len(e)+1)
	values := map[string]json.RawMessage{}
	for k, v := range e {
		if id, ok := FieldValueID(k); ok {
			values[id] = v
			continue
		}
		out[k] = v
	}
	raw, _ := json.Marshal(values)
	out["fields"] = raw
	return out
}

// FieldValues returns the `fields.<id>` values of a task keyed by definition id.
func FieldValues(e Entity) map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	for k, v := range e {
		if id, ok := FieldValueID(k); ok {
			out[id] = v
		}
	}
	return out
}

// FieldValueKeys lists the `fields.<id>` keys of an entity in order.
func FieldValueKeys(e Entity) []string {
	var out []string
	for k := range e {
		if _, ok := FieldValueID(k); ok {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
}

// FieldOptions splits a choice field's options (one per line, blanks ignored).
func FieldOptions(raw string) []string {
	var out []string
	for _, l := range strings.Split(raw, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			out = append(out, l)
		}
	}
	return out
}

// CheckFieldValue checks one value against its definition's type (null always
// clears). It returns a user-facing reason or "".
func CheckFieldValue(def Entity, raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var typ string
	_ = json.Unmarshal(def["type"], &typ)
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return "must be a JSON value"
	}
	str, isStr := v.(string)
	switch typ {
	case "text":
		if !isStr || utf8.RuneCountInString(str) > MaxFieldText {
			return fmt.Sprintf("must be text of at most %d characters", MaxFieldText)
		}
	case "number":
		n, ok := v.(float64)
		if !ok || math.IsInf(n, 0) || math.IsNaN(n) {
			return "must be a number"
		}
	case "date":
		if !isStr {
			return `must be a date "YYYY-MM-DD"`
		}
		if t, err := time.Parse("2006-01-02", str); err != nil || t.Format("2006-01-02") != str {
			return `must be a date "YYYY-MM-DD"`
		}
	case "choice":
		if !isStr {
			return "must be one of the field's options"
		}
		var options string
		_ = json.Unmarshal(def["options"], &options)
		if e2ee.IsCiphertext(options) {
			return "" // encrypted options cannot be checked here
		}
		for _, o := range FieldOptions(options) {
			if o == str {
				return ""
			}
		}
		return "must be one of the field's options"
	case "link":
		if !isStr || utf8.RuneCountInString(str) > MaxFieldText {
			return fmt.Sprintf("must be an http or https link of at most %d characters", MaxFieldText)
		}
		u, err := url.Parse(str)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return "must be an http or https link"
		}
	case "checkbox":
		if _, ok := v.(bool); !ok {
			return "must be true or false"
		}
	default:
		// A type this server does not know (a newer client): shape only.
		switch v.(type) {
		case string, float64, bool:
		default:
			return "must be a string, a number or a boolean"
		}
	}
	return ""
}
