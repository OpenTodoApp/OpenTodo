package auth

import (
	"context"
	"errors"
	"testing"
	"time"
)

// Revoked devices (OpenSpec change revoked-device-wipe).

func TestRevokedSessionsKeepTheirProof(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	now := time.Now()
	s.SetClock(func() time.Time { return now })
	owner := mustOwner(t, s)
	sec := session(t, s, owner)
	stale := session(t, s, owner) // never loaded the app since the upgrade: no wipe key
	key, err := s.WipeKey(ctx, SessionHash(sec))
	if err != nil || key == "" {
		t.Fatalf("wipe key = %q %v", key, err)
	}
	if _, err := s.RevokedProof(ctx, sec); !errors.Is(err, ErrNotFound) {
		t.Fatalf("live session has a proof: %v", err)
	}
	if err := s.SignOutEverywhere(ctx, owner.ID); err != nil {
		t.Fatal(err)
	}
	if proof, err := s.RevokedProof(ctx, sec); err != nil || proof != WipeProof(key) {
		t.Fatalf("revoked session proof = %q %v", proof, err)
	}
	if _, err := s.RevokedProof(ctx, stale); !errors.Is(err, ErrNotFound) {
		t.Fatalf("session without a key got a proof: %v", err)
	}
	// The record names no person (design D2) and goes with its retention.
	if n := countRows(t, db, "SELECT COUNT(*) FROM revoked_sessions"); n != 1 {
		t.Fatalf("revoked sessions = %d", n)
	}
	if at, ok, err := s.NextRevokedExpiry(ctx); err != nil || !ok || !at.Equal(time.UnixMilli(now.Add(RevokedRetention).UnixMilli())) {
		t.Fatalf("next expiry = %v %v %v", at, ok, err)
	}
	if n, err := s.PruneRevokedSessions(ctx); err != nil || n != 0 {
		t.Fatalf("pruned early: %d %v", n, err)
	}
	now = now.Add(RevokedRetention + time.Second)
	if _, err := s.RevokedProof(ctx, sec); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expired record still proves: %v", err)
	}
	if n, err := s.PruneRevokedSessions(ctx); err != nil || n != 1 {
		t.Fatalf("pruned = %d %v", n, err)
	}
	if _, ok, _ := s.NextRevokedExpiry(ctx); ok {
		t.Fatal("a deadline after pruning everything")
	}
}

func TestWipeKeyNeedsALiveSession(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	if _, err := s.WipeKey(ctx, SessionHash("not a session")); !errors.Is(err, ErrNotFound) {
		t.Fatalf("wipe key for no session: %v", err)
	}
}
