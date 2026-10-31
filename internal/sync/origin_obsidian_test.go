package sync

import (
	"context"
	"testing"
)

// obsidian-origin "Origin validation": an op with an Obsidian note origin is
// applied unchanged; one whose link is another Obsidian action, or a note other
// than its id, is refused and changes nothing.
func TestObsidianOriginOps(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	note := `{"kind":"obsidian","id":"Daily/2026-10-29.md","url":"obsidian://open?vault=Notes&file=Daily%2F2026-10-29","title":"2026-10-29"}`
	mustApply(t, s, "u1",
		op("c1", "task", "t1", "title", `"Call the plumber"`, 100, "A"),
		op("c2", "task", "t1", "origin", note, 100, "A"),
	)
	for i, v := range []string{
		`{"kind":"obsidian","id":"x.md","url":"obsidian://new?vault=Notes&name=x"}`,
		`{"kind":"obsidian","id":"Daily/2026-10-29.md","url":"obsidian://open?vault=Notes&file=Private%2Fdiary"}`,
		`{"kind":"url","url":"obsidian://open?vault=Notes&file=a"}`,
	} {
		res, err := s.Apply(ctx, "u1", []Op{op("bad"+string(rune('a'+i)), "task", "t1", "origin", v, int64(200+i), "A")})
		if err == nil && len(res.Rejected) == 0 {
			t.Fatalf("%s was accepted", v)
		}
	}
	e, err := s.Get(ctx, "u1", "task", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if got := string(e["origin"]); got != note {
		t.Fatalf("origin = %s", got)
	}
}
