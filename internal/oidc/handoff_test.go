package oidc

import (
	"fmt"
	"testing"
	"time"
)

// put holds h and releases it at once, as a tap on Continue does: the code.
func put(s *Handoffs, h Handoff) string {
	ticket := s.Hold(h)
	if ticket == "" {
		return ""
	}
	code, _, _ := s.Release(ticket)
	return code
}

func TestHandoffsSingleUseAndExpiry(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	s := NewHandoffs(func() time.Time { return now })
	yes := func(string) bool { return true }

	code := put(s, Handoff{Claims: Claims{Subject: "a"}, Challenge: "c"})
	if h, ok := s.Take(code, func(ch string) bool { return ch == "c" }); !ok || h.Claims.Subject != "a" {
		t.Fatalf("take = %v %v", h, ok)
	}
	if _, ok := s.Take(code, yes); ok {
		t.Fatal("a code is taken once")
	}

	code = put(s, Handoff{Challenge: "c"})
	if _, ok := s.Take(code, func(string) bool { return false }); ok {
		t.Fatal("a refused verifier takes nothing")
	}
	if _, ok := s.Take(code, yes); ok {
		t.Fatal("a refused try spends the code")
	}

	code = put(s, Handoff{})
	now = now.Add(HandoffTTL + time.Second)
	if _, ok := s.Take(code, yes); ok {
		t.Fatal("an expired code is refused")
	}

	now = now.Add(HandoffTTL + time.Second)
	for i := 0; i < maxHandoffs; i++ {
		if s.Hold(Handoff{Claims: Claims{Subject: fmt.Sprint(i)}}) == "" {
			t.Fatalf("store full after %d", i)
		}
	}
	if s.Hold(Handoff{Claims: Claims{Subject: "late"}}) != "" {
		t.Fatal("a full store refuses")
	}
	now = now.Add(HandoffTTL + time.Second)
	if s.Hold(Handoff{Claims: Claims{Subject: "late"}}) == "" {
		t.Fatal("expired codes make room")
	}
}

// One identity cannot fill the store: its fourth sign-in replaces its oldest
// waiting one, preferring one still held, while other identities, and the same
// subject at another issuer, keep theirs.
func TestHandoffsPerSubject(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	s := NewHandoffs(func() time.Time { return now })
	one := Handoff{Issuer: "https://idp", Claims: Claims{Subject: "eve"}}
	other := s.Hold(Handoff{Issuer: "https://idp", Claims: Claims{Subject: "ada"}})
	elsewhere := s.Hold(Handoff{Issuer: "https://other", Claims: Claims{Subject: "eve"}})
	released := put(s, one) // confirmed, waiting for the app
	now = now.Add(time.Second)
	first := s.Hold(one)
	now = now.Add(time.Second)
	second := s.Hold(one)
	now = now.Add(time.Second)
	if s.Hold(one) == "" {
		t.Fatal("a fourth sign-in of one identity is taken, not refused")
	}
	if _, _, ok := s.Release(first); ok {
		t.Fatal("the oldest held code of that identity made room")
	}
	if _, _, ok := s.Release(second); !ok {
		t.Fatal("a newer held code stays")
	}
	if _, ok := s.Take(released, func(string) bool { return true }); !ok {
		t.Fatal("a confirmed code goes only when no held one is left to drop")
	}
	for _, ticket := range []string{other, elsewhere} {
		if _, _, ok := s.Release(ticket); !ok {
			t.Fatal("other identities keep their codes")
		}
	}
}

// The code exists for the app only after the confirmation: a held hand-off
// cannot be taken, its ticket releases it once, and a dropped one is gone.
func TestHandoffsHeldUntilConfirmed(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	s := NewHandoffs(func() time.Time { return now })
	yes := func(string) bool { return true }

	s.Hold(Handoff{Claims: Claims{Subject: "a"}, AppState: "st"})
	for code := range s.codes {
		if _, ok := s.Take(code, yes); ok {
			t.Fatal("a held hand-off cannot be redeemed before the confirmation")
		}
	}
	ticket := s.Hold(Handoff{Claims: Claims{Subject: "a"}, AppState: "st"})
	code, h, ok := s.Release(ticket)
	if !ok || code == "" || h.AppState != "st" {
		t.Fatalf("release = %q %v %v", code, h, ok)
	}
	if _, _, ok := s.Release(ticket); ok {
		t.Fatal("a ticket releases once")
	}
	now = now.Add(HandoffTTL - time.Second)
	if got, ok := s.Take(code, yes); !ok || got.Claims.Subject != "a" {
		t.Fatal("a released code is redeemed")
	}

	ticket = s.Hold(Handoff{Claims: Claims{Subject: "b"}})
	if _, ok := s.Drop(ticket); !ok {
		t.Fatal("cancel drops a held hand-off")
	}
	if _, _, ok := s.Release(ticket); ok {
		t.Fatal("a dropped hand-off cannot be released")
	}

	ticket = s.Hold(Handoff{Claims: Claims{Subject: "c"}})
	now = now.Add(HandoffTTL + time.Second)
	if _, _, ok := s.Release(ticket); ok {
		t.Fatal("an expired ticket releases nothing")
	}
}
