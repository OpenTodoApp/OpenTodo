package auth

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/store"
)

func newService(t *testing.T, allowSignup bool) (*Service, *sql.DB) {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewService(db, time.Hour, allowSignup), db
}

func mustOwner(t *testing.T, s *Service) *User {
	t.Helper()
	u, err := s.Register(context.Background(), "owner@example.com", "Owner", "correct horse battery", "")
	if err != nil {
		t.Fatal(err)
	}
	if u.Role != "owner" {
		t.Fatalf("role = %s", u.Role)
	}
	return u
}

func TestInvitationLifecycle(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	if !s.CanInvite(owner) || !s.CanInvite(&User{Role: "admin"}) || s.CanInvite(&User{Role: "member"}) || s.CanInvite(nil) {
		t.Fatal("CanInvite must admit owners and admins only")
	}

	inv, secret, err := s.CreateInvitation(ctx, owner, "", 0)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(secret, "oti_") || inv.Status != InvitationPending || inv.Email != nil {
		t.Fatalf("created = %+v secret=%q", inv, secret)
	}
	if got := inv.ExpiresAt - inv.CreatedAt; got != DefaultInvitationTTL.Milliseconds() {
		t.Fatalf("default expiry = %d ms", got)
	}
	// Only the hash is stored.
	var stored string
	if err := db.QueryRow("SELECT token_hash FROM invitations WHERE id = ?", inv.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == secret || stored != hashToken(secret) {
		t.Fatalf("stored token_hash = %q", stored)
	}

	list, err := s.ListInvitations(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != inv.ID || list[0].Status != InvitationPending || list[0].CreatedByName != "Owner" {
		t.Fatalf("list = %+v", list)
	}

	p, err := s.PreviewInvitation(ctx, secret)
	if err != nil || p.InviterName != "Owner" || p.Email != nil || p.ExpiresAt != inv.ExpiresAt {
		t.Fatalf("preview = %+v, %v", p, err)
	}

	if err := s.RevokeInvitation(ctx, owner.ID, inv.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.RevokeInvitation(ctx, owner.ID, inv.ID); err != nil {
		t.Fatalf("second revoke should be a no-op, got %v", err)
	}
	if err := s.RevokeInvitation(ctx, owner.ID, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown id: %v", err)
	}
	if _, err := s.PreviewInvitation(ctx, secret); !errors.Is(err, ErrInvitationInvalid) {
		t.Fatalf("preview after revoke: %v", err)
	}
	list, _ = s.ListInvitations(ctx)
	if list[0].Status != InvitationRevoked || list[0].RevokedAt == nil {
		t.Fatalf("list after revoke = %+v", list[0])
	}
	if _, err := s.Register(ctx, "late@example.com", "", "another long password", secret); !errors.Is(err, ErrInvitationInvalid) {
		t.Fatalf("register with revoked invitation: %v", err)
	}

	// Expiry is derived from the timestamp.
	inv2, secret2, _ := s.CreateInvitation(ctx, owner, "", time.Hour)
	if _, err := db.Exec("UPDATE invitations SET expires_at = ? WHERE id = ?", time.Now().Add(-time.Second).UnixMilli(), inv2.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.PreviewInvitation(ctx, secret2); !errors.Is(err, ErrInvitationInvalid) {
		t.Fatalf("preview of expired: %v", err)
	}
	list, _ = s.ListInvitations(ctx)
	if list[0].ID != inv2.ID || list[0].Status != InvitationExpired {
		t.Fatalf("expired entry = %+v", list[0])
	}

	// Validation.
	if _, _, err := s.CreateInvitation(ctx, owner, "not-an-email", 0); !errors.Is(err, ErrInvalidEmail) {
		t.Fatalf("bad email: %v", err)
	}
	if _, _, err := s.CreateInvitation(ctx, owner, "", 31*24*time.Hour); !errors.Is(err, ErrInvalidExpiry) {
		t.Fatalf("too long expiry: %v", err)
	}
	if _, _, err := s.CreateInvitation(ctx, owner, "", time.Minute); !errors.Is(err, ErrInvalidExpiry) {
		t.Fatalf("too short expiry: %v", err)
	}
}

func TestRegisterWithInvitationWhileSignupClosed(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)

	if _, err := s.Register(ctx, "nobody@example.com", "", "another long password", ""); !errors.Is(err, ErrSignupClosed) {
		t.Fatalf("without invitation: %v", err)
	}
	if _, err := s.Register(ctx, "nobody@example.com", "", "another long password", "oti_bogus"); !errors.Is(err, ErrInvitationInvalid) {
		t.Fatalf("unknown invitation: %v", err)
	}

	inv, secret, err := s.CreateInvitation(ctx, owner, "Friend@Example.com", 0)
	if err != nil {
		t.Fatal(err)
	}
	// email_taken leaves the invitation pending.
	if _, err := s.Register(ctx, "owner@example.com", "", "another long password", secret); !errors.Is(err, ErrInvitationEmailMismatch) {
		t.Fatalf("mismatch before taken: %v", err)
	}
	u, err := s.Register(ctx, "friend@example.com", "Friend", "another long password", secret)
	if err != nil {
		t.Fatal(err)
	}
	if u.Role != "member" {
		t.Fatalf("role = %s", u.Role)
	}
	list, _ := s.ListInvitations(ctx)
	if list[0].ID != inv.ID || list[0].Status != InvitationAccepted || list[0].AcceptedBy == nil || list[0].AcceptedBy.ID != u.ID {
		t.Fatalf("after accept = %+v", list[0])
	}
	if err := s.RevokeInvitation(ctx, owner.ID, inv.ID); !errors.Is(err, ErrInvitationSpent) {
		t.Fatalf("revoke accepted: %v", err)
	}
	// Second use in sequence is refused.
	if _, err := s.Register(ctx, "third@example.com", "", "another long password", secret); !errors.Is(err, ErrInvitationInvalid) {
		t.Fatalf("second use: %v", err)
	}
	if n, _ := s.UserCount(ctx); n != 2 {
		t.Fatalf("users = %d", n)
	}
}

func TestInvitationEmailMismatch(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	_, secret, _ := s.CreateInvitation(ctx, owner, "a@example.com", 0)

	if _, err := s.Register(ctx, "b@example.com", "", "another long password", secret); !errors.Is(err, ErrInvitationEmailMismatch) {
		t.Fatalf("mismatch: %v", err)
	}
	list, _ := s.ListInvitations(ctx)
	if list[0].Status != InvitationPending {
		t.Fatalf("status after mismatch = %s", list[0].Status)
	}
	if n, _ := s.UserCount(ctx); n != 1 {
		t.Fatalf("users = %d", n)
	}
	// Case-insensitive match succeeds.
	if _, err := s.Register(ctx, "A@Example.COM", "", "another long password", secret); err != nil {
		t.Fatalf("case-insensitive accept: %v", err)
	}
}

func TestInvitationEmailTakenKeepsInvitationPending(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	_, secret, _ := s.CreateInvitation(ctx, owner, "", 0)
	if _, err := s.Register(ctx, "owner@example.com", "", "another long password", secret); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("taken: %v", err)
	}
	list, _ := s.ListInvitations(ctx)
	if list[0].Status != InvitationPending {
		t.Fatalf("status after email_taken = %s", list[0].Status)
	}
}

func TestInvitationSingleUseUnderConcurrency(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	_, secret, _ := s.CreateInvitation(ctx, owner, "", 0)

	const n = 8
	var wg sync.WaitGroup
	results := make(chan error, n)
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, err := s.Register(ctx, "user"+string(rune('a'+i))+"@example.com", "", "another long password", secret)
			results <- err
		}(i)
	}
	close(start)
	wg.Wait()
	close(results)
	var ok, invalid int
	for err := range results {
		switch {
		case err == nil:
			ok++
		case errors.Is(err, ErrInvitationInvalid):
			invalid++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if ok != 1 || invalid != n-1 {
		t.Fatalf("ok=%d invalid=%d", ok, invalid)
	}
	if count, _ := s.UserCount(ctx); count != 2 {
		t.Fatalf("users = %d, want owner + one member", count)
	}
}
