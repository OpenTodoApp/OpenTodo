package oidc

import (
	"fmt"
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

	now = now.Add(HandoffTTL + time.Second)
	for i := 0; i < maxHandoffs; i++ {
		if s.Put(Handoff{Claims: Claims{Subject: fmt.Sprint(i)}}) == "" {
			t.Fatalf("store full after %d", i)
		}
	}
	if s.Put(Handoff{Claims: Claims{Subject: "late"}}) != "" {
		t.Fatal("a full store refuses")
	}
	now = now.Add(HandoffTTL + time.Second)
	if s.Put(Handoff{Claims: Claims{Subject: "late"}}) == "" {
		t.Fatal("expired codes make room")
	}
}

// One identity cannot fill the store: its fourth waiting code is refused,
// while other identities, and the same subject at another issuer, still get theirs.
func TestHandoffsPerSubject(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	s := NewHandoffs(func() time.Time { return now })
	one := Handoff{Issuer: "https://idp", Claims: Claims{Subject: "eve"}}
	for i := 0; i < maxPerSubject; i++ {
		if s.Put(one) == "" {
			t.Fatalf("code %d refused", i)
		}
	}
	if s.Put(one) != "" {
		t.Fatal("a fourth waiting code for one identity is refused")
	}
	if s.Put(Handoff{Issuer: "https://idp", Claims: Claims{Subject: "ada"}}) == "" {
		t.Fatal("another identity still gets a code")
	}
	if s.Put(Handoff{Issuer: "https://other", Claims: Claims{Subject: "eve"}}) == "" {
		t.Fatal("the same subject at another issuer is another identity")
	}
	now = now.Add(HandoffTTL + time.Second)
	if s.Put(one) == "" {
		t.Fatal("expired codes free the identity again")
	}
}
