package auth

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
)

// A token limited to workspaces (token-workspaces D1): its secret starts with
// otw_, it resolves with its workspaces, the list shows them, and the secret
// hashed the way an older binary hashes it finds no token.
func TestTokenLimitedToWorkspaces(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	tok, plain, err := s.CreateTokenIn(ctx, owner.ID, "Work assistant", ScopeAgent, []string{"ws-work", "ws-work", "ws-side"})
	if err != nil || !strings.HasPrefix(plain, "otw_") {
		t.Fatalf("create = %v, %q", err, plain)
	}
	_, info, err := s.UserByTokenInfo(ctx, plain)
	if err != nil || info.Scope != ScopeAgent || !slices.Equal(info.Workspaces, []string{"ws-work", "ws-side"}) {
		t.Fatalf("resolve = %+v, %v", info, err)
	}
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM api_tokens WHERE token_hash = ?", hashToken(plain)).Scan(&n); err != nil || n != 0 {
		t.Fatalf("an older binary's lookup finds %d tokens (%v)", n, err)
	}
	list, err := s.ListTokens(ctx, owner.ID)
	if err != nil || len(list) != 1 || list[0].ID != tok.ID || !slices.Equal(list[0].Workspaces, []string{"ws-work", "ws-side"}) {
		t.Fatalf("list = %+v, %v", list, err)
	}
	// Every row gone: restricted to nothing, never widened to everything.
	if _, err := db.Exec("DELETE FROM api_token_workspaces WHERE token_id = ?", tok.ID); err != nil {
		t.Fatal(err)
	}
	if _, info, err = s.UserByTokenInfo(ctx, plain); err != nil || info.Workspaces == nil || len(info.Workspaces) != 0 {
		t.Fatalf("after the rows went = %+v, %v", info, err)
	}
	// A plain token is unchanged: every workspace.
	_, plainAll, err := s.CreateTokenScoped(ctx, owner.ID, "All", ScopeFull)
	if err != nil || !strings.HasPrefix(plainAll, "ot_") {
		t.Fatal(err)
	}
	if _, info, err = s.UserByTokenInfo(ctx, plainAll); err != nil || info.Workspaces != nil {
		t.Fatalf("unrestricted = %+v, %v", info, err)
	}
	if _, _, err := s.CreateTokenIn(ctx, owner.ID, "None", ScopeFull, nil); !errors.Is(err, ErrInvalidWorkspaces) {
		t.Fatalf("no workspaces = %v", err)
	}
}
