package assistant

import (
	"fmt"
	"testing"
)

// TestFitsAnthropicStrict: at most 20 tools and 24 optional parameters,
// nested ones included, stay strict (issue #1102).
func TestFitsAnthropicStrict(t *testing.T) {
	opt := func(n int) map[string]any {
		props := map[string]any{}
		for i := 0; i < n; i++ {
			props[fmt.Sprintf("p%d", i)] = map[string]any{"type": "string"}
		}
		return map[string]any{"type": "object", "properties": props, "required": []string{"p0"}}
	}
	many := func(k, n int) []map[string]any {
		out := make([]map[string]any, k)
		for i := range out {
			out[i] = opt(n)
		}
		return out
	}
	cases := []struct {
		name    string
		schemas []map[string]any
		want    bool
	}{
		{"20 tools", many(20, 1), true},
		{"21 tools", many(21, 1), false},
		{"24 optional", []map[string]any{opt(25)}, true},
		{"25 optional", []map[string]any{opt(26)}, false},
		{"nested", []map[string]any{{"type": "object", "properties": map[string]any{"a": map[string]any{"type": "array", "items": opt(25)}}, "required": []any{"a"}}}, true},
		{"nested over", []map[string]any{{"type": "object", "properties": map[string]any{"a": map[string]any{"type": "array", "items": opt(26)}}, "required": []any{"a"}}}, false},
	}
	for _, c := range cases {
		if got := fitsAnthropicStrict(c.schemas); got != c.want {
			t.Errorf("%s: %v, want %v", c.name, got, c.want)
		}
	}
}
