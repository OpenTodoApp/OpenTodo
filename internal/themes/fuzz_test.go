package themes

import (
	"os"
	"path/filepath"
	"testing"
)

// FuzzValidate: a theme document from a file or another person never makes the
// validator panic, and a refusal always carries a code
// (external-security-review, threat model "Web client"). Seeds are the shared
// valid and invalid examples.
func FuzzValidate(f *testing.F) {
	for _, dir := range []string{"valid", "invalid"} {
		files, _ := filepath.Glob(filepath.Join("testdata", dir, "*.json"))
		for _, p := range files {
			if b, err := os.ReadFile(p); err == nil {
				f.Add(b)
			}
		}
	}
	f.Add([]byte(`{}`))
	f.Fuzz(func(t *testing.T, doc []byte) {
		err := Validate(Migrate(doc))
		if err != nil && Code(err) == "" {
			t.Fatalf("refusal without a code: %v", err)
		}
	})
}
