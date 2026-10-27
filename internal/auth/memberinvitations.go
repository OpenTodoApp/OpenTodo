package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// Membership invitations (OpenSpec change member-add-consent): adding by email
// someone the adder shares nothing with stores an invitation that the person
// accepts or declines in the app. Like project invite links they are
// server-side account data, never ops; the membership itself is written by
// the sync package when the invitee accepts, with the inviter as the actor.

// Invitation kinds: what an invitation's target id names.
const (
	InvitationProject   = "project"
	InvitationWorkspace = "workspace"
)

// MemberInvitationTTL is how long an invitation stays open, and how long a
// declined one keeps the person from being asked again.
const MemberInvitationTTL = 14 * 24 * time.Hour

// MaxOpenMemberInvitations bounds the open invitations of one project or workspace.
const MaxOpenMemberInvitations = 50

// ErrInvitationLimit: the target already has MaxOpenMemberInvitations open.
var ErrInvitationLimit = fmt.Errorf("at most %d open invitations per project or workspace", MaxOpenMemberInvitations)

// PendingMember is an owner's or admin's view of an open invitation. It never
// says whether the address belongs to an account (design D2).
type PendingMember struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	InvitedBy string `json:"invitedBy"`
	CreatedAt int64  `json:"createdAt"`
	ExpiresAt int64  `json:"expiresAt"`
}

// MemberInvitation is an open invitation as its invitee sees it.
type MemberInvitation struct {
	ID          string `json:"id"`
	Kind        string `json:"kind"`
	TargetID    string `json:"targetId"`
	Role        string `json:"role"`
	InviterID   string `json:"inviterId"`
	InviterName string `json:"inviterName"`
	CreatedAt   int64  `json:"createdAt"`
	ExpiresAt   int64  `json:"expiresAt"`
	// InviteeID is the invited account, empty for a placeholder.
	InviteeID string `json:"-"`
}

// InviteOutcome says what InviteMember did.
type InviteOutcome int

const (
	// InviteCreated: a new open invitation was stored.
	InviteCreated InviteOutcome = iota
	// InviteRefreshed: an open invitation for the address existed; its role
	// and inviter were updated.
	InviteRefreshed
	// InviteDeclined: the person declined an earlier invitation that has not
	// expired yet, so nothing was stored.
	InviteDeclined
)

// InviteMember stores an invitation to targetID of kind for email on behalf
// of inviterID. invitee is the account with that address, or nil: the row is
// then a placeholder that nobody can answer. The caller has checked the
// inviter's rights and the role.
func (s *Service) InviteMember(ctx context.Context, kind, targetID, inviterID string, invitee *User, email, role string) (*MemberInvitation, InviteOutcome, error) {
	email = normalizeEmail(email)
	inviteeID := sql.NullString{}
	if invitee != nil {
		inviteeID = sql.NullString{String: invitee.ID, Valid: true}
	}
	now := s.clock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM member_invitations WHERE kind = ? AND target_id = ? AND email = ? AND expires_at <= ?`,
		kind, targetID, email, now.UnixMilli()); err != nil {
		return nil, 0, err
	}
	inv := &MemberInvitation{Kind: kind, TargetID: targetID, Role: role, InviterID: inviterID, InviteeID: inviteeID.String}
	var declined sql.NullInt64
	err = tx.QueryRowContext(ctx, `SELECT id, created_at, expires_at, declined_at FROM member_invitations WHERE kind = ? AND target_id = ? AND email = ?`,
		kind, targetID, email).Scan(&inv.ID, &inv.CreatedAt, &inv.ExpiresAt, &declined)
	switch {
	case err == nil && declined.Valid:
		return inv, InviteDeclined, nil
	case err == nil:
		if _, err := tx.ExecContext(ctx, `UPDATE member_invitations SET role = ?, inviter_id = ?, invitee_id = ? WHERE id = ?`,
			role, inviterID, inviteeID, inv.ID); err != nil {
			return nil, 0, err
		}
		return inv, InviteRefreshed, tx.Commit()
	case !errors.Is(err, sql.ErrNoRows):
		return nil, 0, err
	}
	var open int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM member_invitations WHERE kind = ? AND target_id = ? AND declined_at IS NULL AND expires_at > ?`,
		kind, targetID, now.UnixMilli()).Scan(&open); err != nil {
		return nil, 0, err
	}
	if open >= MaxOpenMemberInvitations {
		return nil, 0, ErrInvitationLimit
	}
	inv.ID, inv.CreatedAt, inv.ExpiresAt = ids.New(), now.UnixMilli(), now.Add(MemberInvitationTTL).UnixMilli()
	if _, err := tx.ExecContext(ctx, `INSERT INTO member_invitations(id, kind, target_id, inviter_id, invitee_id, email, role, created_at, expires_at)
		VALUES(?,?,?,?,?,?,?,?,?)`, inv.ID, kind, targetID, inviterID, inviteeID, email, role, inv.CreatedAt, inv.ExpiresAt); err != nil {
		return nil, 0, err
	}
	return inv, InviteCreated, tx.Commit()
}

// PendingMembers lists the open invitations of one project or workspace,
// oldest first, placeholders included.
func (s *Service) PendingMembers(ctx context.Context, kind, targetID string) ([]PendingMember, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, email, role, inviter_id, created_at, expires_at FROM member_invitations
		WHERE kind = ? AND target_id = ? AND declined_at IS NULL AND expires_at > ? ORDER BY created_at, email`, kind, targetID, s.clock().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PendingMember{}
	for rows.Next() {
		var p PendingMember
		if err := rows.Scan(&p.ID, &p.Email, &p.Role, &p.InvitedBy, &p.CreatedAt, &p.ExpiresAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

const invitationColumns = `i.id, i.kind, i.target_id, i.role, i.inviter_id, COALESCE(u.name, ''), i.created_at, i.expires_at, COALESCE(i.invitee_id, '')`

func scanInvitation(sc interface{ Scan(...any) error }) (*MemberInvitation, error) {
	var inv MemberInvitation
	err := sc.Scan(&inv.ID, &inv.Kind, &inv.TargetID, &inv.Role, &inv.InviterID, &inv.InviterName, &inv.CreatedAt, &inv.ExpiresAt, &inv.InviteeID)
	return &inv, err
}

// MemberInvitations lists the open invitations sent to userID, newest first.
func (s *Service) MemberInvitations(ctx context.Context, userID string) ([]MemberInvitation, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+invitationColumns+` FROM member_invitations i JOIN users u ON u.id = i.inviter_id
		WHERE i.invitee_id = ? AND i.declined_at IS NULL AND i.expires_at > ? ORDER BY i.created_at DESC, i.id`, userID, s.clock().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MemberInvitation{}
	for rows.Next() {
		inv, err := scanInvitation(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *inv)
	}
	return out, rows.Err()
}

// MemberInvitationFor returns userID's open invitation id, or ErrNotFound.
func (s *Service) MemberInvitationFor(ctx context.Context, userID, id string) (*MemberInvitation, error) {
	inv, err := scanInvitation(s.db.QueryRowContext(ctx, `SELECT `+invitationColumns+` FROM member_invitations i JOIN users u ON u.id = i.inviter_id
		WHERE i.id = ? AND i.invitee_id = ? AND i.declined_at IS NULL AND i.expires_at > ?`, id, userID, s.clock().UnixMilli()))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return inv, err
}

// InviterActive reports whether an invitation's inviter may still act: the
// account exists and is not deactivated.
func (s *Service) InviterActive(ctx context.Context, inviterID string) (bool, error) {
	off, err := s.isDeactivated(ctx, s.db, inviterID)
	return !off, err
}

// DeleteMemberInvitation removes an invitation (accepted, or found stale).
func (s *Service) DeleteMemberInvitation(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM member_invitations WHERE id = ?`, id)
	return err
}

// DeclineMemberInvitation marks userID's open invitation id declined; it stays
// stored until it expires so the person is not asked again meanwhile.
func (s *Service) DeclineMemberInvitation(ctx context.Context, userID, id string) (*MemberInvitation, error) {
	inv, err := s.MemberInvitationFor(ctx, userID, id)
	if err != nil {
		return nil, err
	}
	res, err := s.db.ExecContext(ctx, `UPDATE member_invitations SET declined_at = ? WHERE id = ? AND declined_at IS NULL`, s.clock().UnixMilli(), id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return inv, nil
}

// CancelMemberInvitation deletes the open invitation id of one project or
// workspace and returns it, or ErrNotFound.
func (s *Service) CancelMemberInvitation(ctx context.Context, kind, targetID, id string) (*MemberInvitation, error) {
	inv, err := scanInvitation(s.db.QueryRowContext(ctx, `SELECT `+invitationColumns+` FROM member_invitations i LEFT JOIN users u ON u.id = i.inviter_id
		WHERE i.id = ? AND i.kind = ? AND i.target_id = ? AND i.declined_at IS NULL AND i.expires_at > ?`, id, kind, targetID, s.clock().UnixMilli()))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	res, err := s.db.ExecContext(ctx, `DELETE FROM member_invitations WHERE id = ? AND declined_at IS NULL`, id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return inv, nil
}

// PruneMemberInvitations deletes expired invitations, declined ones included
// (run with the hourly pruner).
func (s *Service) PruneMemberInvitations(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM member_invitations WHERE expires_at <= ?`, s.clock().UnixMilli())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
