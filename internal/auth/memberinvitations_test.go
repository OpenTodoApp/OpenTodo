package auth

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

// member-add-consent D3: one row per target and address, refreshed while
// open, kept after a decline until it expires, at most 50 open per target,
// pruned once expired, and dropped with the inviter's deactivation.
func TestMemberInvitationStore(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, true)
	now := time.Now()
	s.SetClock(func() time.Time { return now })
	owner := mustOwner(t, s)
	bob, err := s.Register(ctx, "bob@example.com", "Bob", "correct horse battery", "")
	if err != nil {
		t.Fatal(err)
	}

	inv, outcome, err := s.InviteMember(ctx, InvitationProject, "p1", owner.ID, bob, " BOB@example.com ", "viewer")
	if err != nil || outcome != InviteCreated || inv.InviteeID != bob.ID || inv.ExpiresAt != now.Add(MemberInvitationTTL).UnixMilli() {
		t.Fatalf("create = %+v %v %v", inv, outcome, err)
	}
	placeholder, outcome, err := s.InviteMember(ctx, InvitationProject, "p1", owner.ID, nil, "nobody@example.com", "viewer")
	if err != nil || outcome != InviteCreated || placeholder.InviteeID != "" {
		t.Fatalf("placeholder = %+v %v %v", placeholder, outcome, err)
	}
	again, outcome, err := s.InviteMember(ctx, InvitationProject, "p1", owner.ID, bob, "bob@example.com", "editor")
	if err != nil || outcome != InviteRefreshed || again.ID != inv.ID {
		t.Fatalf("refresh = %+v %v %v", again, outcome, err)
	}
	pending, err := s.PendingMembers(ctx, InvitationProject, "p1")
	if err != nil || len(pending) != 2 || pending[0].Email != "bob@example.com" || pending[0].Role != "editor" || pending[1].Email != "nobody@example.com" {
		t.Fatalf("pending = %+v %v", pending, err)
	}
	mine, err := s.MemberInvitations(ctx, bob.ID)
	if err != nil || len(mine) != 1 || mine[0].InviterName != "Owner" || mine[0].Role != "editor" {
		t.Fatalf("bob's = %+v %v", mine, err)
	}
	if _, err := s.MemberInvitationFor(ctx, owner.ID, inv.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("someone else's invitation = %v", err)
	}

	// A decline is kept, so asking again stores nothing until it expires.
	if _, err := s.DeclineMemberInvitation(ctx, bob.ID, inv.ID); err != nil {
		t.Fatal(err)
	}
	if _, outcome, err := s.InviteMember(ctx, InvitationProject, "p1", owner.ID, bob, "bob@example.com", "viewer"); err != nil || outcome != InviteDeclined {
		t.Fatalf("after decline = %v %v", outcome, err)
	}
	if mine, _ := s.MemberInvitations(ctx, bob.ID); len(mine) != 0 {
		t.Fatalf("declined still listed: %+v", mine)
	}

	// Cancel removes an open one; an unknown or answered id is not found.
	if _, err := s.CancelMemberInvitation(ctx, InvitationProject, "p1", placeholder.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CancelMemberInvitation(ctx, InvitationProject, "p1", inv.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cancel a declined one = %v", err)
	}

	// At most 50 open per target.
	for i := 0; i < MaxOpenMemberInvitations; i++ {
		if _, _, err := s.InviteMember(ctx, InvitationWorkspace, "w1", owner.ID, nil, fmt.Sprintf("p%d@example.com", i), "member"); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := s.InviteMember(ctx, InvitationWorkspace, "w1", owner.ID, nil, "one-more@example.com", "member"); !errors.Is(err, ErrInvitationLimit) {
		t.Fatalf("51st = %v", err)
	}

	// Expired rows, declined ones included, are pruned; a new ask then works.
	now = now.Add(MemberInvitationTTL + time.Minute)
	if n, err := s.PruneMemberInvitations(ctx); err != nil || n != 51 {
		t.Fatalf("pruned %d %v", n, err)
	}
	if _, outcome, err := s.InviteMember(ctx, InvitationProject, "p1", owner.ID, bob, "bob@example.com", "viewer"); err != nil || outcome != InviteCreated {
		t.Fatalf("after expiry = %v %v", outcome, err)
	}

	// Deactivating the inviter drops their open invitations.
	if _, _, err := s.InviteMember(ctx, InvitationProject, "p2", bob.ID, nil, "someone@example.com", "viewer"); err != nil {
		t.Fatal(err)
	}
	if active, err := s.InviterActive(ctx, bob.ID); err != nil || !active {
		t.Fatalf("active = %v %v", active, err)
	}
	if _, err := s.Deactivate(ctx, owner.ID, bob.ID); err != nil {
		t.Fatal(err)
	}
	if active, _ := s.InviterActive(ctx, bob.ID); active {
		t.Fatal("a deactivated inviter is active")
	}
	if pending, _ := s.PendingMembers(ctx, InvitationProject, "p2"); len(pending) != 0 {
		t.Fatalf("a deactivated inviter's invitations stay: %+v", pending)
	}
}
