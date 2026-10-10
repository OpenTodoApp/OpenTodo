package email

import (
	"errors"
	"testing"
	"time"
)

func TestInboxLifecycle(t *testing.T) {
	h := newHarness(t)
	in := h.inbox("alice")
	if !ValidSecret(in.Secret) || !in.Enabled || len(in.Allowlist) != 0 || in.RotatedAt != nil {
		t.Fatalf("new inbox = %+v", in)
	}
	if again := h.inbox("alice"); again.Secret != in.Secret {
		t.Fatal("Get created a second secret")
	}
	if other := h.inbox("bob"); other.Secret == in.Secret {
		t.Fatal("two accounts share a secret")
	}
	if got, ok, err := h.store.BySecret(h.ctx, toUpper(in.Secret)); err != nil || !ok || got.UserID != "alice" {
		t.Fatalf("BySecret (upper case) = %+v %v %v", got, ok, err)
	}

	rot, err := h.store.Rotate(h.ctx, "alice")
	if err != nil || rot.Secret == in.Secret || rot.RotatedAt == nil {
		t.Fatalf("rotate = %+v, %v", rot, err)
	}
	if _, ok, _ := h.store.BySecret(h.ctx, in.Secret); ok {
		t.Fatal("old secret still routes after rotation")
	}

	off := false
	list, err := NormalizeAllowlist([]string{" Alice@Example.org", "alice@example.org", "me@work.example"})
	if err != nil {
		t.Fatal(err)
	}
	up, err := h.store.Update(h.ctx, "alice", &off, list)
	if err != nil || up.Enabled || len(up.Allowlist) != 2 || up.Allowlist[0] != "alice@example.org" {
		t.Fatalf("update = %+v, %v", up, err)
	}
	// One created, one rotated, two updates (enabled, allowlist); no secret in details.
	if n := h.count(`SELECT COUNT(*) FROM audit_events WHERE actor_id = 'alice' AND name LIKE 'email_inbox.%'`); n != 4 {
		t.Fatalf("audit events = %d", n)
	}
	if n := h.count(`SELECT COUNT(*) FROM audit_events WHERE details LIKE ? OR details LIKE ?`, "%"+in.Secret+"%", "%"+rot.Secret+"%"); n != 0 {
		t.Fatal("a secret reached the audit log")
	}
	// Updating to the same values records nothing.
	if _, err := h.store.Update(h.ctx, "alice", &off, list); err != nil {
		t.Fatal(err)
	}
	if n := h.count(`SELECT COUNT(*) FROM audit_events WHERE name = 'email_inbox.updated'`); n != 2 {
		t.Fatalf("no-op update audited: %d", n)
	}
}

func toUpper(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'a' && c <= 'z' {
			b[i] = c - 32
		}
	}
	return string(b)
}

func TestNormalizeAllowlistRejects(t *testing.T) {
	for _, bad := range [][]string{
		{"not an address"},
		{"Alice <alice@example.org>"},
		{""},
		make([]string, MaxAllowlist+1),
	} {
		if _, err := NormalizeAllowlist(bad); !errors.Is(err, ErrInvalidAllowlist) {
			t.Fatalf("%q accepted", bad)
		}
	}
}

func TestReceiptDedup(t *testing.T) {
	h := newHarness(t)
	now := h.clock
	if ok, err := h.store.AddReceipt(h.ctx, "alice", "<m1@x>", now); err != nil || !ok {
		t.Fatalf("first receipt: %v %v", ok, err)
	}
	if ok, _ := h.store.AddReceipt(h.ctx, "alice", "<m1@x>", now); ok {
		t.Fatal("second receipt for the same Message-ID inserted")
	}
	if ok, _ := h.store.AddReceipt(h.ctx, "bob", "<m1@x>", now); !ok {
		t.Fatal("receipts are not per account")
	}
	if seen, _ := h.store.HasReceipt(h.ctx, "alice", "<m1@x>"); !seen {
		t.Fatal("HasReceipt false")
	}
	if _, err := h.store.AddReceipt(h.ctx, "alice", "<old@x>", now.Add(-2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if n, _ := h.store.HourlyCount(h.ctx, "alice", now); n != 1 {
		t.Fatalf("hourly count = %d", n)
	}
	if _, err := h.store.AddReceipt(h.ctx, "alice", "<ancient@x>", now.Add(-ReceiptRetention-time.Hour)); err != nil {
		t.Fatal(err)
	}
	if n, err := h.store.PruneReceipts(h.ctx, now); err != nil || n != 1 {
		t.Fatalf("pruned %d, %v", n, err)
	}
}
