package cli

import (
	"encoding/json"
	"testing"
)

// routines-dynamic-data D9: `ot routine show` prints Pick by its mode.
func TestRoutineSentencePick(t *testing.T) {
	in := func(s string) map[string]json.RawMessage {
		var m map[string]json.RawMessage
		if err := json.Unmarshal([]byte(s), &m); err != nil {
			t.Fatal(err)
		}
		return m
	}
	for _, c := range []struct{ kind, in, want string }{
		{"take", `{"list":{"ref":"a"},"n":{"literal":1},"from":{"literal":"start"}}`, `pick first (from = "start", list ← a, n = 1)`},
		{"take", `{"list":{"ref":"a"},"from":{"literal":"end"}}`, `pick last (from = "end", list ← a)`},
		{"take", `{"list":{"ref":"a"},"n":{"literal":3}}`, `pick first 3 (list ← a, n = 3)`},
		{"take", `{"list":{"ref":"a"},"from":{"literal":"all"}}`, `pick all (from = "all", list ← a)`},
		{"filter", `{"list":{"ref":"a"},"where":{"literal":{"due":"overdue"}}}`, `pick where (list ← a, where = {"due":"overdue"})`},
		{"add_comment", `{"task":{"ref":"b"},"text":{"literal":"Hi"}}`, `add comment (task ← b, text = "Hi")`},
	} {
		if got := (routineStep{Kind: c.kind, In: in(c.in)}).sentence(); got != c.want {
			t.Errorf("%s: %s, want %s", c.kind, got, c.want)
		}
	}
}
