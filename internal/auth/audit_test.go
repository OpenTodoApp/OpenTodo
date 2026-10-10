package auth

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
)

func countRows(t *testing.T, db *sql.DB, q string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestTokenCreationAtomicWithEvent(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)

	// Injected failure after the token row is written: neither row survives.
	s.afterTokenInsert = func() error { return errors.New("injected") }
	if _, _, err := s.CreateToken(ctx, owner.ID, "laptop script"); err == nil {
		t.Fatal("expected injected failure")
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM api_tokens"); n != 0 {
		t.Fatalf("token rows after failure = %d", n)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM audit_events WHERE name = 'token.created'"); n != 0 {
		t.Fatalf("events after failure = %d", n)
	}
	s.afterTokenInsert = nil

	// A failing event insert also rolls the token back.
	if _, err := db.Exec("ALTER TABLE audit_events RENAME TO audit_events_off"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.CreateToken(ctx, owner.ID, "laptop script"); err == nil {
		t.Fatal("expected failure without the audit table")
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM api_tokens"); n != 0 {
		t.Fatalf("token created without its event (%d rows)", n)
	}
	if _, err := db.Exec("ALTER TABLE audit_events_off RENAME TO audit_events"); err != nil {
		t.Fatal(err)
	}

	// Success: both exist, and the event carries id and name, never the secret.
	tok, plain, err := s.CreateToken(ctx, owner.ID, "laptop script")
	if err != nil {
		t.Fatal(err)
	}
	list, _, err := s.Audit().List(ctx, audit.Filter{Name: audit.TokenCreatedName})
	if err != nil || len(list) != 1 {
		t.Fatalf("token.created events = %v %v", list, err)
	}
	e := list[0]
	if e.ActorID == nil || *e.ActorID != owner.ID || e.Outcome != audit.Success ||
		e.Details["token_id"] != tok.ID || e.Details["token_name"] != "laptop script" {
		t.Fatalf("event = %+v", e)
	}
	for _, v := range e.Details {
		if v == plain {
			t.Fatal("token secret stored in the audit log")
		}
	}

	if err := s.DeleteToken(ctx, owner.ID, tok.ID); err != nil {
		t.Fatal(err)
	}
	list, _, _ = s.Audit().List(ctx, audit.Filter{Name: audit.TokenRevokedName})
	if len(list) != 1 || list[0].Details["token_id"] != tok.ID {
		t.Fatalf("token.revoked events = %v", list)
	}
	if err := s.DeleteToken(ctx, owner.ID, tok.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second revoke = %v", err)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM audit_events WHERE name = 'token.revoked'"); n != 1 {
		t.Fatalf("failed revoke recorded an event (%d)", n)
	}
}

func TestAuthenticateReportsFailureReason(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	_, err := s.Authenticate(ctx, "owner@example.com", "wrong wrong wrong")
	var f *LoginFailure
	if !errors.Is(err, ErrInvalidCredentials) || !errors.As(err, &f) || f.UserID != owner.ID || f.Reason != audit.ReasonWrongPassword {
		t.Fatalf("wrong password: %v %+v", err, f)
	}
	_, err = s.Authenticate(ctx, "nobody@example.com", "whatever whatever")
	if !errors.As(err, &f) || f.UserID != "" || f.Email != "" || f.Reason != audit.ReasonUnknownAccount {
		t.Fatalf("unknown account: %v %+v", err, f)
	}
}

func TestInvitationCreatedRecorded(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	inv, secret, err := s.CreateInvitation(ctx, owner, "Friend@Example.com", 0)
	if err != nil {
		t.Fatal(err)
	}
	list, _, _ := s.Audit().List(ctx, audit.Filter{Name: audit.InvitationCreatedName})
	if len(list) != 1 || *list[0].ActorID != owner.ID || list[0].Details["invitation_id"] != inv.ID ||
		list[0].Details["invited_email"] != "friend@example.com" {
		t.Fatalf("invitation.created = %+v", list)
	}
	for _, v := range list[0].Details {
		if v == secret {
			t.Fatal("invitation secret stored in the audit log")
		}
	}
	// Invalid input creates nothing and records nothing.
	if _, _, err := s.CreateInvitation(ctx, owner, "", time.Minute); err == nil {
		t.Fatal("expected invalid expiry")
	}
	if list, _, _ := s.Audit().List(ctx, audit.Filter{Name: audit.InvitationCreatedName}); len(list) != 1 {
		t.Fatalf("refused invitation recorded: %d", len(list))
	}
}

func TestInvitationRevokedRecorded(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	inv, _, err := s.CreateInvitation(ctx, owner, "", 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.RevokeInvitation(ctx, owner.ID, inv.ID); err != nil {
		t.Fatal(err)
	}
	// Second revoke is a no-op and records nothing.
	if err := s.RevokeInvitation(ctx, owner.ID, inv.ID); err != nil {
		t.Fatal(err)
	}
	list, _, _ := s.Audit().List(ctx, audit.Filter{Name: audit.InvitationRevokedName})
	if len(list) != 1 || *list[0].ActorID != owner.ID || list[0].Details["invitation_id"] != inv.ID {
		t.Fatalf("invitation.revoked = %+v", list)
	}
}

func TestInvitationAcceptedRecorded(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	inv, secret, err := s.CreateInvitation(ctx, owner, "", 0)
	if err != nil {
		t.Fatal(err)
	}
	// A refused acceptance (email taken) leaves the invitation pending and records nothing.
	if _, err := s.Register(ctx, "owner@example.com", "", "correct horse battery", secret); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("email taken: %v", err)
	}
	if list, _, _ := s.Audit().List(ctx, audit.Filter{Name: audit.InvitationAcceptedName}); len(list) != 0 {
		t.Fatalf("refused acceptance recorded: %+v", list)
	}
	u, err := s.Register(ctx, "member@example.com", "M", "correct horse battery", secret)
	if err != nil {
		t.Fatal(err)
	}
	list, _, _ := s.Audit().List(ctx, audit.Filter{Name: audit.InvitationAcceptedName})
	if len(list) != 1 || *list[0].ActorID != u.ID || list[0].Details["invitation_id"] != inv.ID || list[0].Details["email"] != "member@example.com" {
		t.Fatalf("invitation.accepted = %+v", list)
	}
}
