package quickadd

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/recurrence/recurrence10"
)

// TestVectorRulesReadBy10: every rule quick add stores, in every shared vector,
// is one a 1.0 client reads whenever such a rule means the same thing
// (recurrence-1-0-compatible).
func TestVectorRulesReadBy10(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/nlp/quickadd.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Cases []struct {
			Name string  `json:"name"`
			Line string  `json:"line"`
			Ctx  Context `json:"ctx"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, c := range file.Cases {
		got := Parse(c.Line, c.Ctx)
		if got.Recurrence == "" {
			continue
		}
		n++
		due := ""
		if got.Due != nil {
			due = got.Due.Date
		}
		if err := recurrence10.Check(got.Recurrence, due); err != nil {
			t.Errorf("%s: %v", c.Name, err)
		}
	}
	if n < 50 {
		t.Fatalf("only %d vectors with a rule", n)
	}
}
