package mcpoauth

import (
	"context"
	"database/sql"
	"errors"
	"testing"
)

// Revoking a grant deletes its access token in the same transaction: when the
// token cannot be deleted, the grant stays as it was, so a revoked grant never
// leaves a working access token behind.
func TestRevokeGrantDeletesTheTokenInTheSameTransaction(t *testing.T) {
	s, _ := appStore(t)
	ctx := context.Background()
	c, _, err := s.CreateClient(ctx, "Example", []string{"https://example.com/cb"}, "read", false, "u1")
	if err != nil {
		t.Fatal(err)
	}
	g, _, err := s.UpsertGrant(ctx, c.ID, "u1", "read", nil)
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := s.SwapGrantToken(ctx, g.ID, g.TokenID, "tok1"); err != nil || !ok {
		t.Fatalf("swap: %v %v", ok, err)
	}

	boom := errors.New("delete failed")
	if err := s.RevokeGrant(ctx, g.ID, func(*sql.Tx, string) error { return boom }); !errors.Is(err, boom) {
		t.Fatalf("a failed token delete must fail the revoke, got %v", err)
	}
	after, err := s.GrantByID(ctx, g.ID)
	if err != nil {
		t.Fatal(err)
	}
	if after.Revoked() || after.TokenID != "tok1" {
		t.Fatalf("a failed revoke must leave the grant as it was: revoked=%v token=%q", after.Revoked(), after.TokenID)
	}

	var deleted []string
	if err := s.RevokeGrant(ctx, g.ID, func(_ *sql.Tx, id string) error { deleted = append(deleted, id); return nil }); err != nil {
		t.Fatal(err)
	}
	after, err = s.GrantByID(ctx, g.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !after.Revoked() || after.TokenID != "" || len(deleted) != 1 || deleted[0] != "tok1" {
		t.Fatalf("revoked=%v token=%q deleted=%v", after.Revoked(), after.TokenID, deleted)
	}

	if err := s.RevokeGrant(ctx, "missing", func(*sql.Tx, string) error { return nil }); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an unknown grant: %v", err)
	}
}
