package agenttools

import (
	"testing"
	"time"
)

// An account's tokens share the account budget: several tokens do not
// multiply the write limits (agent-limits-per-account).
func TestLimiterPerAccount(t *testing.T) {
	now := time.Date(2026, 10, 12, 10, 0, 0, 0, time.UTC)
	l := NewLimiter(func() time.Time { return now })
	tokens := []string{"t1", "t2", "t3", "t4"}

	// Calls: four tokens together stop at the account's limit, though none of
	// them reached its own.
	for i := 0; i < AccountPerMinute; i++ {
		if ok, _ := l.AllowCallFor("u1", tokens[i%len(tokens)]); !ok {
			t.Fatalf("call %d refused", i+1)
		}
	}
	ok, retry := l.AllowCallFor("u1", "t5")
	if ok || retry <= 0 || retry > 60 {
		t.Fatalf("a fresh token over the account's minute: %v %d", ok, retry)
	}
	if ok, _ := l.AllowCallFor("u2", "t9"); !ok {
		t.Fatal("another account was limited")
	}
	// A call refused for the account counts against neither.
	now = now.Add(61 * time.Second)
	for i := 0; i < PerMinute; i++ {
		if ok, _ := l.AllowCallFor("u1", "t5"); !ok {
			t.Fatalf("t5 call %d refused after the minute passed", i+1)
		}
	}
	if ok, _ := l.AllowCallFor("u1", "t5"); ok {
		t.Fatal("the token limit no longer applies")
	}

	// Items: the account's day is shared too.
	for _, tok := range []string{"t1", "t2"} {
		if ok, _ := l.ReserveFor("u1", tok, PerDay); !ok {
			t.Fatalf("%s: a token's full day refused", tok)
		}
	}
	if ok, retry := l.ReserveFor("u1", "t3", 1); ok || retry <= 0 {
		t.Fatalf("a third token over the account's day: %v %d", ok, retry)
	}
	if ok, _ := l.ReserveFor("u2", "t9", PerDay); !ok {
		t.Fatal("another account's day was used")
	}
	// A refund returns the items to the token and the account.
	l.RefundFor("u1", "t2", 10)
	if ok, _ := l.ReserveFor("u1", "t3", 10); !ok {
		t.Fatal("refund not returned to the account")
	}
	if ok, _ := l.ReserveFor("u1", "t3", 1); ok {
		t.Fatal("refund returned more than was refunded")
	}
	// The next UTC day starts a new budget for both.
	now = now.Add(24 * time.Hour)
	if ok, _ := l.ReserveFor("u1", "t3", PerDay); !ok {
		t.Fatal("the account's budget did not reset at the UTC day boundary")
	}
}

// Through the registry, two agent tokens of one person share the account's
// calls a minute; another person is unaffected.
func TestWriteRatePerAccount(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t1", "Water", nil)
	f.task("u2", "t2", "Water", nil)
	a, b := agent("u1"), agent("u1")
	b.TokenID = "tok-u1-second"
	for i := 0; i < AccountPerMinute; i++ {
		c := a
		if i%2 == 1 {
			c = b
		}
		f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "priority": 1 + i%4}}})
	}
	third := agent("u1")
	third.TokenID = "tok-u1-third"
	if _, err := f.call(third, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "priority": 4}}}); toolCode(err) != "rate_limited" {
		t.Fatalf("a third token over the account's minute: %v", err)
	}
	f.mustCall(agent("u2"), "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t2", "priority": 1}}})
}
