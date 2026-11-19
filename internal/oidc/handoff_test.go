package oidc

import (
	"testing"
	"time"
)

func TestHandoffsSingleUseAndExpiry(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	s := NewHandoffs(func() time.Time { return now })
	yes := func(string) bool { return true }

	code := s.Put(Handoff{Claims: Claims{Subject: "a"}, Challenge: "c"})
	if h, ok := s.Take(code, func(ch string) bool { return ch == "c" }); !ok || h.Claims.Subject != "a" {
		t.Fatalf("take = %v %v", h, ok)
	}
	if _, ok := s.Take(code, yes); ok {
		t.Fatal("a code is taken once")
	}

	code = s.Put(Handoff{Challenge: "c"})
	if _, ok := s.Take(code, func(string) bool { return false }); ok {
		t.Fatal("a refused verifier takes nothing")
	}
	if _, ok := s.Take(code, yes); ok {
		t.Fatal("a refused try spends the code")
	}

	code = s.Put(Handoff{})
	now = now.Add(HandoffTTL + time.Second)
	if _, ok := s.Take(code, yes); ok {
		t.Fatal("an expired code is refused")
	}

	for i := 0; i < maxHandoffs; i++ {
		if s.Put(Handoff{}) == "" {
			t.Fatalf("store full after %d", i)
		}
	}
	if s.Put(Handoff{}) != "" {
		t.Fatal("a full store refuses")
	}
	now = now.Add(HandoffTTL + time.Second)
	if s.Put(Handoff{}) == "" {
		t.Fatal("expired codes make room")
	}
}
