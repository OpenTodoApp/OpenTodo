package rules

import "testing"

// TestQueuedEventWakesTheJob (one-job-model): an event queued by the observer
// wakes the tenant's "rules" job at once; a change that queues nothing does not.
func TestQueuedEventWakesTheJob(t *testing.T) {
	h := newHarness(t)
	wakes := 0
	h.e.SetWake(func() { wakes++ })
	h.task("alice", "t0", nil)
	if wakes != 0 {
		t.Fatalf("woken %d times without a rule", wakes)
	}
	h.rule("alice", "r1", "Urgent", `{"kind":"task.created"}`, "", `{"priority":1}`)
	h.task("alice", "t1", nil)
	if wakes != 1 {
		t.Fatalf("woken %d times for one queued event, want 1", wakes)
	}
	// The job is due now while an event waits, and its run handles it.
	if at, ok, err := h.e.NextDue(h.ctx); err != nil || !ok || at.After(h.clock) {
		t.Fatalf("next due %v %v %v, want now (an event waits)", at, ok, err)
	}
	h.e.RunOnce(h.ctx)
	if p := string(h.get("alice", "t1")["priority"]); p != "1" {
		t.Fatalf("priority %s", p)
	}
}
