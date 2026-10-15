package sync

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/e2ee"
)

// Custom field values against their definitions (OpenSpec change
// custom-fields). Validate never runs this: the op path accepts any scalar so a
// value and its definition may arrive in any order. The REST API and the
// assistant tools call it before planning a write.

// MaxFieldText caps text and link values (web/src/lib/fields.ts agrees).
const MaxFieldText = 2000

// FieldOptions reads a choice field's stored options: one per line, trimmed,
// empty lines dropped (parseOptions on the client).
func FieldOptions(s string) []string {
	var out []string
	for _, o := range strings.Split(s, "\n") {
		if o = strings.TrimSpace(o); o != "" {
			out = append(out, o)
		}
	}
	return out
}

// CheckFieldValue checks one value against its definition's type and returns the
// value to store (a choice takes the option's spelling) or a message. null
// clears; an end-to-end encrypted string is accepted as is, the device checked it.
func CheckFieldValue(def Entity, raw json.RawMessage) (json.RawMessage, string) {
	if string(raw) == "null" {
		return raw, ""
	}
	var typ, options string
	_ = json.Unmarshal(def["type"], &typ)
	_ = json.Unmarshal(def["options"], &options)
	var str string
	isString := json.Unmarshal(raw, &str) == nil
	if isString && e2ee.IsCiphertext(str) {
		return raw, ""
	}
	switch typ {
	case "number":
		var n float64
		if isString || json.Unmarshal(raw, &n) != nil {
			return nil, "must be a number"
		}
		return raw, ""
	case "checkbox":
		var b bool
		if json.Unmarshal(raw, &b) != nil {
			return nil, "must be true or false"
		}
		return raw, ""
	}
	if !isString {
		return nil, "must be a string"
	}
	switch typ {
	case "date":
		if _, err := time.Parse("2006-01-02", str); err != nil || len(str) != 10 {
			return nil, "must be a date YYYY-MM-DD"
		}
	case "choice":
		if e2ee.IsCiphertext(options) {
			return raw, ""
		}
		for _, o := range FieldOptions(options) {
			if strings.EqualFold(o, strings.TrimSpace(str)) {
				v, _ := json.Marshal(o)
				return v, ""
			}
		}
		return nil, "must be one of the field's options"
	case "link":
		u, err := url.Parse(str)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || utf8.RuneCountInString(str) > MaxFieldText {
			return nil, fmt.Sprintf("must be an http or https link of at most %d characters", MaxFieldText)
		}
	default:
		if utf8.RuneCountInString(str) > MaxFieldText {
			return nil, fmt.Sprintf("must be at most %d characters", MaxFieldText)
		}
	}
	return raw, ""
}
