package assistant

import (
	"fmt"
	"sort"
	"strings"
)

// The registry's input schemas carry limits (lengths, item counts, ranges)
// that the registry itself enforces when it validates a call. Strict tool
// modes accept a smaller JSON Schema subset, so before a schema goes to a
// provider those keywords move into the description, the way the official
// SDKs transform schemas; validation stays on the server (agenttools).

var droppedKeywords = []string{"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems", "pattern"}

var supportedFormats = map[string]bool{"date-time": true, "time": true, "date": true, "duration": true, "email": true, "hostname": true, "uri": true, "ipv4": true, "ipv6": true, "uuid": true}

// strictSchema returns a copy of s within the strict subset. nullableTypes
// turns ["T","null"] into T with a note (providers without type lists).
func strictSchema(s map[string]any, nullableTypes bool) map[string]any {
	out := make(map[string]any, len(s))
	var notes []string
	for k, v := range s {
		out[k] = v
	}
	for _, k := range droppedKeywords {
		if v, ok := out[k]; ok {
			notes = append(notes, fmt.Sprintf("%s %v", k, v))
			delete(out, k)
		}
	}
	if v, ok := out["minItems"]; ok {
		if n, isInt := v.(int); !isInt || n > 1 {
			notes = append(notes, fmt.Sprintf("minItems %v", v))
			delete(out, "minItems")
		}
	}
	if f, ok := out["format"].(string); ok && !supportedFormats[f] {
		notes = append(notes, "format "+f)
		delete(out, "format")
	}
	if nullableTypes {
		if ts, ok := out["type"].([]string); ok && len(ts) == 2 && ts[1] == "null" {
			out["type"] = ts[0]
			notes = append(notes, "may be null")
		}
	}
	if props, ok := out["properties"].(map[string]any); ok {
		np := make(map[string]any, len(props))
		for k, v := range props {
			if m, ok := v.(map[string]any); ok {
				np[k] = strictSchema(m, nullableTypes)
			} else {
				np[k] = v
			}
		}
		out["properties"] = np
	}
	if items, ok := out["items"].(map[string]any); ok {
		out["items"] = strictSchema(items, nullableTypes)
	}
	if len(notes) > 0 {
		sort.Strings(notes)
		d, _ := out["description"].(string)
		out["description"] = strings.TrimSpace(d + " (" + strings.Join(notes, ", ") + ")")
	}
	return out
}

// Anthropic refuses a request whose strict tools exceed its limits: at most
// 20 strict tools and 24 optional parameters across all their schemas. A
// tool set within both limits is sent strict; a larger one (the in-app chat
// offers more) goes without strict mode, which is safe because the registry
// validates every call's arguments itself (issue #1102).
const (
	anthropicMaxStrictTools    = 20
	anthropicMaxStrictOptional = 24
)

// fitsAnthropicStrict reports whether these tool schemas fit both limits.
func fitsAnthropicStrict(schemas []map[string]any) bool {
	if len(schemas) > anthropicMaxStrictTools {
		return false
	}
	n := 0
	for _, s := range schemas {
		n += optionalParams(s)
	}
	return n <= anthropicMaxStrictOptional
}

// optionalParams counts the properties not listed as required, at every
// level of the schema.
func optionalParams(s map[string]any) int {
	n := 0
	if props, ok := s["properties"].(map[string]any); ok {
		req := map[string]bool{}
		switch r := s["required"].(type) {
		case []string:
			for _, k := range r {
				req[k] = true
			}
		case []any:
			for _, k := range r {
				if ks, ok := k.(string); ok {
					req[ks] = true
				}
			}
		}
		for k, v := range props {
			if !req[k] {
				n++
			}
			if m, ok := v.(map[string]any); ok {
				n += optionalParams(m)
			}
		}
	}
	if items, ok := s["items"].(map[string]any); ok {
		n += optionalParams(items)
	}
	return n
}
