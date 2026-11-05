package location

import (
	"encoding/json"
	"testing"
)

// FuzzDecode: a task's location and a place's coordinates arrive from any
// device or import. Decoding never panics, and whatever Decode accepts the
// write check accepts too (external-security-review).
func FuzzDecode(f *testing.F) {
	for _, s := range []string{`{"name":"Home","lat":45.1,"lon":9.2}`, `{"name":"Garage"}`, `{"lat":91,"lon":0}`, `null`, `"enc:v1:AAAA"`, `{"lat":1e400}`} {
		f.Add([]byte(s))
	}
	f.Fuzz(func(t *testing.T, raw []byte) {
		r := json.RawMessage(raw)
		if l, err := Decode(r); err == nil {
			if err := CheckValue(r); err != nil {
				t.Fatalf("Decode accepted %q but CheckValue refused it: %v", raw, err)
			}
			if err := l.Validate(); err != nil {
				t.Fatalf("Decode returned an invalid location: %v", err)
			}
		}
		_, _ = DecodeGeo(r)
	})
}
