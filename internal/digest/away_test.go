package digest

import (
	"context"
	"testing"
)

// An away period that pauses reminders (away-periods "Quiet while away"): the
// digest of a Friday inside it is not sent, nor later; the next Friday after
// the period it is. A period without " quiet" sends as usual.
func TestAwayHoldsTheDigest(t *testing.T) {
	e := newEnv(t)
	e.enable("u1")
	e.apply("u1", map[string]map[string]any{"user_prefs:me": {"away": "2026-10-20..2026-10-26 quiet"}})
	s := e.service()
	if n := e.tick(s, "2026-10-23 07:03"); n != 0 {
		t.Fatalf("sent %d while away", n)
	}
	if n := e.tick(s, "2026-10-23 07:20"); n != 0 || len(e.smtp.Messages()) != 0 {
		t.Fatalf("held digest sent later: %d", n)
	}
	st, _ := NewStore(e.db, nil).Get(context.Background(), "u1")
	if st.LastOutcome != OutcomeAway || st.LastSentFor != "2026-10-23" {
		t.Fatalf("state = %+v", st)
	}
	if n := e.tick(s, "2026-10-30 07:01"); n != 1 {
		t.Fatalf("the Friday after the period sent %d", n)
	}

	e2 := newEnv(t)
	e2.enable("u1")
	e2.apply("u1", map[string]map[string]any{"user_prefs:me": {"away": "2026-10-20..2026-10-26"}})
	if n := e2.tick(e2.service(), "2026-10-23 07:03"); n != 1 {
		t.Fatalf("a period keeping reminders held the digest: %d", n)
	}
}
