package rules

import (
	"strings"
	"testing"
)

// A run an AI assistant started is capped at what is left of its token's
// daily items (MaxWrites): planning more writes nothing and fails the run with
// the reason; within the cap it writes as usual.
func TestRoutineRunMaxWrites(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.project("alice", "errands", "Errands", "")
	h.routine("alice", "r1", "Shop", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"create_tasks","in":{"text":{"literal":"milk\nbread\neggs"},"project":{"literal":{"project":"errands"}}}}]`)
	res, err := h.e.RunNow(h.ctx, "alice", RunRequest{RuleID: "r1", RunID: "over", Source: SourceMCP, MaxWrites: 2})
	if err != nil {
		t.Fatal(err)
	}
	if res.Run.Outcome != OutcomeFailed || res.Run.Writes != 0 || !strings.Contains(res.Run.Reason, "2 items left") || !strings.Contains(res.Run.Reason, "would write 3") {
		t.Fatalf("over the cap: %+v", res.Run)
	}
	if n := len(h.live("alice", inProject("errands"))); n != 0 {
		t.Fatalf("a capped run wrote %d tasks", n)
	}
	res, err = h.e.RunNow(h.ctx, "alice", RunRequest{RuleID: "r1", RunID: "within", Source: SourceMCP, MaxWrites: 3})
	if err != nil {
		t.Fatal(err)
	}
	if res.Run.Outcome != OutcomeApplied || res.Run.Writes != 3 || len(h.live("alice", inProject("errands"))) != 3 {
		t.Fatalf("within the cap: %+v", res.Run)
	}
}
