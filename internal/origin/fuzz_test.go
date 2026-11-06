package origin

import (
	"encoding/json"
	"testing"
)

// FuzzDecode: a task's origin arrives from any device, import or connector.
// Decode never panics, and whatever it accepts the write check accepts too
// (external-security-review).
func FuzzDecode(f *testing.F) {
	for _, s := range []string{`{"kind":"issue","provider":"github","url":"https://github.com/a/b/issues/1","title":"x"}`,
		`{"kind":"email"}`, `{"kind":"web","url":"javascript:alert(1)"}`, `null`, `"enc:v1:AAAA"`, `{"kind":"obsidian","url":"obsidian://open?vault=a&file=b"}`} {
		f.Add([]byte(s))
	}
	f.Fuzz(func(t *testing.T, raw []byte) {
		o, err := Decode(json.RawMessage(raw))
		if err != nil {
			return
		}
		if err := CheckValue(json.RawMessage(raw)); err != nil {
			t.Fatalf("Decode accepted %q but CheckValue refused it: %v", raw, err)
		}
		if err := o.Validate(); err != nil {
			t.Fatalf("Decode returned an invalid origin: %v", err)
		}
		_ = o.Host()
	})
}
