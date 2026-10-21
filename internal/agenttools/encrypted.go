package agenttools

import (
	"encoding/json"

	"github.com/pixari/opentodo/internal/e2ee"
)

// Encrypted accounts and write tools (OpenSpec change mcp-projects, design D3).
// The server holds no key: content arguments of an encrypted account are taken
// only as well-formed ciphertext envelopes and stored as given; plaintext keeps
// the encryption_enabled refusal. Colour, icon, parent, position, Favourites and
// section order are not content and are written as they are.

// CiphertextOnlyNote ends the description of every content argument offered to
// an encrypted account. `ot mcp --decrypt` removes exactly this text, since it
// encrypts on the user's machine and its assistant writes plaintext.
const CiphertextOnlyNote = " This account uses end-to-end encryption: ciphertext only, an enc:v1: envelope made with the account key on the user's machine (ot mcp --decrypt does it); plaintext is refused."

// noCiphertext are content arguments that cannot be sent as an envelope (an
// origin is derived from a URL on the server); they are not offered to an
// encrypted account and any non-null value is refused.
var noCiphertext = map[string]bool{"origin_url": true, "origin": true}

// plainContent reports whether the arguments carry the content field name, at
// any depth, as something other than null or a ciphertext envelope.
func (a args) plainContent(name string) bool {
	var walk func(v any) bool
	plain := func(v any) bool {
		if v == nil {
			return false
		}
		if noCiphertext[name] {
			return true
		}
		s, ok := v.(string)
		return !ok || !e2ee.IsEnvelope(s)
	}
	walk = func(v any) bool {
		switch t := v.(type) {
		case map[string]any:
			for k, x := range t {
				if (k == name && plain(x)) || walk(x) {
					return true
				}
			}
		case []any:
			for _, x := range t {
				if walk(x) {
					return true
				}
			}
		}
		return false
	}
	for k, raw := range a {
		var v any
		if json.Unmarshal(raw, &v) != nil {
			continue
		}
		if (k == name && plain(v)) || walk(v) {
			return true
		}
	}
	return false
}

// ciphertextOnly rewrites a tool's input schema for an encrypted account: each
// content property loses its length bounds (an envelope is longer than its
// text) and gains CiphertextOnlyNote; origin arguments are left out.
func ciphertextOnly(schema map[string]any, fields []string) map[string]any {
	content := map[string]bool{}
	for _, f := range fields {
		content[f] = true
	}
	var walk func(v any) any
	walk = func(v any) any {
		switch t := v.(type) {
		case map[string]any:
			out := make(map[string]any, len(t))
			for k, x := range t {
				out[k] = walk(x)
			}
			if props, ok := out["properties"].(map[string]any); ok {
				np := make(map[string]any, len(props))
				for name, p := range props {
					pm, isMap := p.(map[string]any)
					switch {
					case content[name] && noCiphertext[name]:
						continue
					case content[name] && isMap:
						cp := make(map[string]any, len(pm))
						for k, x := range pm {
							if k != "minLength" && k != "maxLength" {
								cp[k] = x
							}
						}
						desc, _ := cp["description"].(string)
						cp["description"] = desc + CiphertextOnlyNote
						np[name] = cp
					default:
						np[name] = p
					}
				}
				out["properties"] = np
			}
			return out
		case []any:
			out := make([]any, len(t))
			for i, x := range t {
				out[i] = walk(x)
			}
			return out
		}
		return v
	}
	return walk(schema).(map[string]any)
}

// contentText reads a content argument like text, except that an
// encrypted account's envelope is not held to the plaintext length cap (the op
// schema still bounds the stored value).
func (a args) contentText(c Caller, name string, required bool, maxLen int) (string, bool, error) {
	if c.Encrypted && a.present(name) {
		var v string
		if json.Unmarshal(a[name], &v) == nil && e2ee.IsEnvelope(v) {
			return v, true, nil
		}
	}
	return a.text(name, required, maxLen)
}
