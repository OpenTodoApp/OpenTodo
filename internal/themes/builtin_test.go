package themes

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestBuiltinMatchesWeb: the server's list of shipped themes and their kinds is
// the web app's catalogue of documents (theme-instance-default D1).
func TestBuiltinMatchesWeb(t *testing.T) {
	files, err := filepath.Glob("../../web/src/lib/theme/builtin/*.json")
	if err != nil || len(files) == 0 {
		t.Fatalf("no built-in documents: %v", err)
	}
	seen := map[string]string{}
	for _, f := range files {
		raw, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		var d struct{ ID, Kind string }
		if err := json.Unmarshal(raw, &d); err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		seen[d.ID] = d.Kind
	}
	if len(seen) != len(Builtin) {
		t.Errorf("the web app ships %d themes, Builtin lists %d", len(seen), len(Builtin))
	}
	for id, kind := range seen {
		if Builtin[id] != kind {
			t.Errorf("%s: the web app says %q, Builtin says %q", id, kind, Builtin[id])
		}
	}
}
